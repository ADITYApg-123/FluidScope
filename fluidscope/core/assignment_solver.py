"""SymPy + Gemini AI Dynamic Solver & Derivation Engine for Homework Assignments (HW 1-7).

Provides:
1. Exact SymPy + SciPy numerical re-solving when students customize velocity fields u(x,y,t), v(x,y,t)
   in HW 1 (unsteady flow lines) or HW 2 (planar stagnation/kinematics).
2. Deterministic SymPy step-by-step derivations (offline fallback, zero hallucination).
3. Optional Google Gemini (google-genai) / OpenAI-compatible step-by-step derivation formatting
   strictly grounded to the verified SymPy expressions and numerical probe metrics.
"""

from __future__ import annotations

from typing import Any
import math
import sympy as sp

from fluidscope.ai.llm_client import call_llm_json
from fluidscope.ai.schemas import LLMConfig
from fluidscope.core.kinematics import _T, _X, _Y, analyze_kinematics, safe_parse_velocity


def _safe_latex(expr: sp.Expr) -> str:
    try:
        return sp.latex(expr)
    except Exception:
        return str(expr)


def _try_symbolic_streamline_tex(u_expr: sp.Expr, v_expr: sp.Expr) -> str | None:
    """Attempt quick separation/classification of dy/dx = v/u without risking hangs."""
    try:
        if u_expr == 0:
            return r"x = x_0 \quad (\text{vertical streamlines, } u \equiv 0)"
        if v_expr == 0:
            return r"y = y_0 \quad (\text{horizontal streamlines, } v \equiv 0)"

        # Quick separable check: if (v/u) factors cleanly into g(x) * h(y) at fixed t
        ratio = sp.simplify(v_expr / u_expr)
        sep = sp.separatevars(ratio, symbols=[_X, _Y], dict=True)
        if isinstance(sep, dict) and sep.get("coeff") is not None:
            gx = sp.simplify(sep.get(_X, 1) * sep["coeff"])
            hy = sp.simplify(sep.get(_Y, 1))
            if not gx.has(_Y) and not hy.has(_X) and hy != 0:
                lhs = sp.integrate(1 / hy, _Y)
                rhs = sp.integrate(gx, _X)
                if not lhs.has(sp.Integral) and not rhs.has(sp.Integral):
                    return rf"{sp.latex(lhs)} = {sp.latex(rhs)} + C"
    except Exception:
        pass
    return None


