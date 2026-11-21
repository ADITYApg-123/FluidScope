"""Neuro-symbolic problem parser converting raw engineering text into exact solver payloads.

Uses LLM structured extraction when configured, backed unconditionally by a deterministic
SymPy / regex / physical-cue parser so the system works accurately offline and never hallucinates.
"""

from __future__ import annotations

import math
import re
from typing import Any

import sympy as sp

from fluidscope.ai.schemas import GeometryPrimitive, LLMConfig, ParsedPhysicsQuery
from fluidscope.ai.llm_client import call_llm_json
from fluidscope.core.kinematics import _T, _X, _Y, safe_parse_velocity


_FLOAT_NUM_RE = r"(?<![0-9.])([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)(?![0-9.])"
_POS_NUM_RE = r"(?<![a-zA-Z0-9_.^-])((?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)(?![0-9.])"
_UNIT_IN_EQ_RE = re.compile(
    r"(?<![a-zA-Z_])(?:m/s(?:\^?2|²)?|cm/s(?:\^?2|²)?|mm/s(?:\^?2|²)?|ft/s|rad/s|rpm|kpa|m(?:\^3|³|3)/s)(?![a-zA-Z0-9_])"
    r"|(?:\d|\.)\s*pa(?![a-zA-Z0-9_])",
    re.IGNORECASE,
)
_STOP_CLAUSE_RE = re.compile(
    r"^\s+(?:and|or|where|given|at|starting|start|from|with|find|compare|compute|predict|determine|for|while|when|dye|then|until|if)\b",
    re.IGNORECASE,
)

_ANY_PHYSICAL_UNIT_RE = (
    r"(?:degrees|degree|deg|°|rad/s|rad|rpm|kpa/m|pa/m|kpa|pa"
    r"|m(?:\^3|³|3)/s|l/s|m(?:\^2|²|2)/s|cm(?:\^2|²|2)/s|mm(?:\^2|²|2)/s"
    r"|mm/s(?:\^?2|²)?|cm/s(?:\^?2|²)?|m/s(?:\^?2|²)?"
    r"|mpa[·*]s|pa[·*]s|cp|μm|µm|um|mm|cm|m|km|ms|seconds|second|sec|s|ft/s|ft|bar|psi|atm|hz)"
)
_UNIT_END_GUARD = r"(?![a-zA-Z0-9_/³²^])"
_BARE_SUFFIX_GUARD = rf"(?![a-zA-Z_])(?!\s*{_ANY_PHYSICAL_UNIT_RE}{_UNIT_END_GUARD})"

_LEN_UNITS = r"mm|cm|m"
_SLIP_LEN_UNITS = r"μm|µm|um|mm|cm|m"
_SPEED_UNITS = r"mm/s|cm/s|m/s"
_ACCEL_UNITS = r"mm/s\^?2|mm/s²|cm/s\^?2|cm/s²|m/s\^?2|m/s²"
_TIME_UNITS = r"seconds|second|ms|sec|s"
_ANGLE_UNITS = r"degrees|degree|deg|°|rad"
_CIRC_UNITS = r"cm(?:\^2|²|2)/s|mm(?:\^2|²|2)/s|m(?:\^2|²|2)/s"
_FLOW_UNITS = r"m(?:\^3|³|3)/s|l/s"
_STRESS_UNITS = r"kpa|pa"
_VISC_UNITS = r"mpa[·*]s|pa[·*]s|cp"
_DPDX_UNITS = r"kpa/m|pa/m"


def _num_pat(*, signed: bool = False, units: str | None = None, require_unit: bool = False) -> str:
    num = _FLOAT_NUM_RE if signed else _POS_NUM_RE
    if units:
        unit_branch = rf"\s*({units}){_UNIT_END_GUARD}"
        if require_unit:
            return rf"{num}{unit_branch}"
        return rf"{num}(?:{unit_branch}|{_BARE_SUFFIX_GUARD})"
    return rf"{num}{_BARE_SUFFIX_GUARD}"


_UNIT_DIVISORS: dict[str, float] = {
    "um": 1_000_000.0,
    "µm": 1_000_000.0,
    "μm": 1_000_000.0,
    "mm": 1000.0,
    "cm": 100.0,
    "mm/s": 1000.0,
    "cm/s": 100.0,
    "mm/s^2": 1000.0,
    "mm/s²": 1000.0,
    "mm/s2": 1000.0,
    "cm/s^2": 100.0,
    "cm/s²": 100.0,
    "cm/s2": 100.0,
    "mpa·s": 1000.0,
    "mpa*s": 1000.0,
    "cp": 1000.0,
    "l/s": 1000.0,
    "ms": 1000.0,
    "cm^2/s": 10_000.0,
    "cm²/s": 10_000.0,
    "cm2/s": 10_000.0,
    "mm^2/s": 1_000_000.0,
    "mm²/s": 1_000_000.0,
    "mm2/s": 1_000_000.0,
}

_UNIT_MULTIPLIERS: dict[str, float] = {
    "kpa": 1000.0,
    "kpa/m": 1000.0,
}


