"""Starlette ASGI backend for FluidScope AI Aerospace Telemetry Bench."""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any
from starlette.applications import Starlette
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import Mount, Route
from starlette.staticfiles import StaticFiles

from fluidscope.core.sym_auditor import audit_assumptions
from fluidscope.core.kinematics import analyze_kinematics
from fluidscope.core.vortex import (
    solve_vortex_flow,
    solve_rotating_vessel,
    solve_potential_superposition,
)
from fluidscope.core.boundary_viscous import (
    solve_falkner_skan,
    solve_boundary_layer_separation,
    solve_couette_poiseuille,
    solve_two_layer_poiseuille,
    solve_slip_and_herschel_bulkley,
)
from fluidscope.core.conservation import (
    solve_hydraulic_jump,
    solve_sudden_expansion,
    solve_accelerating_tank,
)
from fluidscope.core.lbm_tunnel import simulate_lbm_tunnel
from fluidscope.ai.schemas import LLMConfig, ParsedPhysicsQuery
from fluidscope.ai.problem_parser import parse_problem
from fluidscope.ai.doubt_coach import answer_doubt
from fluidscope.data.twist_bank import TWIST_PROBLEMS


WEB_DIR = Path(__file__).resolve().parent.parent / "web"


def _error_response(exc: Exception, status: int = 400) -> JSONResponse:
    return JSONResponse({"ok": False, "error": str(exc)}, status_code=status)


_FAVICON_SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
    '<rect width="32" height="32" rx="6" fill="#1D4ED8"/>'
    '<path d="M5 17c4-6 8-6 11 0s7 6 11 0" fill="none" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round"/>'
    '</svg>'
)


async def favicon(_request: Request) -> Response:
    return Response(_FAVICON_SVG, media_type="image/svg+xml", status_code=200)


async def health(_request: Request) -> JSONResponse:
    return JSONResponse({
        "ok": True,
        "kernel": "SymPy+SciPy+Numba+AI",
        "stations_ready": ["01", "02", "03", "04", "05"],
    })


async def api_audit(request: Request) -> JSONResponse:
    try:
        body: dict[str, Any] = await request.json() if await request.body() else {}
        return JSONResponse({"ok": True, "data": audit_assumptions(body)})
    except Exception as exc:
        return _error_response(exc)


async def api_kinematics(request: Request) -> JSONResponse:
    try:
        body: dict[str, Any] = await request.json()
        data = await asyncio.wait_for(
            asyncio.to_thread(
                analyze_kinematics,
                u_str=body.get("u_str", "x / (t + t0)"),
                v_str=body.get("v_str", "v0"),
                params=body.get("params", {"t0": 1.0, "v0": 1.0}),
                x0=float(body.get("x0", 1.0)),
                y0=float(body.get("y0", 0.0)),
                t0=float(body.get("t0", 1.0)),
                t_eval=float(body.get("t_eval", 2.0)),
                bounds=tuple(float(v) for v in body.get("bounds", [-1.0, 7.0, -1.0, 4.0])),
                loop_center=tuple(float(v) for v in body.get("loop_center", [2.0, 1.0])),
                loop_radius=float(body.get("loop_radius", 0.8)),
            ),
            timeout=6.0,
        )
        return JSONResponse({"ok": True, "data": data})
    except asyncio.TimeoutError:
        return JSONResponse(
            {
                "ok": False,
                "error": "Kinematics calculation timed out (>6s). Check for strong singularities near the seed point.",
            },
            status_code=400,
        )
    except Exception as exc:
        return _error_response(exc)


async def api_vortex(request: Request) -> JSONResponse:
    try:
        body: dict[str, Any] = await request.json()
        data = solve_vortex_flow(
            mode=body.get("mode", "forced"),
            strength_c=float(body.get("strength_c", 0.9)),
            omega=float(body.get("omega", 10.0)),
            core_radius=float(body.get("core_radius", 0.30)),
            radial_c2=float(body.get("radial_c2", -0.35)),
            rho=float(body.get("rho", 1000.0)),
            r_min=float(body.get("r_min", 0.05)),
            r_max=float(body.get("r_max", 0.60)),
            r1=float(body.get("r1", 0.15)),
            r2=float(body.get("r2", 0.45)),
            p1=float(body.get("p1", 0.0)),
        )
        return JSONResponse({"ok": True, "data": data})
    except Exception as exc:
        return _error_response(exc)