def _build_deterministic_steps(
    hw_id: str,
    u_str: str,
    v_str: str,
    sym_info: dict[str, Any],
    kin_data: dict[str, Any],
    params: dict[str, float],
    x0: float,
    y0: float,
    t0: float,
    t_eval: float,
) -> dict[str, list[dict[str, str]]]:
    """Generate verified offline KaTeX derivation steps anchored to SymPy outputs."""
    u_tex = sym_info["u_tex"]
    v_tex = sym_info["v_tex"]
    div_tex = sym_info["div_tex"]
    vort_tex = sym_info["vort_tex"]
    stream_ode_tex = sym_info["stream_ode_tex"]
    stream_sol_tex = sym_info["stream_sol_tex"]
    cls = kin_data.get("classification", {})
    pr = kin_data.get("point_probe", {})

    steady_txt = "steady ($\\partial\\mathbf{u}/\\partial t = 0$)" if cls.get("steady") else "unsteady ($\\partial\\mathbf{u}/\\partial t \\neq 0$)"
    incomp_txt = "incompressible ($\\nabla\\cdot\\mathbf{u} \\equiv 0$)" if cls.get("incompressible") else "compressible / nonzero divergence"
    irrot_txt = "irrotational ($\\omega_z \\equiv 0$)" if cls.get("irrotational") else "rotational ($\\omega_z \\neq 0$)"

    if hw_id == "hw2":
        ax_tex = sym_info["du_dx_tex"]
        sxy_tex = sym_info["s_xy_tex"]
        by_tex = sym_info["dv_dy_tex"]
        return {
            "a": [
                {
                    "title": "Streamline Differential Equation",
                    "explanation": f"For the customized field $u = {u_tex}$, $v = {v_tex}$, set $dy/dx = v/u$:",
                    "equation_tex": rf"\frac{{dy}}{{dx}} = {stream_ode_tex}",
                },
                {
                    "title": "Symbolic Streamline Family",
                    "explanation": "Integrating (when separable) or integrating numerically from seed points:",
                    "equation_tex": stream_sol_tex or rf"\frac{{dx}}{{{u_tex}}} = \frac{{dy}}{{{v_tex}}}",
                },
            ],
            "b": [
                {
                    "title": "Lagrangian Particle ODEs",
                    "explanation": f"Particles follow $\\dot{{x}} = u(x,y,t)$ and $\\dot{{y}} = v(x,y,t)$ starting from $({x0:.3g}, {y0:.3g})$ at $t_0={t0:.3g}$:",
                    "equation_tex": rf"\frac{{dx}}{{dt}} = {u_tex}, \qquad \frac{{dy}}{{dt}} = {v_tex}",
                },
                {
                    "title": "Evaluated Parcel State",
                    "explanation": f"At $t = {t_eval:.3g}\\,\\text{{s}}$, RK45 tracks the parcel tip and its velocity:",
                    "equation_tex": (
                        rf"(x_p, y_p) = ({kin_data['curves']['pathline'][-1][0]:.4g},\; {kin_data['curves']['pathline'][-1][1]:.4g}),"
                        rf"\quad \mathbf{{u}}(x_0, y_0, t) = ({pr.get('u', 0):.4g},\; {pr.get('v', 0):.4g})"
                    ),
                },
            ],
            "c": [
                {
                    "title": "Material Element Strain & Area Rate",
                    "explanation": f"Local area dilatation rate equals $\\nabla\\cdot\\mathbf{{u}} = {div_tex}$. Zero divergence preserves area exactly.",
                    "equation_tex": rf"\frac{{1}}{{\mathcal{{A}}}}\frac{{d\mathcal{{A}}}}{{dt}} = \nabla\cdot\mathbf{{u}} = {div_tex}",
                },
            ],
            "d": [
                {
                    "title": "Velocity Gradient & Strain-Rate Tensor",
                    "explanation": "Decomposing $\\nabla\\mathbf{u} = \\mathbf{S} + \\mathbf{\\Omega}$ symmetrically splits stretching/shearing from rotation:",
                    "equation_tex": rf"\mathbf{{S}} = \begin{{pmatrix}} {ax_tex} & {sxy_tex} \\ {sxy_tex} & {by_tex} \end{{pmatrix}}, \qquad \Omega_z = {vort_tex}",
                },
            ],
            "e": [
                {
                    "title": "Incompressibility & Irrotationality Verdict",
                    "explanation": f"SymPy proves this flow is {steady_txt}, {incomp_txt}, and {irrot_txt}.",
                    "equation_tex": rf"\nabla\cdot\mathbf{{u}} = {div_tex}, \qquad \Omega_z = {vort_tex}, \qquad \omega_z = \frac{{1}}{{2}}\Omega_z = {sym_info['rot_tex']}",
                },
            ],
        }

    # Default HW 1 kinematics breakdown
    curve_cmp = (
        "Because $\\partial\\mathbf{u}/\\partial t \\equiv 0$, streamline, streakline, and pathline coincide identically."
        if cls.get("steady")
        else "Because $\\partial\\mathbf{u}/\\partial t \\neq 0$, streamline, streakline, and pathline separate geometrically."
    )
    path_end = kin_data["curves"]["pathline"][-1] if kin_data.get("curves", {}).get("pathline") else [x0, y0]
    streak_tip = kin_data["curves"]["streakline"][0] if kin_data.get("curves", {}).get("streakline") else [x0, y0]

    return {
        "a": [
            {
                "title": "Instantaneous Streamline ODE",
                "explanation": f"At fixed observation time $t = {t_eval:.3g}$, set tangent slope $dx/u = dy/v$ for $u={u_tex}$, $v={v_tex}$:",
                "equation_tex": rf"\frac{{dy}}{{dx}} = {stream_ode_tex}",
            },
            {
                "title": "Integrated Streamline Through Seed",
                "explanation": f"Anchored through $(x_0, y_0) = ({x0:.3g}, {y0:.3g})$:",
                "equation_tex": stream_sol_tex or rf"\int \frac{{dx}}{{{u_tex}}} = \int \frac{{dy}}{{{v_tex}}}",
            },
        ],
        "b": [
            {
                "title": "Streakline Dye Locus (Injection $\\tau \\in [t_0, t]$)",
                "explanation": f"Integrate dye particles released continuously from $({x0:.3g}, {y0:.3g})$ across $\\tau \\in [{t0:.3g}, {t_eval:.3g}]$:",
                "equation_tex": rf"\mathbf{{x}}_{{\text{{tip}}}} = ({streak_tip[0]:.4g},\; {streak_tip[1]:.4g})",
            },
        ],
        "c": [
            {
                "title": "Pathline Integration",
                "explanation": f"Follow the single parcel passing $({x0:.3g}, {y0:.3g})$ at $t_0={t0:.3g}$ until $t={t_eval:.3g}$:",
                "equation_tex": rf"\frac{{dx}}{{dt}} = {u_tex},\; \frac{{dy}}{{dt}} = {v_tex} \implies (x(t), y(t)) = ({path_end[0]:.4g},\; {path_end[1]:.4g})",
            },
        ],
        "d": [
            {
                "title": "Physical Coincidence & Field Classification",
                "explanation": f"The flow is {steady_txt}, {incomp_txt}, and {irrot_txt}. {curve_cmp}",
                "equation_tex": rf"\nabla\cdot\mathbf{{u}} = {div_tex}, \qquad \Omega_z = {vort_tex}",
            },
        ],
    }