def _convert_unit_value(val: float, unit: str) -> float:
    u = (unit or "").strip().lower()
    if u in _UNIT_DIVISORS:
        return val / _UNIT_DIVISORS[u]
    if u in _UNIT_MULTIPLIERS:
        return val * _UNIT_MULTIPLIERS[u]
    return val


def _extract_first_float(
    pattern: str,
    text: str,
    default: float | None = None,
    *,
    flags: int = re.IGNORECASE,
) -> float | None:
    m = re.search(pattern, text, flags=flags)
    if not m:
        return default
    try:
        val = float(m.group(1))
    except (ValueError, TypeError):
        return default
    unit = m.group(2).lower() if len(m.groups()) >= 2 and m.group(2) else ""
    return _convert_unit_value(val, unit)


def _extract_first_float_with_unit(
    pattern: str,
    text: str,
    *,
    flags: int = re.IGNORECASE,
) -> tuple[float | None, str]:
    m = re.search(pattern, text, flags=flags)
    if not m:
        return None, ""
    try:
        val = float(m.group(1))
    except (ValueError, TypeError):
        return None, ""
    unit = m.group(2).lower() if len(m.groups()) >= 2 and m.group(2) else ""
    return _convert_unit_value(val, unit), unit


def _extract_math_rhs(text: str, var_name: str) -> str | None:
    m = re.search(
        rf"(?<![a-zA-Z0-9_]){re.escape(var_name)}(?:\([^)]*\))?\s*=\s*",
        text,
        flags=re.IGNORECASE,
    )
    if not m:
        return None
    tail = text[m.end() :]
    depth = 0
    end_idx = len(tail)
    for i, ch in enumerate(tail):
        if ch == "(":
            depth += 1
        elif ch == ")":
            if depth == 0:
                end_idx = i
                break
            depth -= 1
        elif depth == 0:
            if ch in ",;\r\n":
                end_idx = i
                break
            if ch == "." and (i + 1 == len(tail) or tail[i + 1].isspace() or tail[i + 1].isalpha()):
                end_idx = i
                break
            if ch.isspace() and _STOP_CLAUSE_RE.match(tail[i:]):
                end_idx = i
                break
    expr = tail[:end_idx].strip().rstrip(".")
    return expr or None


def _extract_equations(text: str) -> tuple[str | None, str | None]:
    u_s = _extract_math_rhs(text, "u")
    v_s = _extract_math_rhs(text, "v")
    if u_s and _UNIT_IN_EQ_RE.search(u_s):
        u_s = None
    if v_s and _UNIT_IN_EQ_RE.search(v_s):
        v_s = None
    return u_s, v_s


