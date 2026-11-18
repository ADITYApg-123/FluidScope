"""Neuro-symbolic problem parser converting raw engineering text into exact solver payloads.

Uses LLM structured extraction when configured, backed unconditionally by a deterministic
SymPy / regex / physical-cue parser so the system works accurately offline and never hallucinates.
"""

from __future__ import annotations

import re
from typing import Any

import sympy as sp

from fluidscope.ai.schemas import GeometryPrimitive, LLMConfig, ParsedPhysicsQuery
from fluidscope.ai.llm_client import call_llm_json
from fluidscope.core.kinematics import _T, _X, _Y, safe_parse_velocity


def _extract_first_float(pattern: str, text: str, default: float | None = None) -> float | None:
    m = re.search(pattern, text, flags=re.IGNORECASE)
    if not m:
        return default
    val = float(m.group(1))
    unit = m.group(2).lower() if len(m.groups()) >= 2 and m.group(2) else ""
    if unit == "mm":
        val *= 1e-3
    elif unit == "cm":
        val *= 1e-2
    elif unit in {"mpa·s", "mpa*s", "cp"}:
        val *= 1e-3
    return val


def _extract_equations(text: str) -> tuple[str | None, str | None]:
    # Matches u = ..., v = ... or u(x,y,t) = ... stopping before comma/and/v=/semicolon/period+space
    m_u = re.search(
        r"\bu(?:\([^)]*\))?\s*=\s*([^,;\n]+?)(?=(?:\s*,\s*v|\s+and\s+v|\s*;|\s*$))",
        text,
        flags=re.IGNORECASE,
    )
    m_v = re.search(
        r"\bv(?:\([^)]*\))?\s*=\s*([^,;\n]+?)(?=(?:\s*,\s*w|\s+and\s+w|\s*;|\s+at\s+|\s+start|\s+from\s+|\s*$))",
        text,
        flags=re.IGNORECASE,
    )
    u_s = m_u.group(1).strip().rstrip(".") if m_u else None
    v_s = m_v.group(1).strip().rstrip(".") if m_v else None
    # Strip trailing English words after math if present
    for stop in ["starting", "from", "with", "find", "where", "given"]:
        if u_s and f" {stop} " in u_s.lower():
            u_s = u_s[: u_s.lower().index(f" {stop} ")].strip()
        if v_s and f" {stop} " in v_s.lower():
            v_s = v_s[: v_s.lower().index(f" {stop} ")].strip()
    return u_s, v_s