def solve_and_derive_assignment(payload: dict[str, Any]) -> dict[str, Any]:
    """Solve custom HW 1 / HW 2 expressions via SymPy+SciPy or narrate any HW 1-7 state via Gemini AI."""
    hw_id = str(payload.get("hw_id", "hw1")).lower().strip()
    use_ai = bool(payload.get("use_ai", False))
    llm_cfg = LLMConfig.model_validate(payload.get("llm_config") or {})

    if hw_id not in {"hw1", "hw2"}:
        topic = str(payload.get("topic", hw_id.upper()))
        subpart = str(payload.get("subpart", "a"))
        params = payload.get("params") or {}
        summary = payload.get("computed_summary") or {}
        if use_ai and llm_cfg.provider != "offline":
            system_prompt = (
                "You are a Fluid Mechanics professor writing concise step-by-step assignment derivations. "
                "Anchor strictly to the exact numerical outputs in computed_summary without altering verified values. "
                "Return STRICT JSON: { \"steps\": [ { \"title\": str, \"explanation\": str, \"equation_tex\": str } ] }."
            )
            user_prompt = (
                f"Homework: {hw_id.upper()} ({topic}), Active Subpart: ({subpart})\n"
                f"Active Parameters: {params}\n"
                f"Verified Numerical Outputs: {summary}\n"
                "Explain how these parameter choices alter the governing equations, limiting behavior, and physical regimes."
            )
            ai_json, prov_tag, note = call_llm_json(system_prompt, user_prompt, llm_cfg)
            if isinstance(ai_json, dict) and isinstance(ai_json.get("steps"), list):
                cleaned = [
                    {
                        "title": str(it.get("title") or f"Subpart ({subpart})"),
                        "explanation": str(it.get("explanation") or ""),
                        "equation_tex": str(it.get("equation_tex") or "").strip().strip("$"),
                    }
                    for it in ai_json["steps"][:4]
                    if isinstance(it, dict)
                ]
                return {
                    "hw_id": hw_id,
                    "subpart": subpart,
                    "steps": cleaned,
                    "provider_used": prov_tag,
                    "note": note,
                }
            return {
                "hw_id": hw_id,
                "subpart": subpart,
                "steps": [],
                "provider_used": prov_tag,
                "note": note or "Could not parse AI steps; exact analytical formulas remain active.",
            }
        return {
            "hw_id": hw_id,
            "subpart": subpart,
            "steps": [],
            "provider_used": "analytical_exact",
            "note": None,
        }

    u_str = str(payload.get("u_str", "x / (t + t0)")).strip()
    v_str = str(payload.get("v_str", "v0")).strip()
    raw_params = payload.get("params") or {}
    params: dict[str, float] = {}
    for k, val in raw_params.items():
        if isinstance(k, str) and k.isidentifier() and isinstance(val, (int, float)) and not isinstance(val, bool):
            params[k] = float(val)

    x0 = float(payload.get("x0", params.get("x0", 1.0)))
    y0 = float(payload.get("y0", params.get("y0", 0.0 if hw_id == "hw1" else 1.0)))
    t0 = float(payload.get("t0", params.get("t0", 1.0 if hw_id == "hw1" else 0.0)))
    t_eval = float(payload.get("t_eval", params.get("t_eval", 2.0 if hw_id == "hw1" else params.get("tau_end", 1.15) / max(params.get("A", 1.0), 0.05))))
    if t_eval < t0:
        t_eval = t0 + 1.0

    bounds = tuple(
        float(b)
        for b in payload.get(
            "bounds",
            [-2.5, 4.5, -2.5, 3.5] if hw_id == "hw1" else [-3.0, 3.0, -3.0, 3.0],
        )
    )

    # 1. Exact numerical + symbolic kinematics solve
    kin_data = analyze_kinematics(
        u_str=u_str,
        v_str=v_str,
        params=params,
        x0=x0,
        y0=y0,
        t0=t0,
        t_eval=t_eval,
        bounds=bounds,
        loop_center=(x0 + 0.5, y0 + 0.5),
        loop_radius=0.65,
    )

    _, u_expr = safe_parse_velocity(u_str, params)
    _, v_expr = safe_parse_velocity(v_str, params)
    du_dx = sp.simplify(sp.diff(u_expr, _X))
    du_dy = sp.simplify(sp.diff(u_expr, _Y))
    dv_dx = sp.simplify(sp.diff(v_expr, _X))
    dv_dy = sp.simplify(sp.diff(v_expr, _Y))
    s_xy = sp.simplify(sp.Rational(1, 2) * (du_dy + dv_dx))
    stream_ode = sp.simplify(v_expr / u_expr) if u_expr != 0 else sp.oo
    stream_sol_tex = _try_symbolic_streamline_tex(u_expr, v_expr)

    exprs = kin_data.get("expressions", {})
    sym_info = {
        "u_tex": exprs.get("u_tex", _safe_latex(u_expr)),
        "v_tex": exprs.get("v_tex", _safe_latex(v_expr)),
        "div_tex": exprs.get("div_tex", "0"),
        "vort_tex": exprs.get("vorticity_tex", "0"),
        "rot_tex": exprs.get("rotation_tex", "0"),
        "du_dx_tex": _safe_latex(du_dx),
        "du_dy_tex": _safe_latex(du_dy),
        "dv_dx_tex": _safe_latex(dv_dx),
        "dv_dy_tex": _safe_latex(dv_dy),
        "s_xy_tex": _safe_latex(s_xy),
        "stream_ode_tex": r"\infty \; (u = 0)" if u_expr == 0 else _safe_latex(stream_ode),
        "stream_sol_tex": stream_sol_tex,
    }

    steps_by_subpart = _build_deterministic_steps(
        hw_id, u_str, v_str, sym_info, kin_data, params, x0, y0, t0, t_eval
    )
    provider_used = "sympy_deterministic"
    ai_note: str | None = None

    # 2. Optional Google Gemini / LLM full step-by-step derivation grounded strictly in SymPy results
    if use_ai and llm_cfg.provider != "offline":
        sub_keys = ["a", "b", "c", "d", "e"] if hw_id == "hw2" else ["a", "b", "c", "d"]
        system_prompt = (
            "You are a Fluid Mechanics professor writing concise, rigorous step-by-step assignment solutions. "
            "Use ONLY the verified SymPy symbolic formulas and SciPy numerical probe values provided below; NEVER contradict or re-invent them. "
            "Return STRICT JSON with schema: "
            "{ \"subparts\": { \"a\": [ { \"title\": str, \"explanation\": str, \"equation_tex\": str } ], ... } }. "
            "Use clean LaTeX in equation_tex (no $$ delimiters around equation_tex) and inline $...$ inside explanation."
        )
        cls = kin_data.get("classification", {})
        pr = kin_data.get("point_probe", {})
        path_end = (kin_data.get("curves", {}).get("pathline") or [[x0, y0]])[-1]
        user_prompt = (
            f"Homework ID: {hw_id.upper()}\n"
            f"Required subparts: {', '.join(sub_keys)}\n"
            f"User velocity expressions: u = {u_str}, v = {v_str} (parameters={params})\n"
            f"Seed & time window: (x0, y0)=({x0}, {y0}), t0={t0}, t_eval={t_eval}\n"
            f"VERIFIED SYMPY OUTPUTS:\n"
            f"  u_tex = {sym_info['u_tex']}, v_tex = {sym_info['v_tex']}\n"
            f"  dy/dx = {sym_info['stream_ode_tex']}\n"
            f"  separable streamline formula = {stream_sol_tex or 'non-separable / numerical'}\n"
            f"  div(u) = {sym_info['div_tex']} (incompressible={cls.get('incompressible')})\n"
            f"  vorticity Omega_z = {sym_info['vort_tex']}, omega_z = {sym_info['rot_tex']} (irrotational={cls.get('irrotational')})\n"
            f"  steady = {cls.get('steady')}, curves_coincide = {cls.get('curves_coincide')}\n"
            f"  strain tensor S = [[{sym_info['du_dx_tex']}, {sym_info['s_xy_tex']}], [{sym_info['s_xy_tex']}, {sym_info['dv_dy_tex']}]]\n"
            f"  probe at (x0,y0,t_eval): u={pr.get('u')}, v={pr.get('v')}, div={pr.get('divergence')}, vort={pr.get('vorticity_z')}\n"
            f"  final pathline point = ({path_end[0]:.4f}, {path_end[1]:.4f})\n"
            "Write clear step-by-step analytical & physical derivations tailored to THIS custom velocity field for each subpart."
        )
        ai_json, prov_tag, fallback_note = call_llm_json(system_prompt, user_prompt, llm_cfg)
        ai_note = fallback_note
        if isinstance(ai_json, dict) and isinstance(ai_json.get("subparts"), dict):
            cleaned_subparts: dict[str, list[dict[str, str]]] = {}
            for sk in sub_keys:
                raw_list = ai_json["subparts"].get(sk)
                if isinstance(raw_list, list) and len(raw_list) > 0:
                    valid_items = []
                    for item in raw_list[:4]:
                        if not isinstance(item, dict):
                            continue
                        valid_items.append({
                            "title": str(item.get("title") or f"Subpart ({sk}) Step"),
                            "explanation": str(item.get("explanation") or ""),
                            "equation_tex": str(item.get("equation_tex") or "").strip().strip("$"),
                        })
                    if valid_items:
                        cleaned_subparts[sk] = valid_items
                if sk not in cleaned_subparts:
                    cleaned_subparts[sk] = steps_by_subpart.get(sk, [])
            steps_by_subpart = cleaned_subparts
            provider_used = prov_tag

    return {
        "hw_id": hw_id,
        "kin_data": kin_data,
        "symbolic": sym_info,
        "steps_by_subpart": steps_by_subpart,
        "provider_used": provider_used,
        "note": ai_note,
    }