def parse_problem_offline(text: str) -> ParsedPhysicsQuery:
    """Deterministic text -> solver parser grounded in fluid mechanics principles."""
    raw = (text or "").strip()
    low = raw.lower()

    # 1. Explicit 2D velocity equations u = ..., v = ...
    u_eq, v_eq = _extract_equations(raw)
    if u_eq is not None and v_eq is not None:
        t0_pat = _num_pat(signed=True, units=_TIME_UNITS)
        v0_pat = _num_pat(signed=True, units=_SPEED_UNITS)
        xy_pat = _num_pat(signed=True, units=_LEN_UNITS)
        t0_val = _extract_first_float(rf"\bt0\s*=\s*{t0_pat}", raw, 1.0)
        t0 = t0_val if t0_val is not None else 1.0
        v0_val = _extract_first_float(rf"\bv0\s*=\s*{v0_pat}", raw, 1.0)
        v0 = v0_val if v0_val is not None else 1.0
        x0_val = _extract_first_float(rf"\bx0\s*=\s*{xy_pat}", raw, 1.0)
        x0 = x0_val if x0_val is not None else 1.0
        y0_val = _extract_first_float(rf"\by0\s*=\s*{xy_pat}", raw, 0.0)
        y0 = y0_val if y0_val is not None else 0.0
        t_eval_val = _extract_first_float(rf"\bt\s*=\s*{t0_pat}", raw, 2.0 * t0)
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
                "x0": x0,
                "y0": y0,
                "t0": t0,
                "t_eval": t_eval,
            },
            concept_twist=(
                "Unsteady velocity field: instantaneous streamline, Lagrangian pathline, and dye streakline diverge."
                if unsteady
                else "Steady velocity field: streamline, pathline, and streakline coincide; inspect Ωz vs shear strain."
            ),
            broken_shortcut="Assuming streamlines equal particle trajectories or streaklines when ∂V/∂t ≠ 0.",
            textbook_ref="Fluid Kinematics & Flow Lines",
            raw_query=raw,
        )

    # 2. Honest out-of-scope check for 3D / compressible turbomachinery
    has_vortex_cues = (
        "forced vortex" in low
        or "free vortex" in low
        or "rankine" in low
        or ("vortex" in low and any(k in low for k in ["vθ", "vtheta", "ωr", "omega", "r1", "r2"]))
    )
    is_turbomachinery_3d = any(
        k in low
        for k in [
            "compressor",
            "turbine blade",
            "supersonic",
            "oblique shock",
            "nozzle shock",
            "3d compressible",
            "turbomachinery",
            "3d shock",
            "blade passage",
        ]
    ) or ("impeller" in low and not has_vortex_cues)
    if is_turbomachinery_3d:
        return ParsedPhysicsQuery(
            family="unsupported_3d",
            confidence=0.95,
            parser_mode="offline_deterministic",
            assumptions={"steady": True, "incompressible": False, "inviscid": False, "irrotational": False},
            params={},
            concept_twist="Compressible 3D / shock / turbomachinery regime requires energy + entropy relations beyond incompressible 2D solvers.",
            broken_shortcut="Incompressible Bernoulli or 2D planar continuity cannot resolve shocks or blade-passage density jumps.",
            textbook_ref="Compressible Aerodynamics & Turbomachinery",
            unsupported_reason=(
                "This query requires 3D compressible/rotodynamic solvers, which are outside the currently built "
                "2D/1D exact solvers. No fabricated diagram will be drawn; SymPy equation audit remains active."
            ),
            raw_query=raw,
        )

    # Precompute potential-superposition cues so rotating cylinders with Magnus/circulation
    # are not captured by the rotating_vessel open-tank branch.
    has_pot_keyword = any(
        k in low
        for k in [
            "doublet",
            "magnus",
            "kutta-joukowski",
            "kutta joukowski",
            "potential superposition",
            "potential flow",
            "rankine half",
            "half-body",
            "half body",
            "angle of attack",
        ]
    )
    has_circ_stream = ("circulation" in low or "gamma" in low) and any(
        k in low for k in ["cylinder", "uniform stream", "freestream", "doublet", "stagnation", "lift"]
    )
    is_potential_query = has_pot_keyword or (
        has_circ_stream and not any(k in low for k in ["rpm", "tank", "vessel", "uncover", "spill"])
    )

    # 3. Rotating vessel (Ex 4.8)
    if not is_potential_query and ("rpm" in low or "rotat" in low) and any(
        k in low for k in ["tank", "vessel", "cylinder", "uncover", "spill"]
    ):
        len_pos = _num_pat(signed=False, units=_LEN_UNITS)
        d_m = _extract_first_float(rf"\bdiameter\s*(?:of|is|=)?\s*{len_pos}", raw)
        if d_m is None:
            d_m = _extract_first_float(rf"\bD\s*=\s*{len_pos}", raw, flags=0)
        r_m = _extract_first_float(rf"\bradius\s*(?:of|is|=)?\s*{len_pos}", raw)
        if r_m is None:
            r_m = _extract_first_float(rf"\bR\s*=\s*{len_pos}", raw, flags=0)
        radius = r_m if r_m is not None else (0.5 * d_m if d_m is not None else 0.30)

        spin_pat = _num_pat(signed=False, units=r"rpm|rad/s", require_unit=True)
        rpm_val, rpm_unit = _extract_first_float_with_unit(
            rf"(?:raised|increased|accelerated|spun\s+up|speed\s+(?:is\s+)?(?:set|raised|increased)\s+to|final\s+speed(?:\s+of)?|\bto)\s+(?:to\s+)?{spin_pat}",
            raw,
        )
        if rpm_val is None:
            rpm_val, rpm_unit = _extract_first_float_with_unit(spin_pat, raw)
        if rpm_val is not None and rpm_unit == "rad/s":
            rpm_val = rpm_val * 60.0 / (2.0 * math.pi)
        rpm = rpm_val if rpm_val is not None else 130.0

        height_val = _extract_first_float(rf"\b(?:vessel\s+)?height\s*(?:of|is|=)?\s*{len_pos}", raw)
        if height_val is None:
            height_val = _extract_first_float(rf"\bH\s*=\s*{len_pos}", raw, flags=0)
        height = height_val if height_val is not None else 0.503
        depth_val = _extract_first_float(
            rf"(?:initial\s+depth|liquid\s+depth|filled\s+to(?:\s+depth)?)\s*(?:of|is|=)?\s*{len_pos}",
            raw,
        )
        initial_depth = depth_val if depth_val is not None else height
        return ParsedPhysicsQuery(
            family="rotating_vessel",
            confidence=0.94,
            assumptions={"steady": True, "incompressible": True, "inviscid": True, "irrotational": False},
            params={"radius": radius, "vessel_height": height, "initial_depth": initial_depth, "rpm": rpm},
            concept_twist="Forced vortex solid-body rotation: liquid spills at top rim and uncovers dry center area while total head rises with r².",
            broken_shortcut="Applying constant-head Bernoulli across rotating radii or ignoring base detachment volume loss.",
            textbook_ref="Rotating Vessel & Paraboloid Hydrostatics",
            raw_query=raw,
        )

    # 3b. 2D Potential Flow Superposition (Magnus / Doublet / Rankine Half-Body)
    if is_potential_query:
        speed_pos = _num_pat(signed=False, units=_SPEED_UNITS)
        speed_pos_req = _num_pat(signed=False, units=_SPEED_UNITS, require_unit=True)
        u_inf_val = _extract_first_float(
            rf"(?:u_?inf|u∞|(?:freestream|uniform\s+stream)(?:\s+(?:velocity|speed))?)\s*(?:=|of|is|at)?\s*{speed_pos}",
            raw,
        )
        if u_inf_val is None:
            u_inf_val = _extract_first_float(rf"\bU\s*=\s*{speed_pos}", raw, flags=0)
        if u_inf_val is None:
            u_inf_val = _extract_first_float(speed_pos_req, low, 2.0)
        u_inf = u_inf_val if u_inf_val is not None and u_inf_val > 0 else 2.0

        alpha_val, alpha_unit = _extract_first_float_with_unit(
            rf"(?:alpha|α|angle\s+of\s+attack)\s*(?:=|of|is|at)?\s*{_num_pat(signed=True, units=_ANGLE_UNITS)}",
            raw,
        )
        if alpha_val is not None and alpha_unit.startswith("rad"):
            alpha_val = math.degrees(alpha_val)
        alpha_deg = alpha_val if alpha_val is not None else 0.0

        len_pos = _num_pat(signed=False, units=_LEN_UNITS)
        cyl_r = _extract_first_float(rf"(?:\bradius\s*(?:of|=|is)?|\ba\s*=)\s*{len_pos}", raw, 1.0)
        a_val = cyl_r if cyl_r is not None and cyl_r > 0 else 1.0
        kappa = round(2.0 * math.pi * u_inf * (a_val ** 2), 4)

        is_half_body = any(k in low for k in ["rankine half", "half-body", "half body"]) and "doublet" not in low and "cylinder" not in low
        sources = [{"x": 0.0, "y": 0.0, "m": 6.0}] if is_half_body else []
        doublets = [] if is_half_body else [{"x": 0.0, "y": 0.0, "kappa": kappa}]

        gamma_ext = _extract_first_float(
            rf"(?:gamma|γ|Γ|circulation)\s*(?:=|of|is|at)?\s*{_num_pat(signed=True, units=_CIRC_UNITS)}",
            raw,
        )
        if gamma_ext is not None:
            gamma_val = gamma_ext
            if "clockwise" in low and "counter" not in low and gamma_val > 0:
                gamma_val = -gamma_val
        elif any(k in low for k in ["zero circulation", "without circulation", "d'alembert"]):
            gamma_val = 0.0
        elif "clockwise" in low and "counter" not in low:
            gamma_val = -12.566
        elif any(k in low for k in ["counterclockwise", "counter-clockwise", "ccw"]):
            gamma_val = 12.566
        else:
            gamma_val = 0.0 if is_half_body else -12.566
        vortices = [{"x": 0.0, "y": 0.0, "gamma": round(gamma_val, 4)}] if abs(gamma_val) > 1e-9 else []

        return ParsedPhysicsQuery(
            family="potential_superposition",
            confidence=0.93,
            assumptions={"steady": True, "incompressible": True, "inviscid": True, "irrotational": True},
            params={
                "u_inf": u_inf,
                "alpha_deg": alpha_deg,
                "sources": sources,
                "doublets": doublets,
                "vortices": vortices,
            },
            concept_twist="Adding circulation Γ breaks aft-fore pressure symmetry and produces finite Kutta-Joukowski Magnus lift L' = -ρ U∞ Γ without viscosity.",
            broken_shortcut="Expecting zero lift (D'Alembert paradox) around a rotating/circulating cylinder or applying viscous airfoil drag to potential flow.",
            textbook_ref="Potential Superposition & Magnus Circulation",
            raw_query=raw,
        )

    # 4. Vortex flows (Free vs Forced vs Rankine vs Spiral)
    if "vortex" in low or ("bend" in low and "free" in low):
        mode = "forced" if "forced" in low or "solid-body" in low or "solid body" in low else (
            "rankine" if "rankine" in low or "combined" in low else (
                "spiral" if "spiral" in low else "free"
            )
        )
        len_pos = _num_pat(signed=False, units=_LEN_UNITS)
        r1_val = _extract_first_float(
            rf"(?:inner\s*(?:wall\s*)?(?:radii|radius)(?:\s*(?:=|of|is|at))?|\br1\s*=|inner\s+wall\s*(?:(?:at\s+)?r\s*=|at|is|of|=))\s*{len_pos}",
            raw,
            0.15,
        )
        r1 = r1_val if r1_val is not None else 0.15
        r2_val = _extract_first_float(
            rf"(?:outer\s*(?:wall\s*)?(?:radii|radius)(?:\s*(?:=|of|is|at))?|\br2\s*=|outer\s+wall\s*(?:(?:at\s+)?r\s*=|at|is|of|=))\s*{len_pos}",
            raw,
            0.45,
        )
        r2 = r2_val if r2_val is not None else 0.45
        core_val = _extract_first_float(
            rf"(?:core\s+radius(?:\s+rc)?|\brc\b)\s*(?:=|of|is|at)?\s*{len_pos}",
            raw,
            0.30,
        )
        core_radius = core_val if core_val is not None and core_val > 0 else 0.30
        omega_val, omega_unit = _extract_first_float_with_unit(
            rf"(?:\bomega\b|\bω\b|angular\s*(?:velocity|speed|frequency)?)\s*(?:=|of|is|at)?\s*{_num_pat(signed=False, units=r'rad/s|rpm|s\^-1|1/s')}",
            raw,
        )
        if omega_val is None:
            omega_val, omega_unit = _extract_first_float_with_unit(
                _num_pat(signed=False, units=r"rad/s|rpm", require_unit=True),
                low,
            )
        if omega_val is not None and omega_unit == "rpm":
            omega_val *= 2.0 * math.pi / 60.0
        omega = omega_val if omega_val is not None else 10.0
        c_ext = _extract_first_float(
            rf"\bc\s*=\s*{_num_pat(signed=False, units=_CIRC_UNITS)}",
            raw,
            0.9,
        )
        c_val = c_ext if c_ext is not None else 0.9
        return ParsedPhysicsQuery(
            family="vortex_flow",
            confidence=0.92,
            assumptions={"steady": True, "incompressible": True, "inviscid": True, "irrotational": mode in {"free", "spiral"}},
            params={
                "mode": mode,
                "strength_c": c_val,
                "omega": omega,
                "core_radius": core_radius,
                "r1": r1,
                "r2": max(r2, r1 + 0.05),
                "r_max": max(0.6, r2 * 1.25, core_radius * 1.5),
            },
            concept_twist=(
                "Forced vortex has constant vorticity Ωz = 2ω: total head increases outward (dH/dr = 2ω²r/g), reversing naive Bernoulli Δp sign."
                if mode in {"forced", "rankine"}
                else "Free vortex is irrotational for r > 0 (dH/dr = 0), so Bernoulli applies across streamlines away from the singular core."
            ),
            broken_shortcut="Using Bernoulli between concentric radii r1 and r2 in a rotational forced vortex core.",
            textbook_ref="Vortex Dynamics & Radial Pressure Balance",
            raw_query=raw,
        )

    # 5. Hydraulic Jump
    if any(k in low for k in ["hydraulic jump", "sluice", "conjugate depth", "apron", "froude"]):
        len_pos = _num_pat(signed=False, units=_LEN_UNITS)
        len_pos_req = _num_pat(signed=False, units=_LEN_UNITS, require_unit=True)
        speed_pos = _num_pat(signed=False, units=_SPEED_UNITS)
        speed_pos_req = _num_pat(signed=False, units=_SPEED_UNITS, require_unit=True)
        flow_req = _num_pat(signed=False, units=_FLOW_UNITS, require_unit=True)
        flow_opt = _num_pat(signed=False, units=_FLOW_UNITS)

        v1_val = _extract_first_float(
            rf"(?:\bv1\b|upstream\s+(?:velocity|speed)|(?<!downstream\s)\bvelocity)\s*(?:of|is|=|at)?\s*{speed_pos}",
            raw,
        )
        if v1_val is None:
            v1_val = _extract_first_float(rf"\bat\s+{speed_pos_req}", raw)
        if v1_val is None:
            v1_val = _extract_first_float(speed_pos_req, raw, 6.1)
        v1 = v1_val if v1_val is not None else 6.1

        h1 = _extract_first_float(rf"\bh1\s*=\s*{len_pos}", raw)
        if h1 is None:
            h1 = _extract_first_float(
                rf"(?<!conjugate\s)(?<!downstream\s)(?<!subcritical\s)(?<!sequent\s){len_pos_req}\s*(?:initial\s+|upstream\s+)?depth\b",
                low,
            )
        if h1 is None:
            h1 = _extract_first_float(
                rf"(?<!conjugate\s)(?<!downstream\s)(?<!subcritical\s)(?<!sequent\s)\b(?:initial\s+|upstream\s+)?depth\s*(?:of|is|=)?\s*{len_pos}",
                low,
            )

        q = _extract_first_float(flow_req, raw)
        if q is None:
            q = _extract_first_float(rf"(?:discharge|flow\s*rate)\s*(?:of|is|=)?\s*{flow_opt}", raw)
        if q is None:
            q = _extract_first_float(rf"\bQ\s*=\s*{flow_opt}", raw, flags=0)

        w = _extract_first_float(rf"{len_pos_req}\s*wide\b", low)
        if w is None:
            w_val = _extract_first_float(rf"\bwidth\s*(?:of|is|=)?\s*{len_pos}", raw, 6.1)
            w = w_val if w_val is not None else 6.1
        return ParsedPhysicsQuery(
            family="hydraulic_jump",
            confidence=0.95,
            assumptions={"steady": True, "incompressible": True, "inviscid": False, "irreversible_jump": True},
            params={"width": w, "v1": v1, "h1": h1 if h1 is not None else (0.305 if q is None else None), "discharge": q},
            concept_twist="Hydraulic jump dissipates mechanical head hj = (h2-h1)³/(4h1h2) via turbulent rollers; only momentum is conserved.",
            broken_shortcut="Equating upstream & downstream specific energy (Es1 = Es2), which overpredicts subcritical depth h2.",
            textbook_ref="Hydraulic Jump & Energy Dissipation",
            raw_query=raw,
        )

    # 6. Sudden pipe expansion (Borda-Carnot)
    if any(k in low for k in ["sudden expansion", "sudden enlargement", "abrupt enlargement", "abruptly into", "abrupt expansion", "borda"]):
        d1, d2 = 0.10, 0.20
        len_pos = _num_pat(signed=False, units=_LEN_UNITS)
        d1_ext = _extract_first_float(rf"\bD1\s*=\s*{len_pos}", raw)
        d2_ext = _extract_first_float(rf"\bD2\s*=\s*{len_pos}", raw)
        if d1_ext is not None and d2_ext is not None and d2_ext > d1_ext:
            d1, d2 = d1_ext, d2_ext
        else:
            m_pair = re.search(rf"{len_pos}\s*(?:to|into)\s*{len_pos}", low)
            if m_pair:
                try:
                    u1 = (m_pair.group(2) or "").lower()
                    u2 = (m_pair.group(4) or "").lower()
                    if not u1 and u2 in {"mm", "cm"}:
                        u1 = u2
                    d1_c = _convert_unit_value(float(m_pair.group(1)), u1)
                    d2_c = _convert_unit_value(float(m_pair.group(3)), u2)
                    if d2_c > d1_c > 0:
                        d1, d2 = d1_c, d2_c
                except (ValueError, TypeError):
                    d1, d2 = 0.10, 0.20
        speed_pos = _num_pat(signed=False, units=_SPEED_UNITS)
        speed_pos_req = _num_pat(signed=False, units=_SPEED_UNITS, require_unit=True)
        v1_val = _extract_first_float(rf"\bV1\s*=\s*{speed_pos}", raw)
        if v1_val is None:
            v1_val = _extract_first_float(speed_pos_req, low, 4.0)
        v1 = v1_val if v1_val is not None else 4.0
        return ParsedPhysicsQuery(
            family="sudden_expansion",
            confidence=0.93,
            assumptions={"steady": True, "incompressible": True, "inviscid": False, "irreversible_jump": True},
            params={"D1": d1, "D2": d2, "V1": v1},
            concept_twist="Annular corner pressure remains ~p1 during jet separation; turbulent mixing dissipates (V1-V2)²/2g.",
            broken_shortcut="Ideal Bernoulli Δp = ½ρ(V1²-V2²), overestimating downstream pressure recovery.",
            textbook_ref="Borda–Carnot Pipe Expansion Momentum",
            raw_query=raw,
        )

    # 7. Accelerating / Free-fall tank (Non-inertial)
    if any(k in low for k in ["free fall", "free-fall", "falling", "accelerating tank", "orifice", "leak"]):
        is_ff = any(k in low for k in ["free fall", "free-fall", "falling"])
        accel_pat = _num_pat(signed=True, units=_ACCEL_UNITS)
        ax_val = _extract_first_float(rf"\bax\s*=\s*{accel_pat}", raw, 0.0 if is_ff else 3.0)
        ax = ax_val if ax_val is not None else (0.0 if is_ff else 3.0)
        az_val = _extract_first_float(rf"\baz\s*=\s*{accel_pat}", raw)
        if az_val is not None:
            az = az_val
        elif is_ff or re.search(r"\baz\s*=\s*-\s*g\b", low):
            az = -9.81
        else:
            az = 0.0
        len_pos = _num_pat(signed=False, units=_LEN_UNITS)
        h0_val = _extract_first_float(
            rf"(?:\bh0\s*=|\bh\s*=|depth\s*(?:of|is|=)?)\s*{len_pos}",
            raw,
            0.50,
        )
        h0 = h0_val if h0_val is not None and h0_val > 0 else 0.50
        return ParsedPhysicsQuery(
            family="accelerating_tank",
            confidence=0.91,
            assumptions={"steady": True, "incompressible": True, "inertial_frame": False},
            params={"ax": ax, "az": az, "h0": h0},
            concept_twist="Non-inertial gravity g_eff = g + az vanishes in free fall (dp/dz = 0), so liquid remains horizontal and stops leaking!",
            broken_shortcut="Using static Torricelli √(2gh) in a freely falling frame.",
            textbook_ref="Accelerating Tank & Non-Inertial Hydrostatics",
            raw_query=raw,
        )

    # 8. Two-layer immiscible channel
    if any(k in low for k in ["two-layer", "two layer", "immiscible", "separate layers"]):
        visc_pat = _num_pat(signed=False, units=_VISC_UNITS)
        dpdx_pat = _num_pat(signed=True, units=_DPDX_UNITS)
        mu1_val = _extract_first_float(rf"(?:\bmu1\b|μ1|µ1)\s*=\s*{visc_pat}", raw, 0.005)
        mu2_val = _extract_first_float(rf"(?:\bmu2\b|μ2|µ2)\s*=\s*{visc_pat}", raw, 0.001)
        dp_val = _extract_first_float(rf"(?:dp\s*/\s*dx|\bdp_dx\b)\s*=\s*{dpdx_pat}", raw, -1000.0)
        mu1 = mu1_val if mu1_val is not None and mu1_val > 0 else 0.005
        mu2 = mu2_val if mu2_val is not None and mu2_val > 0 else 0.001
        dp_dx = dp_val if dp_val is not None else -1000.0
        return ParsedPhysicsQuery(
            family="two_layer_poiseuille",
            confidence=0.92,
            assumptions={"steady": True, "incompressible": True, "inviscid": False, "irrotational": False},
            params={"mu1": mu1, "mu2": mu2, "dp_dx": dp_dx},
            concept_twist="Interface enforces shear stress continuity μ1(du1/dy) = μ2(du2/dy), producing a slope kink and peak inside the less viscous layer.",
            broken_shortcut="Assuming du1/dy = du2/dy across the interface or u_max at geometric centerline y = 0.",
            textbook_ref="Two-Layer Viscous Channel Flow",
            raw_query=raw,
        )

    # 9. Generalized Couette-Poiseuille
    if any(k in low for k in ["couette", "moving plate", "upper plate", "plate moves", "zero net flow", "recirculat"]):
        p_pat = _num_pat(signed=True)
        p_ext = _extract_first_float(rf"(?<!pressure\s)\bP\s*=\s*{p_pat}", raw, flags=0)
        if p_ext is None:
            p_ext = _extract_first_float(rf"(?<!pressure\s)\bp\s*=\s*{p_pat}", raw, flags=0)
        p_def = -3.0 if ("zero net" in low or "zero flow" in low) else (-1.0 if "zero shear" in low else -2.0)
        p_val = p_ext if p_ext is not None else p_def
        return ParsedPhysicsQuery(
            family="couette_poiseuille",
            confidence=0.90,
            assumptions={"steady": True, "incompressible": True, "inviscid": False, "irrotational": False, "adverse_pressure_gradient": p_val < 0},
            params={"P": p_val},
            concept_twist="Adverse pressure gradient P < -1 triggers backflow near the stationary wall; P = -3 yields zero net discharge Q = 0.",
            broken_shortcut="Neglecting opposing pressure gradient curvature in plate-driven shear flow.",
            textbook_ref="Generalized Couette–Poiseuille Backflow",
            raw_query=raw,
        )

    # 10. Wall slip & Herschel-Bulkley / non-Newtonian
    if any(
        k in low
        for k in [
            "slip",
            "herschel",
            "bingham",
            "yield stress",
            "yield-stress",
            "non-newtonian",
            "shear thinning",
            "shear-thinning",
            "plug",
        ]
    ):
        no_yield = any(k in low for k in ["no yield", "zero yield", "without yield"])
        stress_pat = _num_pat(signed=False, units=_STRESS_UNITS)
        tau_y_val = (
            None
            if no_yield
            else _extract_first_float(
                rf"(?:\btau_?y\b|τ_?y|yield[-\s]+(?:stress|threshold)(?:\s*(?:=|of|is))?)\s*(?:=|of|is|:)?\s*{stress_pat}",
                raw,
            )
        )
        has_plug_cue = ("plug" in low or "bingham" in low or "herschel" in low) and not no_yield
        tau_y_def = 3.0 if has_plug_cue else 0.0
        tau_y = tau_y_val if tau_y_val is not None else tau_y_def

        slip_pat = _num_pat(signed=False, units=_SLIP_LEN_UNITS)
        has_slip = bool(re.search(r"(?<!no[-\s])(?<!zero[-\s])(?<!without\s)\bslip\b|\bl_?s\s*=", low))
        ls_def = 0.00025 if has_slip else 0.0
        ls_val = _extract_first_float(rf"(?<!no[-\s])\bl_?s\b\s*(?:=|of|is|:)?\s*{slip_pat}", raw)
        if ls_val is None:
            ls_val = _extract_first_float(
                rf"(?<!no[-\s])(?<!zero[-\s])(?<!without\s)\bslip(?:[-\s]+length)?\s*(?:=|of|is|:)?\s*{slip_pat}",
                raw,
            )
        ls = ls_val if ls_val is not None else ls_def

        n_ext = _extract_first_float(
            rf"(?:flow\s+index\s+|power[- ]law\s+index\s+)?\bn\s*(?:=|of|is)\s*{_num_pat(signed=False)}",
            raw,
        )
        n_def = 0.65 if ("thinning" in low or "herschel" in low) else 1.0
        n_val = n_ext if n_ext is not None else n_def
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
            concept_twist="Navier wall slip boosts discharge by $1 + 3 l_s / H$ while yield stress τ_y creates an unyielded solid-like plug core |τ| ≤ τ_y.",
            broken_shortcut="Standard no-slip Newtonian Hagen-Poiseuille parabolic law.",
            textbook_ref="Non-Newtonian Yield & Navier Slip",
            raw_query=raw,
        )

    # 11. Boundary layer separation / Falkner-Skan
    if any(k in low for k in ["falkner", "blasius"]):
        beta_ext = _extract_first_float(rf"(?:\bbeta\b|β)\s*(?:=|of|is)?\s*{_num_pat(signed=True)}", raw, -0.15)
        beta_val = 0.0 if ("blasius" in low or "flat plate" in low) else (beta_ext if beta_ext is not None else -0.15)
        return ParsedPhysicsQuery(
            family="falkner_skan",
            confidence=0.93,
            assumptions={"steady": True, "incompressible": True, "inviscid": False, "irrotational": False, "adverse_pressure_gradient": beta_val < 0},
            params={"beta": max(-0.198, min(1.5, beta_val))},
            concept_twist="Exact similarity ODE f''' + f f'' + β(1 - (f')²) = 0: adverse β < 0 pushes wall curvature positive and approaches separation at β ≈ -0.1988.",
            broken_shortcut="Using Blasius flat-plate friction Cf·√Rex = 0.6641 when β ≠ 0 (non-zero streamwise pressure gradient).",
            textbook_ref="Falkner–Skan Boundary Layer",
            raw_query=raw,
        )

    if any(k in low for k in ["separation", "adverse pressure", "inflection", "d'alembert", "pohlhausen"]):
        lam_def = -14.0 if "backflow" in low or "separat" in low else -6.0
        lam_ext = _extract_first_float(rf"(?:\blambda(?:_?pg)?\b|Λ|λ)\s*(?:=|of|is)?\s*{_num_pat(signed=True)}", raw)
        lam_val = max(-18.0, min(12.0, lam_ext)) if lam_ext is not None else lam_def
        return ParsedPhysicsQuery(
            family="bl_separation",
            confidence=0.92,
            assumptions={"steady": True, "incompressible": True, "inviscid": False, "irrotational": False, "adverse_pressure_gradient": True},
            params={"lambda_pg": lam_val},
            concept_twist="Adverse dp/dx > 0 enforces positive wall curvature ∂²u/∂y²|w > 0 and an interior inflection point; detachment hits at τ_w = 0.",
            broken_shortcut="Assuming potential Cp around cylinder rear or treating d²u/dy²|w = 0 as separation.",
            textbook_ref="Boundary Layer Separation & Wall Curvature",
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
        re_ext = _extract_first_float(rf"(?:reynolds(?:\s+number)?|\bre\b)\s*(?:=|of|is)?\s*{_num_pat(signed=False)}", raw, 105.0)
        re_val = re_ext if re_ext is not None else 105.0
        return ParsedPhysicsQuery(
            family="lbm_tunnel",
            confidence=0.88,
            assumptions={"steady": False, "incompressible": True, "inviscid": False, "irrotational": False, "adverse_pressure_gradient": True},
            params={"preset": preset, "reynolds": max(25.0, min(160.0, re_val))},
            obstacles=obstacles,
            concept_twist="Bluff body wakes shed alternating Kármán vortices above critical Re unless stabilized by a wake splitter baffle.",
            broken_shortcut="Steady inviscid potential theory predicts zero drag (D'Alembert paradox) and symmetric aft streamlines.",
            textbook_ref="Computational Fluid Dynamics (LBM Wake Shedding)",
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
        textbook_ref="Fluid Mechanics Core Principles",
        unsupported_reason=(
            "Try pasting an explicit 2D equation (e.g., 'u = x/(1+t), v = 2'), a fluid mechanics problem "
            "(hydraulic jump, forced vortex, rotating tank, two-layer flow, sudden expansion, BL separation), "
            "or a 2D obstacle description (e.g., 'flow past cylinder with splitter plate')."
        ),
        raw_query=raw,
    )


_SYSTEM_PARSE_PROMPT = """You are a strict Neuro-Symbolic Fluid Mechanics Problem Translator.
Convert the student's text into a JSON object matching:
{
  "family": one of ["kinematics_equation","vortex_flow","rotating_vessel","potential_superposition","falkner_skan","bl_separation","couette_poiseuille","two_layer_poiseuille","slip_herschel_bulkley","hydraulic_jump","sudden_expansion","accelerating_tank","lbm_tunnel","unsupported_3d"],
  "confidence": 0.0 to 1.0,
  "assumptions": {"steady": bool, "incompressible": bool, "inviscid": bool, "irrotational": bool, "no_slip": bool, "newtonian": bool, "inertial_frame": bool, "adverse_pressure_gradient": bool, "irreversible_jump": bool},
  "params": { solver keyword params in SI units },
  "obstacles": [ optional {"type":"circle"|"rect","x":0.25,"y":0.5,"r":0.1,"x0":0.3,"y0":0.45,"x1":0.55,"y1":0.55} ],
  "concept_twist": "one crisp sentence naming the broken assumption",
  "broken_shortcut": "one crisp sentence naming what naive textbook formula fails",
  "textbook_ref": "topic area reference",
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
