"""Solver-grounded Conceptual Doubt Coach.

Answers student doubts strictly anchored to verified numerical solver residuals
and Som, Biswas & Chakraborty textbook citations. Never guesses numbers blindly.
"""

from __future__ import annotations

import math
import re
from typing import Any
from fluidscope.ai.schemas import DoubtCoachReply, LLMConfig, ParsedPhysicsQuery
from fluidscope.ai.llm_client import call_llm_json


_NO_NEG_ZERO_RE = re.compile(r"(^|[\s=:(\[,${])-0\.(0+)(?!\d)")

_FAMILY_EQUATION_TEX: dict[str, str] = {
    "kinematics_equation": r"Material acceleration splits as $\mathbf{a} = \partial\mathbf{V}/\partial t + (\mathbf{V}\cdot\nabla)\mathbf{V}$, with vorticity $\Omega_z = \partial v/\partial x - \partial u/\partial y$.",
    "vortex_flow": r"Radial equilibrium follows Euler's normal equation $\partial p/\partial r = \rho v_\theta^2/r$, giving cross-stream head gradient $\partial H/\partial r = v_\theta \Omega_z / g$.",
    "rotating_vessel": r"Solid-body rotation $v_\theta = \omega r$ gives paraboloid free surface $z(r) = z_0 + \omega^2 r^2 / (2g)$ and $\partial H/\partial r = \omega^2 r / g$.",
    "potential_superposition": r"Superposed linear potential satisfies $\nabla^2\psi = 0$, $C_p = 1 - |\mathbf{V}|^2/U_\infty^2$, and Kutta-Joukowski lift $L' = -\rho U_\infty \Gamma$.",
    "hydraulic_jump": r"Specific force balance yields Belanger's equation $h_2/h_1 = \frac{1}{2}\left(\sqrt{1 + 8\,\mathrm{Fr}_1^2} - 1\right)$ with head loss $h_j = (h_2 - h_1)^3 / (4 h_1 h_2)$.",
    "sudden_expansion": r"Control-volume momentum yields $\Delta p_{\text{true}} = \rho V_2(V_1 - V_2)$ and Borda-Carnot eddy loss $h_L = (V_1 - V_2)^2/(2g)$.",
    "accelerating_tank": r"Non-inertial equilibrium satisfies $\nabla p = \rho(\mathbf{g} - \mathbf{a})$, with effective gravity $g_{\text{eff}} = g + a_z$ and free-surface slope $\tan\theta = -a_x/(g+a_z)$.",
    "two_layer_poiseuille": r"At the interface $y=0$, velocity and shear stress are continuous: $\mu_1(du_1/dy) = \mu_2(du_2/dy)$.",
    "couette_poiseuille": r"Dimensionless velocity follows $u/U = \frac{y}{H} + P\frac{y}{H}\left(1 - \frac{y}{H}\right)$ with zero net flux at $P = -3$.",
    "slip_herschel_bulkley": r"Fluid yields only where $|\tau| > \tau_y$ with constitutive law $\tau = \tau_y + K|\dot{\gamma}|^n$ and Navier wall slip $u_w = l_s|\partial u/\partial y|_w$.",
    "falkner_skan": r"Similarity ODE $f''' + f f'' + \beta\left(1 - (f')^2\right) = 0$ separates when adverse pressure gradient reaches $\beta \approx -0.1988$.",
    "bl_separation": r"At the wall, Navier-Stokes gives $\mu(\partial^2 u/\partial y^2)_w = dp/dx > 0$, creating an inflection point prior to detachment $\tau_w = 0$.",
    "lbm_tunnel": r"Viscous wake shedding solves incompressible $\partial\mathbf{V}/\partial t + (\mathbf{V}\cdot\nabla)\mathbf{V} = -\nabla p/\rho + \nu\nabla^2\mathbf{V}$ with wall vorticity generation $\Omega_z \neq 0$.",
}


def _clamp_neg_zero_text(text: str) -> str:
    return _NO_NEG_ZERO_RE.sub(r"\g<1>0.\2", str(text))


def _fmt_num(val: Any, decimals: int = 3, sci: bool = False) -> str:
    try:
        v = float(val)
    except (TypeError, ValueError):
        v = 0.0
    if not math.isfinite(v):
        v = 0.0
    if not sci and abs(v) < 0.5 * (10.0 ** (-decimals)):
        v = 0.0
    elif sci and abs(v) < 1e-12:
        v = 0.0
    return f"{v:.{decimals}e}" if sci else f"{v:.{decimals}f}"