async def api_vessel(request: Request) -> JSONResponse:
    try:
        body: dict[str, Any] = await request.json()
        data = solve_rotating_vessel(
            radius=float(body.get("radius", 0.30)),
            vessel_height=float(body.get("vessel_height", 0.503)),
            initial_depth=float(body.get("initial_depth", 0.503)),
            rpm=float(body.get("rpm", 100.0)),
            rho=float(body.get("rho", 1000.0)),
        )
        v_swirl = solve_vortex_flow(mode="forced", omega=data["omega"], r_min=0.0, r_max=data["radius"])
        data["field_2d"] = v_swirl["field_2d"]
        return JSONResponse({"ok": True, "data": data})
    except Exception as exc:
        return _error_response(exc)


async def api_potential(request: Request) -> JSONResponse:
    try:
        body: dict[str, Any] = await request.json()
        data = solve_potential_superposition(
            u_inf=float(body.get("u_inf", 2.0)),
            alpha_deg=float(body.get("alpha_deg", 0.0)),
            sources=body.get("sources", []),
            doublets=body.get("doublets", []),
            vortices=body.get("vortices", []),
            rho=float(body.get("rho", 1.225)),
        )
        return JSONResponse({"ok": True, "data": data})
    except Exception as exc:
        return _error_response(exc)


