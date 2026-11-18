"""Solver-grounded Conceptual Doubt Coach.

Answers student doubts strictly anchored to verified numerical solver residuals
and Som, Biswas & Chakraborty textbook citations. Never guesses numbers blindly.
"""

from __future__ import annotations

from typing import Any
from fluidscope.ai.schemas import DoubtCoachReply, LLMConfig, ParsedPhysicsQuery
from fluidscope.ai.llm_client import call_llm_json


def _summarize_solver_facts(parsed: ParsedPhysicsQuery | None, solver_data: dict[str, Any] | None) -> list[str]:
    facts: list[str] = []
    if not solver_data or not parsed:
        return facts

    fam = parsed.family
    if fam == "kinematics_equation":
        cls = solver_data.get("classification", {})
        pr = solver_data.get("point_probe", {})
        st = solver_data.get("stokes_check", {})
        facts.append(f"Steady = {cls.get('steady')}, Incompressible = {cls.get('incompressible')}, Irrotational = {cls.get('irrotational')}")
        if pr.get("vorticity_z") is not None:
            facts.append(f"Probe vorticity Ωz = {pr['vorticity_z']:.3f} s⁻¹, divergence = {pr.get('divergence', 0):.3f} s⁻¹")
        if st.get("circulation_line") is not None:
            facts.append(f"Stokes circulation Γ_line = {st['circulation_line']:.3f} vs ∬Ωz dA = {st.get('circulation_area_vorticity', 0):.3f}")
    elif fam == "vortex_flow":
        pr = solver_data.get("probes", {})
        facts.append(f"Mode = {solver_data.get('mode')} | Bernoulli globally valid = {solver_data.get('bernoulli_globally_valid')}")
        facts.append(f"True Euler Δp(r1→r2) = {pr.get('dp_true', 0)/1000:.3f} kPa vs Naive Bernoulli = {pr.get('dp_naive', 0)/1000:.3f} kPa")
        facts.append(f"Cross-stream total head change ΔH = {pr.get('head_gain_r1_to_r2', 0):.3f} m (Eq. 4.44 / 4.57)")
    elif fam == "rotating_vessel":
        facts.append(f"Regime = {solver_data.get('regime')} @ {solver_data.get('rpm', 0):.0f} rpm")
        facts.append(f"Uncovered dry base area = {solver_data.get('uncovered_area', 0):.4f} m², Paraboloid height = {solver_data.get('paraboloid_height', 0):.3f} m")
    elif fam == "hydraulic_jump":
        facts.append(f"Fr1 = {solver_data.get('Fr1', 0):.2f} -> True conjugate h2 = {solver_data.get('h2_true', 0):.3f} m vs Naive Bernoulli alternate h2 = {solver_data.get('h2_naive_bernoulli', 0):.3f} m")
        facts.append(f"Irreversible head loss hj = {solver_data.get('head_loss_hj', 0):.3f} m, Power dissipated = {solver_data.get('power_loss_W', 0)/1000:.2f} kW")
    elif fam == "sudden_expansion":
        facts.append(f"Momentum Δp_true = {solver_data.get('dp_true', 0)/1000:.2f} kPa vs Naive Bernoulli = {solver_data.get('dp_naive', 0)/1000:.2f} kPa")
        facts.append(f"Borda-Carnot loss hL = {solver_data.get('head_loss_hL', 0):.3f} m")
    elif fam == "accelerating_tank":
        facts.append(f"Regime = {solver_data.get('regime')} | g_eff = {solver_data.get('g_effective', 0):.2f} m/s² | Tilt = {solver_data.get('tilt_deg', 0):.2f}°")
        facts.append(f"True orifice exit speed = {solver_data.get('orifice_v_true', 0):.2f} m/s vs Static naive = {solver_data.get('orifice_v_naive_static', 0):.2f} m/s")
    elif fam == "two_layer_poiseuille":
        facts.append(f"Interface shear continuity μ1(du1/dy) = μ2(du2/dy) = {solver_data.get('interface_shear', 0):.4f} Pa")
        facts.append(f"Slope kink: du1/dy = {solver_data.get('interface_slope_1', 0):.2f} ≠ du2/dy = {solver_data.get('interface_slope_2', 0):.2f}; peak at y = {solver_data.get('y_peak', 0):.4f} m")
    elif fam == "couette_poiseuille":
        facts.append(f"Regime = {solver_data.get('regime')} | P = {solver_data.get('P', 0):.2f}, Net Q = {solver_data.get('q_per_width', 0):.3e} m²/s")
    elif fam == "slip_herschel_bulkley":
        facts.append(f"Slip velocity u_w = {solver_data.get('u_slip_wall', 0):.3f} m/s | Plug core fraction = {solver_data.get('plug_fraction', 0)*100:.1f}%")
        facts.append(f"Flux ratio vs No-Slip Newtonian = {solver_data.get('flux_ratio', 0):.2f}x")
    elif fam in {"bl_separation", "falkner_skan"}:
        facts.append(f"Wall shear metric = {solver_data.get('wall_shear_dimless', solver_data.get('wall_shear_fpp0', 0)):.4f}; Inflection η_PI = {solver_data.get('inflection_eta')}")
    elif fam == "lbm_tunnel":
        facts.append(f"D2Q9 Preset = {solver_data.get('preset')} | Re = {solver_data.get('reynolds', 0):.0f} | Wake RMS = {solver_data.get('wake_oscillation_rms', 0):.4f}")
    return facts


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
                answer=data["answer"],
                grounded_facts=facts,
                textbook_citation=cite,
                provider_used=tag,
            )

    # Deterministic solver-grounded explanation
    q_low = (question or "").lower()
    if parsed and parsed.family == "unsupported_3d":
        ans = parsed.unsupported_reason or "This flow class is outside built exact 2D/1D solvers."
    elif parsed is None:
        ans = "Load or parse a fluid mechanics scenario first so I can ground the explanation in exact solver numbers."
    else:
        lead = f"**Core Concept Twist:** {parsed.concept_twist} "
        trap = f"**Why the shortcut fails:** {parsed.broken_shortcut} "
        if "bernoulli" in q_low:
            trap += "Bernoulli requires steady, incompressible, inviscid flow *and* irrotationality across streamlines (Eq. 4.43: ∂H/∂n = V·Ωz/g) with zero eddy dissipation."
        elif "streakline" in q_low or "pathline" in q_low or "streamline" in q_low:
            trap += "In unsteady flow (∂V/∂t ≠ 0), instantaneous velocity vectors rotate/stretch over time, so dye released over past instants forms a distinct locus from one particle's trajectory."
        elif "separat" in q_low or "inflection" in q_low:
            trap += "At the wall, Eq. (9.42) gives ∂²u/∂y²|w = (1/μ)(dp/dx) > 0 under adverse pressure gradient, forcing an interior inflection point before ∂u/∂y|w hits zero (separation, Eq. 9.41)."
        elif "slip" in q_low or "plug" in q_low:
            trap += "Yield-stress materials stay rigid where local shear |τ| ≤ τ_y (creating a flat plug velocity core), while Navier slip shifts the entire wall boundary condition upward by l_s|∂u/∂y|_w."
        num_summary = (" Verified run telemetry: " + " | ".join(facts) + ".") if facts else ""
        ans = lead + trap + num_summary

    return DoubtCoachReply(
        answer=ans,
        grounded_facts=facts,
        textbook_citation=cite,
        provider_used="offline_grounded_coach",
    )