def _summarize_solver_facts(parsed: ParsedPhysicsQuery | None, solver_data: dict[str, Any] | None) -> list[str]:
    facts: list[str] = []
    if not solver_data or not parsed:
        return facts

    fam = parsed.family
    if fam == "kinematics_equation":
        cls = solver_data.get("classification", {})
        pr = solver_data.get("point_probe", {})
        st = solver_data.get("stokes_check", {})
        facts.append(
            f"Steady = {cls.get('steady')}, Incompressible = {cls.get('incompressible')}, Irrotational = {cls.get('irrotational')}"
        )
        if pr.get("vorticity_z") is not None:
            facts.append(
                f"Probe vorticity $\\Omega_z = {_fmt_num(pr['vorticity_z'], 3)}\\text{{ s}}^{{-1}}$, "
                f"divergence $\\nabla\\cdot\\mathbf{{V}} = {_fmt_num(pr.get('divergence', 0.0), 3)}\\text{{ s}}^{{-1}}$"
            )
        if st.get("circulation_line") is not None:
            facts.append(
                f"Stokes circulation $\\Gamma_{{\\text{{line}}}} = {_fmt_num(st['circulation_line'], 3)}$ "
                f"vs $\\iint \\Omega_z\\,dA = {_fmt_num(st.get('circulation_area_vorticity', 0.0), 3)}$"
            )
    elif fam == "vortex_flow":
        pr = solver_data.get("probes", {})
        facts.append(
            f"Mode = {solver_data.get('mode')} | Bernoulli globally valid = {solver_data.get('bernoulli_globally_valid')}"
        )
        facts.append(
            f"True Euler $\\Delta p(r_1 \\to r_2) = {_fmt_num((pr.get('dp_true') or 0.0) / 1000.0, 3)}\\text{{ kPa}}$ "
            f"vs Naive Bernoulli $= {_fmt_num((pr.get('dp_naive') or 0.0) / 1000.0, 3)}\\text{{ kPa}}$"
        )
        facts.append(
            f"Cross-stream total head change $\\Delta H = {_fmt_num(pr.get('head_gain_r1_to_r2', 0.0), 3)}\\text{{ m}}$ (Eq. 4.44 / 4.57)"
        )
    elif fam == "rotating_vessel":
        facts.append(
            f"Regime = {solver_data.get('regime')} at $\\omega = {_fmt_num(solver_data.get('omega', 0.0), 2)}\\text{{ rad/s}}$ "
            f"(${_fmt_num(solver_data.get('rpm', 0.0), 0)}\\text{{ rpm}}$)"
        )
        facts.append(
            f"Uncovered dry base area $A_{{\\text{{dry}}}} = {_fmt_num(solver_data.get('uncovered_area', 0.0), 4)}\\text{{ m}}^2$, "
            f"paraboloid height $h_p = {_fmt_num(solver_data.get('paraboloid_height', 0.0), 3)}\\text{{ m}}$"
        )
    elif fam == "potential_superposition":
        gamma = solver_data.get("total_circulation", 0.0)
        lift = solver_data.get("lift_per_unit_span", 0.0)
        cyl_r = solver_data.get("equivalent_cylinder_radius")
        stag_n = len(solver_data.get("stagnation_points") or [])
        u_inf_val = (parsed.params or {}).get("u_inf")
        u_part = f"Freestream $U_\\infty = {_fmt_num(u_inf_val, 2)}\\text{{ m/s}}$ | " if u_inf_val is not None else ""
        facts.append(
            f"{u_part}Total circulation $\\Gamma = {_fmt_num(gamma, 3)}\\text{{ m}}^2/\\text{{s}}$, "
            f"Kutta-Joukowski lift $L' = -\\rho U_\\infty \\Gamma = {_fmt_num(lift, 2)}\\text{{ N/m}}$"
        )
        if cyl_r is not None:
            facts.append(
                f"Equivalent cylinder radius $a = {_fmt_num(cyl_r, 3)}\\text{{ m}}$ with {stag_n} analytical stagnation point(s)"
            )
        else:
            facts.append(
                f"Linear potential superposition ($\\nabla^2\\psi = 0$) with {stag_n} analytical cylinder stagnation point(s)"
            )
    elif fam == "hydraulic_jump":
        facts.append(
            f"$\\mathrm{{Fr}}_1 = {_fmt_num(solver_data.get('Fr1', 0.0), 2)} \\Rightarrow$ "
            f"true conjugate $h_2 = {_fmt_num(solver_data.get('h2_true', 0.0), 3)}\\text{{ m}}$ "
            f"vs Naive Bernoulli $h_{{2,\\text{{naive}}}} = {_fmt_num(solver_data.get('h2_naive_bernoulli', 0.0), 3)}\\text{{ m}}$"
        )
        facts.append(
            f"Irreversible head loss $h_j = {_fmt_num(solver_data.get('head_loss_hj', 0.0), 3)}\\text{{ m}}$, "
            f"power dissipated $= {_fmt_num((solver_data.get('power_loss_W') or 0.0) / 1000.0, 2)}\\text{{ kW}}$"
        )
    elif fam == "sudden_expansion":
        facts.append(
            f"Momentum $\\Delta p_{{\\text{{true}}}} = {_fmt_num((solver_data.get('dp_true') or 0.0) / 1000.0, 2)}\\text{{ kPa}}$ "
            f"vs Naive Bernoulli $= {_fmt_num((solver_data.get('dp_naive') or 0.0) / 1000.0, 2)}\\text{{ kPa}}$"
        )
        facts.append(f"Borda-Carnot eddy loss $h_L = {_fmt_num(solver_data.get('head_loss_hL', 0.0), 3)}\\text{{ m}}$")
    elif fam == "accelerating_tank":
        facts.append(
            f"Regime = {solver_data.get('regime')} | $g_{{\\text{{eff}}}} = {_fmt_num(solver_data.get('g_effective', 0.0), 2)}\\text{{ m/s}}^2$ | "
            f"Tilt $\\theta = {_fmt_num(solver_data.get('tilt_deg', 0.0), 2)}^\\circ$"
        )
        facts.append(
            f"True orifice exit speed $v_{{\\text{{exit}}}} = {_fmt_num(solver_data.get('orifice_v_true', 0.0), 2)}\\text{{ m/s}}$ "
            f"vs static naive $= {_fmt_num(solver_data.get('orifice_v_naive_static', 0.0), 2)}\\text{{ m/s}}$"
        )
    elif fam == "two_layer_poiseuille":
        facts.append(
            f"Interface shear continuity $\\mu_1(du_1/dy) = \\mu_2(du_2/dy) = {_fmt_num(solver_data.get('interface_shear', 0.0), 4)}\\text{{ Pa}}$"
        )
        facts.append(
            f"Slope kink: $du_1/dy = {_fmt_num(solver_data.get('interface_slope_1', 0.0), 2)} \\neq "
            f"du_2/dy = {_fmt_num(solver_data.get('interface_slope_2', 0.0), 2)}$; peak at $y = {_fmt_num(solver_data.get('y_peak', 0.0), 4)}\\text{{ m}}$"
        )
    elif fam == "couette_poiseuille":
        facts.append(
            f"Regime = {solver_data.get('regime')} | $P = {_fmt_num(solver_data.get('P', 0.0), 2)}$, "
            f"net $Q = {_fmt_num(solver_data.get('q_per_width', 0.0), 3, sci=True)}\\text{{ m}}^2/\\text{{s}}$"
        )
    elif fam == "slip_herschel_bulkley":
        facts.append(
            f"Slip velocity $u_w = {_fmt_num(solver_data.get('u_slip_wall', 0.0), 3)}\\text{{ m/s}}$ | "
            f"Plug core fraction $= {_fmt_num((solver_data.get('plug_fraction') or 0.0) * 100.0, 1)}\\%$"
        )
        facts.append(f"Flux ratio vs no-slip Newtonian $= {_fmt_num(solver_data.get('flux_ratio', 0.0), 2)}\\times$")
    elif fam in {"bl_separation", "falkner_skan"}:
        ws = solver_data.get("wall_shear_dimless", solver_data.get("wall_shear_fpp0", 0.0))
        eta_pi = solver_data.get("inflection_eta")
        eta_txt = _fmt_num(eta_pi, 3) if eta_pi is not None else "\\text{None}"
        facts.append(f"Wall shear metric $= {_fmt_num(ws, 4)}$; inflection $\\eta_{{\\text{{PI}}}} = {eta_txt}$")
    elif fam == "lbm_tunnel":
        facts.append(
            f"D2Q9 preset = {solver_data.get('preset')} | $\\mathrm{{Re}} = {_fmt_num(solver_data.get('reynolds', 0.0), 0)}$ | "
            f"Wake RMS $= {_fmt_num(solver_data.get('wake_oscillation_rms', 0.0), 4)}$"
        )
    return [_clamp_neg_zero_text(f) for f in facts]