def _profile_to_2d_field(ys: list[float], us: list[float], x_min: float = 0.0, x_max: float = 1.0) -> dict[str, Any]:
    """Synthesize a clean 2D fully-developed (x, y) flow field from u(y) for 60fps tracer visualization."""
    import numpy as np
    nx = 18
    xs = [float(v) for v in np.linspace(x_min, x_max, nx)]
    step = max(1, len(ys) // 25)
    y_sub = [float(ys[i]) for i in range(0, len(ys), step)]
    u_sub = [float(us[i]) for i in range(0, len(us), step)]
    if ys[-1] != y_sub[-1]:
        y_sub.append(float(ys[-1]))
        u_sub.append(float(us[-1]))
    U = [[u_val for _ in xs] for u_val in u_sub]
    V = [[0.0 for _ in xs] for _ in u_sub]
    return {
        "bounds": [x_min, x_max, float(y_sub[0]), float(y_sub[-1])],
        "xs": xs,
        "ys": y_sub,
        "U": U,
        "V": V,
    }


async def api_falkner_skan(request: Request) -> JSONResponse:
    try:
        body: dict[str, Any] = await request.json()
        data = solve_falkner_skan(beta=float(body.get("beta", 0.0)))
        data["field_2d"] = _profile_to_2d_field(data["eta"], data["u_over_U"], 0.0, 4.0)
        return JSONResponse({"ok": True, "data": data})
    except Exception as exc:
        return _error_response(exc)


async def api_bl_separation(request: Request) -> JSONResponse:
    try:
        body: dict[str, Any] = await request.json()
        data = solve_boundary_layer_separation(lambda_pg=float(body.get("lambda_pg", -6.0)))
        data["field_2d"] = _profile_to_2d_field(data["eta"], data["u"], 0.0, 2.0)
        return JSONResponse({"ok": True, "data": data})
    except Exception as exc:
        return _error_response(exc)


async def api_couette_poiseuille(request: Request) -> JSONResponse:
    try:
        body: dict[str, Any] = await request.json()
        data = solve_couette_poiseuille(
            P=float(body.get("P", 0.0)),
            H=float(body.get("H", 0.003)),
            U=float(body.get("U", 0.30)),
            mu=float(body.get("mu", 4.7e-4)),
        )
        data["field_2d"] = _profile_to_2d_field(data["y_over_H"], data["u_over_U"], 0.0, 2.0)
        return JSONResponse({"ok": True, "data": data})
    except Exception as exc:
        return _error_response(exc)


async def api_two_layer(request: Request) -> JSONResponse:
    try:
        body: dict[str, Any] = await request.json()
        data = solve_two_layer_poiseuille(
            H=float(body.get("H", 0.002)),
            mu1=float(body.get("mu1", 0.004)),
            mu2=float(body.get("mu2", 0.001)),
            dp_dx=float(body.get("dp_dx", -1000.0)),
        )
        u_max = max(abs(u) for u in data["u_true"]) or 1.0
        data["field_2d"] = _profile_to_2d_field(data["y_over_H"], [u / u_max for u in data["u_true"]], 0.0, 2.5)
        return JSONResponse({"ok": True, "data": data})
    except Exception as exc:
        return _error_response(exc)


async def api_slip_hb(request: Request) -> JSONResponse:
    try:
        body: dict[str, Any] = await request.json()
        data = solve_slip_and_herschel_bulkley(
            H=float(body.get("H", 0.001)),
            dp_dx=float(body.get("dp_dx", -12000.0)),
            K=float(body.get("K", 0.015)),
            n=float(body.get("n", 0.65)),
            tau_y=float(body.get("tau_y", 2.0)),
            slip_length=float(body.get("slip_length", 0.0002)),
        )
        u_scale = max(abs(u) for u in data["u_true"] + data["u_newton_noslip"]) or 1.0
        data["field_2d"] = _profile_to_2d_field(data["y_over_H"], [u / u_scale for u in data["u_true"]], 0.0, 2.5)
        return JSONResponse({"ok": True, "data": data})
    except Exception as exc:
        return _error_response(exc)


async def api_hydraulic_jump(request: Request) -> JSONResponse:
    try:
        body: dict[str, Any] = await request.json()
        data = solve_hydraulic_jump(
            width=float(body.get("width", 6.1)),
            v1=float(body.get("v1", 6.1)),
            h1=float(body["h1"]) if body.get("h1") is not None else None,
            discharge=float(body["discharge"]) if body.get("discharge") is not None else None,
        )
        return JSONResponse({"ok": True, "data": data})
    except Exception as exc:
        return _error_response(exc)


async def api_sudden_expansion(request: Request) -> JSONResponse:
    try:
        body: dict[str, Any] = await request.json()
        data = solve_sudden_expansion(
            D1=float(body.get("D1", 0.10)),
            D2=float(body.get("D2", 0.20)),
            V1=float(body.get("V1", 4.0)),
            rho=float(body.get("rho", 1000.0)),
        )
        return JSONResponse({"ok": True, "data": data})
    except Exception as exc:
        return _error_response(exc)


async def api_accel_tank(request: Request) -> JSONResponse:
    try:
        body: dict[str, Any] = await request.json()
        data = solve_accelerating_tank(
            length=float(body.get("length", 1.2)),
            h0=float(body.get("h0", 0.50)),
            tank_height=float(body.get("tank_height", 0.80)),
            ax=float(body.get("ax", 3.0)),
            az=float(body.get("az", 0.0)),
        )
        return JSONResponse({"ok": True, "data": data})
    except Exception as exc:
        return _error_response(exc)


async def api_lbm_tunnel(request: Request) -> JSONResponse:
    try:
        body: dict[str, Any] = await request.json()
        obstacles = body.get("obstacles") if body.get("obstacles") is not None else body.get("customObstacles")
        preset = body.get("preset", "cylinder")
        if isinstance(obstacles, list) and len(obstacles) > 0 and (
            body.get("customObstacles") is not None or "preset" not in body or preset == "custom"
        ):
            preset = "custom"
        data = await asyncio.wait_for(
            asyncio.to_thread(
                simulate_lbm_tunnel,
                preset=preset,
                reynolds=float(body.get("reynolds", 100.0)),
                n_steps=int(body.get("n_steps", 450)),
                obstacles=obstacles,
            ),
            timeout=10.0,
        )
        return JSONResponse({"ok": True, "data": data})
    except asyncio.TimeoutError:
        return JSONResponse(
            {"ok": False, "error": "LBM simulation timed out (>10s). Try lowering step count."},
            status_code=400,
        )
    except Exception as exc:
        return _error_response(exc)


def _dispatch_parsed_solver(parsed: ParsedPhysicsQuery) -> dict[str, Any] | None:
    p = parsed.params or {}
    fam = parsed.family
    if fam == "kinematics_equation":
        return analyze_kinematics(
            u_str=str(p.get("u_str", "x / (t + t0)")),
            v_str=str(p.get("v_str", "v0")),
            params=p.get("params", {"t0": 1.0, "v0": 1.0}),
            x0=float(p.get("x0", 1.0)),
            y0=float(p.get("y0", 0.0)),
            t0=float(p.get("t0", 1.0)),
            t_eval=float(p.get("t_eval", 2.0)),
            bounds=(-2.5, 6.5, -2.5, 4.0),
        )
    if fam == "vortex_flow":
        return solve_vortex_flow(
            mode=str(p.get("mode", "forced")),
            strength_c=float(p.get("strength_c", 0.9)),
            omega=float(p.get("omega", 10.0)),
            core_radius=float(p.get("core_radius", 0.30)),
            r1=float(p.get("r1", 0.15)),
            r2=float(p.get("r2", 0.45)),
            r_max=float(p.get("r_max", 0.60)),
        )
    if fam == "rotating_vessel":
        d = solve_rotating_vessel(
            radius=float(p.get("radius", 0.30)),
            vessel_height=float(p.get("vessel_height", 0.503)),
            initial_depth=float(p.get("initial_depth", p.get("vessel_height", 0.503))),
            rpm=float(p.get("rpm", 130.0)),
        )
        v_swirl = solve_vortex_flow(mode="forced", omega=d["omega"], r_min=0.0, r_max=d["radius"])
        d["field_2d"] = v_swirl["field_2d"]
        return d
    if fam == "potential_superposition":
        return solve_potential_superposition(
            u_inf=float(p.get("u_inf", 2.0)),
            alpha_deg=float(p.get("alpha_deg", 0.0)),
            sources=p.get("sources", []),
            doublets=p.get("doublets", [{"x": 0.0, "y": 0.0, "kappa": 12.566}]),
            vortices=p.get("vortices", [{"x": 0.0, "y": 0.0, "gamma": -12.566}]),
        )
    if fam == "falkner_skan":
        d = solve_falkner_skan(beta=float(p.get("beta", -0.15)))
        d["field_2d"] = _profile_to_2d_field(d["eta"], d["u_over_U"], 0.0, 4.0)
        return d
    if fam == "bl_separation":
        d = solve_boundary_layer_separation(lambda_pg=float(p.get("lambda_pg", -14.0)))
        d["field_2d"] = _profile_to_2d_field(d["eta"], d["u"], 0.0, 2.0)
        return d
    if fam == "couette_poiseuille":
        d = solve_couette_poiseuille(P=float(p.get("P", -3.0)))
        d["field_2d"] = _profile_to_2d_field(d["y_over_H"], d["u_over_U"], 0.0, 2.0)
        return d
    if fam == "two_layer_poiseuille":
        d = solve_two_layer_poiseuille(
            mu1=float(p.get("mu1", 0.005)),
            mu2=float(p.get("mu2", 0.001)),
            dp_dx=float(p.get("dp_dx", -1000.0)),
        )
        um = max(abs(u) for u in d["u_true"]) or 1.0
        d["field_2d"] = _profile_to_2d_field(d["y_over_H"], [u / um for u in d["u_true"]], 0.0, 2.5)
        return d
    if fam == "slip_herschel_bulkley":
        d = solve_slip_and_herschel_bulkley(
            n=float(p.get("n", 0.65)),
            tau_y=float(p.get("tau_y", 2.5)),
            slip_length=float(p.get("slip_length", 0.00025)),
        )
        us = max(abs(u) for u in d["u_true"] + d["u_newton_noslip"]) or 1.0
        d["field_2d"] = _profile_to_2d_field(d["y_over_H"], [u / us for u in d["u_true"]], 0.0, 2.5)
        return d
    if fam == "hydraulic_jump":
        return solve_hydraulic_jump(
            width=float(p.get("width", 6.1)),
            v1=float(p.get("v1", 6.1)),
            h1=float(p["h1"]) if p.get("h1") is not None else None,
            discharge=float(p["discharge"]) if p.get("discharge") is not None else None,
        )
    if fam == "sudden_expansion":
        return solve_sudden_expansion(
            D1=float(p.get("D1", 0.10)),
            D2=float(p.get("D2", 0.20)),
            V1=float(p.get("V1", 4.0)),
        )
    if fam == "accelerating_tank":
        return solve_accelerating_tank(
            ax=float(p.get("ax", 0.0)),
            az=float(p.get("az", -9.81)),
            h0=float(p.get("h0", 0.50)),
        )
    if fam == "lbm_tunnel":
        obs = [o.model_dump() for o in parsed.obstacles] if parsed.obstacles else None
        return simulate_lbm_tunnel(
            preset=str(p.get("preset", "cylinder")),
            reynolds=float(p.get("reynolds", 105.0)),
            n_steps=int(p.get("n_steps", 400)),
            obstacles=obs,
        )
    return None


async def api_parse_and_solve(request: Request) -> JSONResponse:
    try:
        body: dict[str, Any] = await request.json()
        text = str(body.get("text", "")).strip()
        cfg = LLMConfig.model_validate(body.get("llm_config") or {})
        parsed = await asyncio.wait_for(asyncio.to_thread(parse_problem, text, cfg), timeout=10.0)
        solver_data = await asyncio.wait_for(asyncio.to_thread(_dispatch_parsed_solver, parsed), timeout=8.0)
        if parsed.family == "kinematics_equation" and isinstance(solver_data, dict) and "classification" in solver_data:
            cls = solver_data["classification"]
            for flag in ("steady", "incompressible", "irrotational"):
                if flag in cls:
                    parsed.assumptions[flag] = bool(cls[flag])
        audit = audit_assumptions(parsed.assumptions)
        return JSONResponse({
            "ok": True,
            "data": {
                "parsed": parsed.model_dump(),
                "audit": audit,
                "solver_data": solver_data,
            },
        })
    except asyncio.TimeoutError:
        return JSONResponse(
            {
                "ok": False,
                "error": "Solver timed out (>8s). The equation may contain a severe singularity or high stiffness.",
            },
            status_code=400,
        )
    except Exception as exc:
        return _error_response(exc)


async def api_coach(request: Request) -> JSONResponse:
    try:
        body: dict[str, Any] = await request.json()
        question = str(body.get("question", "")).strip()
        cfg = LLMConfig.model_validate(body.get("llm_config") or {})
        parsed = ParsedPhysicsQuery.model_validate(body["parsed"]) if body.get("parsed") else None
        solver_data = body.get("solver_data")
        reply = answer_doubt(question, parsed, solver_data, cfg)
        return JSONResponse({"ok": True, "data": reply.model_dump()})
    except Exception as exc:
        return _error_response(exc)


async def api_twists(_request: Request) -> JSONResponse:
    return JSONResponse({"ok": True, "data": TWIST_PROBLEMS})


def create_app() -> Starlette:
    routes = [
        Route("/favicon.ico", favicon, methods=["GET"]),
        Route("/api/health", health, methods=["GET"]),
        Route("/api/audit", api_audit, methods=["POST"]),
        Route("/api/kinematics", api_kinematics, methods=["POST"]),
        Route("/api/vortex", api_vortex, methods=["POST"]),
        Route("/api/vessel", api_vessel, methods=["POST"]),
        Route("/api/potential", api_potential, methods=["POST"]),
        Route("/api/falkner_skan", api_falkner_skan, methods=["POST"]),
        Route("/api/bl_separation", api_bl_separation, methods=["POST"]),
        Route("/api/couette_poiseuille", api_couette_poiseuille, methods=["POST"]),
        Route("/api/two_layer", api_two_layer, methods=["POST"]),
        Route("/api/slip_hb", api_slip_hb, methods=["POST"]),
        Route("/api/hydraulic_jump", api_hydraulic_jump, methods=["POST"]),
        Route("/api/sudden_expansion", api_sudden_expansion, methods=["POST"]),
        Route("/api/accel_tank", api_accel_tank, methods=["POST"]),
        Route("/api/lbm_tunnel", api_lbm_tunnel, methods=["POST"]),
        Route("/api/parse_and_solve", api_parse_and_solve, methods=["POST"]),
        Route("/api/coach", api_coach, methods=["POST"]),
        Route("/api/twists", api_twists, methods=["GET"]),
    ]
    if WEB_DIR.exists():
        routes.append(Mount("/", app=StaticFiles(directory=str(WEB_DIR), html=True), name="static"))

    app = Starlette(routes=routes)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    return app


app = create_app()