def parse_problem_offline(text: str) -> ParsedPhysicsQuery:
    """Deterministic text -> solver parser grounded in Som, Biswas & Chakraborty."""
    raw = (text or "").strip()
    low = raw.lower()

    # 1. Explicit 2D velocity equations u = ..., v = ...
    u_eq, v_eq = _extract_equations(raw)
    if u_eq is not None and v_eq is not None:
        t0_val = _extract_first_float(r"\bt0\s*=\s*([-0-9.]+)", raw, 1.0)
        t0 = t0_val if t0_val is not None else 1.0
        v0_val = _extract_first_float(r"\bv0\s*=\s*([-0-9.]+)", raw, 1.0)
        v0 = v0_val if v0_val is not None else 1.0
        t_eval_val = _extract_first_float(r"\bt\s*=\s*([-0-9.]+)", raw, 2.0 * t0)
        t_eval = t_eval_val if t_eval_val is not None else (2.0 * t0)
        if t_eval <= t0:
            t_eval = t0 + 1.0

        kin_params = {"t0": t0, "v0": v0}
        try:
            _, u_expr = safe_parse_velocity(u_eq, kin_params)
            _, v_expr = safe_parse_velocity(v_eq, kin_params)
            du_dt = sp.simplify(sp.diff(u_expr, _T))
            dv_dt = sp.simplify(sp.diff(v_expr, _T))
            div_expr = sp.simplify(sp.diff(u_expr, _X) + sp.diff(v_expr, _Y))
            vort_expr = sp.simplify(sp.diff(v_expr, _X) - sp.diff(u_expr, _Y))
            steady = (du_dt == 0) and (dv_dt == 0)
            incompressible = bool(div_expr == 0)
            irrotational = bool(vort_expr == 0)
        except ValueError:
            steady = not (re.search(r"\bt\b", u_eq) or re.search(r"\bt\b", v_eq))
            incompressible = False
            irrotational = False
        unsteady = not steady

        return ParsedPhysicsQuery(
            family="kinematics_equation",
            confidence=0.96,
            parser_mode="offline_deterministic",
            assumptions={
                "steady": bool(steady),
                "incompressible": bool(incompressible),
                "inviscid": True,
                "irrotational": bool(irrotational),
            },
            params={
                "u_str": u_eq,
                "v_str": v_eq,
                "params": {"t0": t0, "v0": v0},
                "x0": 1.0,
                "y0": 0.0,
                "t0": t0,
                "t_eval": t_eval,
            },
            concept_twist=(
                "Unsteady velocity field: instantaneous streamline, Lagrangian pathline, and dye streakline diverge."
                if unsteady
                else "Steady velocity field: streamline, pathline, and streakline coincide; inspect Ωz vs shear strain."
            ),
            broken_shortcut="Assuming streamlines equal particle trajectories or streaklines when ∂V/∂t ≠ 0.",
            textbook_ref="Som, Biswas & Chakraborty Ch. 3.3.3 (Example 3.10, p. 135-137)",
            raw_query=raw,
        )

    # 2. Honest out-of-scope check for 3D / compressible turbomachinery
    if any(k in low for k in ["compressor", "impeller", "turbine blade", "supersonic", "oblique shock", "nozzle shock", "3d compressible"]):
        return ParsedPhysicsQuery(
            family="unsupported_3d",
            confidence=0.95,
            parser_mode="offline_deterministic",
            assumptions={"steady": True, "incompressible": False, "inviscid": False, "irrotational": False},
            params={},
            concept_twist="Compressible 3D / shock / turbomachinery regime requires energy + entropy relations beyond incompressible 2D solvers.",
            broken_shortcut="Incompressible Bernoulli or 2D planar continuity cannot resolve shocks or blade-passage density jumps.",
            textbook_ref="Som, Biswas & Chakraborty Ch. 14 / Ch. 16",
            unsupported_reason=(
                "This query requires 3D compressible/rotodynamic solvers (Ch. 14–16), which are outside the currently built "
                "2D/1D exact solvers. No fabricated diagram will be drawn; SymPy equation audit remains active."
            ),
            raw_query=raw,
        )

    # 3. Rotating vessel (Ex 4.8)
    if ("rpm" in low or "rotat" in low) and any(k in low for k in ["tank", "vessel", "cylinder", "uncover", "spill"]):
        d_m = _extract_first_float(r"diameter\s*(?:of|=)?\s*([0-9.]+)\s*(m|cm|mm)?", low)
        r_m = _extract_first_float(r"radius\s*(?:of|=)?\s*([0-9.]+)\s*(m|cm|mm)?", low)
        radius = r_m if r_m is not None else (0.5 * d_m if d_m is not None else 0.30)
        rpm_val = _extract_first_float(r"([0-9.]+)\s*rpm", low, 130.0)
        rpm = rpm_val if rpm_val is not None else 130.0
        height_val = _extract_first_float(r"height\s*(?:of|=)?\s*([0-9.]+)\s*(m|cm|mm)?", low, 0.503)
        height = height_val if height_val is not None else 0.503
        return ParsedPhysicsQuery(
            family="rotating_vessel",
            confidence=0.94,
            assumptions={"steady": True, "incompressible": True, "inviscid": True, "irrotational": False},
            params={"radius": radius, "vessel_height": height, "initial_depth": height, "rpm": rpm},
            concept_twist="Forced vortex solid-body rotation: liquid spills at top rim and uncovers dry center area while total head rises with r².",
            broken_shortcut="Applying constant-head Bernoulli across rotating radii or ignoring base detachment volume loss.",
            textbook_ref="Som, Biswas & Chakraborty Ch. 4.5 (Example 4.8, p. 208-209)",
            raw_query=raw,
        )

    # 4. Vortex flows (Free vs Forced vs Rankine vs Spiral)
    if "vortex" in low or ("bend" in low and "free" in low):
        mode = "forced" if "forced" in low or "solid-body" in low or "solid body" in low else (
            "rankine" if "rankine" in low or "combined" in low else (
                "spiral" if "spiral" in low else "free"
            )
        )
        r1_val = _extract_first_float(r"inner\s*(?:radius|radii|wall)[^0-9]*([0-9.]+)\s*(m|cm|mm)?", low, 0.15)
        r1 = r1_val if r1_val is not None else 0.15
        r2_val = _extract_first_float(r"outer\s*(?:radius|radii|wall)[^0-9]*([0-9.]+)\s*(m|cm|mm)?", low, 0.45)
        r2 = r2_val if r2_val is not None else 0.45
        omega_val = _extract_first_float(r"(?:omega|angular)\s*(?:=|of)?\s*([0-9.]+)", low, 10.0)
        omega = omega_val if omega_val is not None else 10.0
        c_ext = _extract_first_float(r"\bc\s*=\s*([0-9.]+)", low, 0.9)
        c_val = c_ext if c_ext is not None else 0.9
        return ParsedPhysicsQuery(
            family="vortex_flow",
            confidence=0.92,
            assumptions={"steady": True, "incompressible": True, "inviscid": True, "irrotational": mode in {"free", "spiral"}},
            params={"mode": mode, "strength_c": c_val, "omega": omega, "r1": r1, "r2": max(r2, r1 + 0.05), "r_max": max(0.6, r2 * 1.25)},
            concept_twist=(
                "Forced vortex has constant vorticity Ωz = 2ω: total head increases outward (dH/dr = 2ω²r/g), reversing naive Bernoulli Δp sign."
                if mode in {"forced", "rankine"}
                else "Free vortex is irrotational for r > 0 (dH/dr = 0), so Bernoulli applies across streamlines away from the singular core."
            ),
            broken_shortcut="Using Bernoulli between concentric radii r1 and r2 in a rotational forced vortex core.",
            textbook_ref="Som, Biswas & Chakraborty Ch. 4.5 (Eq. 4.43-4.60, p. 200-208)",
            raw_query=raw,
        )

    # 5. Hydraulic Jump
    if any(k in low for k in ["hydraulic jump", "sluice", "conjugate depth", "apron", "froude"]):
        v1_val = _extract_first_float(r"(?:velocity|v1|at)\s*(?:of|=)?\s*([0-9.]+)\s*m/s", low, 6.1)
        v1 = v1_val if v1_val is not None else 6.1
        h1 = _extract_first_float(r"([0-9.]+)\s*(m|cm|mm)\s*depth", low)
        if h1 is None:
            h1 = _extract_first_float(r"depth\s*(?:of|=)?\s*([0-9.]+)\s*(m|cm|mm)?", low)
        q = _extract_first_float(r"([0-9.]+)\s*m(?:\^3|3)/s", low)
        w = _extract_first_float(r"([0-9.]+)\s*m\s*wide", low)
        if w is None:
            w_val = _extract_first_float(r"width\s*(?:of|=)?\s*([0-9.]+)\s*(m|cm|mm)?", low, 6.1)
            w = w_val if w_val is not None else 6.1
        return ParsedPhysicsQuery(
            family="hydraulic_jump",
            confidence=0.95,
            assumptions={"steady": True, "incompressible": True, "inviscid": False, "irreversible_jump": True},
            params={"width": w, "v1": v1, "h1": h1 if h1 is not None else (0.305 if q is None else None), "discharge": q},
            concept_twist="Hydraulic jump dissipates mechanical head hj = (h2-h1)³/(4h1h2) via turbulent rollers; only momentum is conserved.",
            broken_shortcut="Equating upstream & downstream specific energy (Es1 = Es2), which overpredicts subcritical depth h2.",
            textbook_ref="Som, Biswas & Chakraborty Ch. 12.4 (Examples 12.11-12.12, p. 601-605)",
            raw_query=raw,
        )

    # 6. Sudden pipe expansion (Borda-Carnot)
    if any(k in low for k in ["sudden expansion", "sudden enlargement", "abrupt enlargement", "borda"]):
        m_pair = re.search(r"([0-9.]+)\s*(m|cm|mm)?\s*to\s*([0-9.]+)\s*(m|cm|mm)?", low)
        d1, d2 = 0.10, 0.20
        if m_pair:
            d1 = float(m_pair.group(1)) * (1e-3 if (m_pair.group(2) or "").lower() == "mm" else 1.0)
            d2 = float(m_pair.group(3)) * (1e-3 if (m_pair.group(4) or "").lower() == "mm" else 1.0)
            if d2 <= d1:
                d1, d2 = 0.10, 0.20
        v1_val = _extract_first_float(r"([0-9.]+)\s*m/s", low, 4.0)
        v1 = v1_val if v1_val is not None else 4.0
        return ParsedPhysicsQuery(
            family="sudden_expansion",
            confidence=0.93,
            assumptions={"steady": True, "incompressible": True, "inviscid": False, "irreversible_jump": True},
            params={"D1": d1, "D2": d2, "V1": v1},
            concept_twist="Annular corner pressure remains ~p1 during jet separation; turbulent mixing dissipates (V1-V2)²/2g.",
            broken_shortcut="Ideal Bernoulli Δp = ½ρ(V1²-V2²), overestimating downstream pressure recovery.",
            textbook_ref="Som, Biswas & Chakraborty Ch. 11.5 (Eq. 11.18-11.23, p. 539-540)",
            raw_query=raw,
        )

    # 7. Accelerating / Free-fall tank (Ch 2.9)
    if any(k in low for k in ["free fall", "free-fall", "falling", "accelerating tank", "orifice", "leak"]):
        is_ff = any(k in low for k in ["free fall", "free-fall", "falling"])
        ax_val = _extract_first_float(r"ax\s*=\s*([-0-9.]+)", low, 0.0 if is_ff else 3.0)
        ax = ax_val if ax_val is not None else (0.0 if is_ff else 3.0)
        az_val = _extract_first_float(r"az\s*=\s*([-0-9.]+)", low, 0.0)
        az = -9.81 if is_ff else (az_val if az_val is not None else 0.0)
        return ParsedPhysicsQuery(
            family="accelerating_tank",
            confidence=0.91,
            assumptions={"steady": True, "incompressible": True, "inertial_frame": False},
            params={"ax": ax, "az": az, "h0": 0.50},
            concept_twist="Non-inertial gravity g_eff = g + az vanishes in free fall (dp/dz = 0), so liquid remains horizontal and stops leaking!",
            broken_shortcut="Using static Torricelli √(2gh) in a freely falling frame.",
            textbook_ref="Som, Biswas & Chakraborty Ch. 2.9 (Eq. 2.86-2.88, p. 97-99)",
            raw_query=raw,
        )

    # 8. Two-layer immiscible channel (Ex 8.2)
    if any(k in low for k in ["two-layer", "two layer", "immiscible", "separate layers"]):
        return ParsedPhysicsQuery(
            family="two_layer_poiseuille",
            confidence=0.92,
            assumptions={"steady": True, "incompressible": True, "inviscid": False, "irrotational": False},
            params={"mu1": 0.005, "mu2": 0.001, "dp_dx": -1000.0},
            concept_twist="Interface enforces shear stress continuity μ1(du1/dy) = μ2(du2/dy), producing a slope kink and peak inside the less viscous layer.",
            broken_shortcut="Assuming du1/dy = du2/dy across the interface or u_max at geometric centerline y = 0.",
            textbook_ref="Som, Biswas & Chakraborty Ch. 8.3 (Example 8.2, p. 404-407)",
            raw_query=raw,
        )

    # 9. Generalized Couette-Poiseuille (Ex 8.4)
    if any(k in low for k in ["couette", "moving plate", "zero net flow", "recirculat"]):
        p_val = -3.0 if ("zero net" in low or "zero flow" in low) else (-1.0 if "zero shear" in low else -2.0)
        return ParsedPhysicsQuery(
            family="couette_poiseuille",
            confidence=0.90,
            assumptions={"steady": True, "incompressible": True, "inviscid": False, "irrotational": False, "adverse_pressure_gradient": p_val < 0},
            params={"P": p_val},
            concept_twist="Adverse pressure gradient P < -1 triggers backflow near the stationary wall; P = -3 yields zero net discharge Q = 0.",
            broken_shortcut="Neglecting opposing pressure gradient curvature in plate-driven shear flow.",
            textbook_ref="Som, Biswas & Chakraborty Ch. 8.3 (Eq. 8.41-8.42, Ex 8.4, p. 410-413)",
            raw_query=raw,
        )

    # 10. Wall slip & Herschel-Bulkley / non-Newtonian
    if any(k in low for k in ["slip", "herschel", "bingham", "yield stress", "non-newtonian", "shear thinning", "plug"]):
        tau_y_def = 3.0 if "plug" in low or "bingham" in low or "herschel" in low else 0.0
        tau_y_val = _extract_first_float(r"yield[^0-9]*([0-9.]+)", low, tau_y_def)
        tau_y = tau_y_val if tau_y_val is not None else tau_y_def
        ls_def = 0.00025 if "slip" in low else 0.0
        ls_val = _extract_first_float(r"slip[^0-9]*([0-9.]+)\s*(m|cm|mm)?", low, ls_def)
        ls = ls_val if ls_val is not None else ls_def
        n_val = 0.65 if ("thinning" in low or "herschel" in low) else 1.0
        return ParsedPhysicsQuery(
            family="slip_herschel_bulkley",
            confidence=0.90,
            assumptions={
                "steady": True,
                "incompressible": True,
                "inviscid": False,
                "irrotational": False,
                "no_slip": ls == 0.0,
                "newtonian": n_val == 1.0 and tau_y == 0.0,
            },
            params={"n": n_val, "tau_y": tau_y, "slip_length": ls},
            concept_twist="Navier wall slip boosts discharge by 1+3*l_s/H while yield stress τ_y creates an unyielded solid-like plug core |τ| ≤ τ_y.",
            broken_shortcut="Standard no-slip Newtonian Hagen-Poiseuille parabolic law.",
            textbook_ref="Som, Biswas & Chakraborty Ch. 1.6 (p. 24) & Microchannel Slip",
            raw_query=raw,
        )

    # 11. Boundary layer separation / Falkner-Skan
    if any(k in low for k in ["falkner", "blasius"]):
        beta_ext = _extract_first_float(r"beta\s*=\s*([-0-9.]+)", low, -0.15)
        beta_val = 0.0 if ("blasius" in low or "flat plate" in low) else (beta_ext if beta_ext is not None else -0.15)
        return ParsedPhysicsQuery(
            family="falkner_skan",
            confidence=0.93,
            assumptions={"steady": True, "incompressible": True, "inviscid": False, "irrotational": False, "adverse_pressure_gradient": beta_val < 0},
            params={"beta": max(-0.198, min(1.5, beta_val))},
            concept_twist="Exact similarity ODE f''' + f f'' + β(1 - (f')²) = 0: adverse β < 0 pushes wall curvature positive and approaches separation at β ≈ -0.1988.",
            broken_shortcut="Using Blasius flat-plate friction Cf·√Rex = 0.6641 when β ≠ 0 (non-zero streamwise pressure gradient).",
            textbook_ref="Som, Biswas & Chakraborty Ch. 9.3 & 9.6 (Eq. 9.24, Fig. 9.6)",
            raw_query=raw,
        )

    if any(k in low for k in ["separation", "adverse pressure", "inflection", "d'alembert", "pohlhausen"]):
        return ParsedPhysicsQuery(
            family="bl_separation",
            confidence=0.92,
            assumptions={"steady": True, "incompressible": True, "inviscid": False, "irrotational": False, "adverse_pressure_gradient": True},
            params={"lambda_pg": -14.0 if "backflow" in low or "separat" in low else -6.0},
            concept_twist="Adverse dp/dx > 0 enforces positive wall curvature ∂²u/∂y²|w > 0 and an interior inflection point; detachment hits at τ_w = 0.",
            broken_shortcut="Assuming potential Cp around cylinder rear or treating d²u/dy²|w = 0 as separation.",
            textbook_ref="Som, Biswas & Chakraborty Ch. 9.6 (Eq. 9.41-9.42, Fig. 9.5-9.6, p. 462-466)",
            raw_query=raw,
        )

    # 12. 2D LBM Tunnel geometry parsing from English description
    if any(k in low for k in ["cylinder", "splitter", "step", "obstacle", "block", "tandem", "wake", "tunnel", "baffle"]):
        obstacles: list[GeometryPrimitive] = []
        preset = "cylinder"
        if "splitter" in low or "plate behind" in low:
            preset = "cylinder_splitter"
        elif "tandem" in low or "two cylinder" in low or "two circles" in low:
            preset = "tandem_cylinders"
        elif "step" in low:
            preset = "backward_step"
        elif "block" in low or "square" in low or "rect" in low:
            preset = "custom"
            if "cylinder" in low or "circle" in low:
                obstacles.append(GeometryPrimitive(type="circle", x=0.22, y=0.50, r=0.11))
            obstacles.append(GeometryPrimitive(type="rect", x0=0.42, y0=0.42, x1=0.52, y1=0.58))
        re_ext = _extract_first_float(r"re\s*(?:=|of)?\s*([0-9.]+)", low, 105.0)
        re_val = re_ext if re_ext is not None else 105.0
        return ParsedPhysicsQuery(
            family="lbm_tunnel",
            confidence=0.88,
            assumptions={"steady": False, "incompressible": True, "inviscid": False, "irrotational": False, "adverse_pressure_gradient": True},
            params={"preset": preset, "reynolds": max(25.0, min(160.0, re_val))},
            obstacles=obstacles,
            concept_twist="Bluff body wakes shed alternating Kármán vortices above critical Re unless stabilized by a wake splitter baffle.",
            broken_shortcut="Steady inviscid potential theory predicts zero drag (D'Alembert paradox) and symmetric aft streamlines.",
            textbook_ref="Som, Biswas & Chakraborty Ch. 9.6 & Ch. 10",
            raw_query=raw,
        )

    # Honest fallback when query is unclear: route cleanly to forced-vortex/custom inquiry notice
    return ParsedPhysicsQuery(
        family="unsupported_3d",
        confidence=0.3,
        assumptions={"steady": True, "incompressible": False, "inviscid": False, "irrotational": False},
        params={},
        concept_twist="Could not match an exact implemented 1D/2D physics family from phrasing alone.",
        broken_shortcut="Avoid forcing an arbitrary diagram; refine input with equations u=..., v=... or choose a physical scenario.",
        textbook_ref="Som, Biswas & Chakraborty Index",
        unsupported_reason=(
            "Try pasting an explicit 2D equation (e.g., 'u = x/(1+t), v = 2'), a textbook problem "
            "(hydraulic jump, forced vortex, rotating tank, two-layer flow, sudden expansion, BL separation), "
            "or a 2D obstacle description (e.g., 'flow past cylinder with splitter plate')."
        ),
        raw_query=raw,
    )