def answer_doubt(
    question: str,
    parsed: ParsedPhysicsQuery | None,
    solver_data: dict[str, Any] | None,
    cfg: LLMConfig | None = None,
) -> DoubtCoachReply:
    """Provide grounded conceptual answer tied strictly to computed physics facts."""
    cfg = cfg or LLMConfig()
    facts = _summarize_solver_facts(parsed, solver_data)
    cite = parsed.textbook_ref if parsed else "Som, Biswas & Chakraborty (3rd Ed.)"

    if cfg.provider != "offline":
        sys_p = (
            "You are a concise IIT Kharagpur Fluid Mechanics TA coaching a student from Som, Biswas & Chakraborty. "
            "Respond as JSON: {\"answer\": \"clear 2-4 sentence technical explanation\"}. "
            "STRICT RULE: Anchor your answer ONLY in the verified solver facts below; never invent different numbers or signs."
        )
        usr_p = f"Concept Twist: {parsed.concept_twist if parsed else ''}\nVerified Solver Facts:\n" + "\n".join(f"- {f}" for f in facts) + f"\n\nStudent Question: {question}"
        data, tag, _ = call_llm_json(sys_p, usr_p, cfg)
        if data and isinstance(data.get("answer"), str):
            return DoubtCoachReply(
                answer=_clamp_neg_zero_text(data["answer"]),
                grounded_facts=facts,
                textbook_citation=cite,
                provider_used=tag,
            )

    # Deterministic solver-grounded explanation with KaTeX math expressions
    q_low = (question or "").lower()
    if parsed and parsed.family == "unsupported_3d":
        ans = parsed.unsupported_reason or "This flow class is outside built exact 2D/1D solvers."
    elif parsed is None:
        ans = "Load or parse a fluid mechanics scenario first so I can ground the explanation in exact solver numbers."
    else:
        lead = f"**Core Concept Twist:** {parsed.concept_twist} "
        trap = f"**Why the shortcut fails:** {parsed.broken_shortcut} "
        if "bernoulli" in q_low:
            trap += (
                r"Bernoulli requires steady, incompressible, inviscid flow *and* irrotationality across streamlines "
                r"(Eq. 4.43: $\partial H / \partial n = V \Omega_z / g$) with zero eddy dissipation."
            )
        elif "streakline" in q_low or "pathline" in q_low or "streamline" in q_low:
            trap += (
                r"In unsteady flow ($\partial \mathbf{V}/\partial t \neq 0$), instantaneous velocity vectors rotate and stretch over time, "
                r"so dye released over past instants forms a distinct locus from one particle's trajectory."
            )
        elif "separat" in q_low or "inflection" in q_low:
            trap += (
                r"At the wall, Eq. (9.42) gives $\mu(\partial^2 u/\partial y^2)_w = dp/dx > 0$ under an adverse pressure gradient, "
                r"forcing an interior inflection point before wall shear $(\partial u/\partial y)_w = 0$ (separation, Eq. 9.41)."
            )
        elif "slip" in q_low or "plug" in q_low:
            trap += (
                r"Yield-stress fluids stay rigid where $|\tau| \le \tau_y$ (creating a flat plug velocity core), "
                r"while Navier slip shifts the wall boundary speed upward by $u_w = l_s |\partial u/\partial y|_w$."
            )
        else:
            eq_tex = _FAMILY_EQUATION_TEX.get(parsed.family, "")
            if eq_tex:
                trap += eq_tex
        num_summary = (" **Verified run telemetry:** " + " | ".join(facts) + ".") if facts else ""
        ans = lead + trap + num_summary

    return DoubtCoachReply(
        answer=_clamp_neg_zero_text(ans),
        grounded_facts=facts,
        textbook_citation=cite,
        provider_used="offline_grounded_coach",
    )