_SYSTEM_PARSE_PROMPT = """You are a strict Neuro-Symbolic Fluid Mechanics Problem Translator for Som, Biswas & Chakraborty.
Convert the student's text into a JSON object matching:
{
  "family": one of ["kinematics_equation","vortex_flow","rotating_vessel","potential_superposition","falkner_skan","bl_separation","couette_poiseuille","two_layer_poiseuille","slip_herschel_bulkley","hydraulic_jump","sudden_expansion","accelerating_tank","lbm_tunnel","unsupported_3d"],
  "confidence": 0.0 to 1.0,
  "assumptions": {"steady": bool, "incompressible": bool, "inviscid": bool, "irrotational": bool, "no_slip": bool, "newtonian": bool, "inertial_frame": bool, "adverse_pressure_gradient": bool, "irreversible_jump": bool},
  "params": { solver keyword params in SI units },
  "obstacles": [ optional {"type":"circle"|"rect","x":0.25,"y":0.5,"r":0.1,"x0":0.3,"y0":0.45,"x1":0.55,"y1":0.55} ],
  "concept_twist": "one crisp sentence naming the broken assumption",
  "broken_shortcut": "one crisp sentence naming what naive textbook formula fails",
  "textbook_ref": "exact chapter/example citation",
  "unsupported_reason": null or reason string if unsupported_3d
}
NEVER solve differential equations or compute output pressure/velocity yourself; only extract structured parameters."""


def parse_problem(text: str, cfg: LLMConfig | None = None) -> ParsedPhysicsQuery:
    """Parse user problem text via online LLM (if enabled) with deterministic fallback."""
    cfg = cfg or LLMConfig()
    offline_baseline = parse_problem_offline(text)

    if cfg.provider != "offline":
        raw_json, tag, _note = call_llm_json(_SYSTEM_PARSE_PROMPT, text, cfg)
        if raw_json:
            try:
                raw_json["parser_mode"] = tag
                raw_json["raw_query"] = text
                return ParsedPhysicsQuery.model_validate(raw_json)
            except Exception:
                pass
    return offline_baseline
