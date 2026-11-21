"""Tests for Step 7A: Offline AI Problem Parser, Doubt Coach grounding, and 12 Twist Problems."""

import math
import re
import pytest
from fluidscope.ai.problem_parser import parse_problem
from fluidscope.ai.doubt_coach import (
    _clamp_neg_zero_text,
    _fmt_num,
    answer_doubt,
)
from fluidscope.ai.schemas import DoubtCoachReply, LLMConfig
from fluidscope.data.twist_bank import TWIST_PROBLEMS
from fluidscope.core.kinematics import analyze_kinematics
from fluidscope.core.vortex import (
    solve_potential_superposition,
    solve_rotating_vessel,
    solve_vortex_flow,
)
from fluidscope.core.boundary_viscous import (
    solve_boundary_layer_separation,
    solve_couette_poiseuille,
    solve_falkner_skan,
    solve_slip_and_herschel_bulkley,
    solve_two_layer_poiseuille,
)
from fluidscope.core.conservation import (
    solve_accelerating_tank,
    solve_hydraulic_jump,
    solve_sudden_expansion,
)
from fluidscope.core.lbm_tunnel import simulate_lbm_tunnel


def test_offline_parser_extracts_equations_and_textbook_problems():
    # Unsteady velocity equation prompt
    p1 = parse_problem("Compare streamline, pathline, and streakline for u = x/(t+t0), v = v0 at t0=1, t=2")
    assert p1.family == "kinematics_equation"
    assert p1.assumptions["steady"] is False
    assert "x" in p1.params["u_str"]

    # Hydraulic jump Ex 12.11 wording
    p2 = parse_problem("A 6.1 m wide rectangular apron carries 11.32 m^3/s at velocity 6.1 m/s and forms a hydraulic jump.")
    assert p2.family == "hydraulic_jump"
    assert p2.params["v1"] == pytest.approx(6.1)
    assert p2.params["discharge"] == pytest.approx(11.32)

    # Forced vortex
    p3 = parse_problem("Evaluate forced vortex flow with omega = 12 between inner radius 0.1 m and outer radius 0.4 m.")
    assert p3.family == "vortex_flow"
    assert p3.params["mode"] == "forced"
    assert p3.assumptions["irrotational"] is False

    # Rotating vessel Ex 4.8
    p4 = parse_problem("An open cylindrical tank of diameter 0.6 m and height 0.503 m rotates at 130 rpm until base uncovers.")
    assert p4.family == "rotating_vessel"
    assert p4.params["radius"] == pytest.approx(0.30)
    assert p4.params["rpm"] == pytest.approx(130.0)

    # Free fall tank
    p5 = parse_problem("Open tank with a bottom hole dropped in free fall; does liquid leak?")
    assert p5.family == "accelerating_tank"
    assert p5.params["az"] == pytest.approx(-9.81)

    # Custom 2D LBM geometry
    p6 = parse_problem("Simulate flow past a circular cylinder with a horizontal splitter plate behind it at Re = 110")
    assert p6.family == "lbm_tunnel"
    assert p6.params["preset"] == "cylinder_splitter"
    assert p6.params["reynolds"] == pytest.approx(110.0)


def test_offline_parser_rejects_unsupported_3d_honestly():
    p = parse_problem("Solve 3D supersonic oblique shock inside a centrifugal compressor impeller blade passage.")
    assert p.family == "unsupported_3d"
    assert p.unsupported_reason is not None


def test_doubt_coach_grounds_exact_solver_numbers():
    pq = parse_problem("Evaluate forced vortex omega = 10 between inner radius 0.1 and outer radius 0.4")
    v_sol = solve_vortex_flow(mode="forced", omega=10.0, r1=0.1, r2=0.4)
    reply = answer_doubt("Why didn't Bernoulli work here?", pq, v_sol, LLMConfig(provider="offline"))
    assert "kPa" in "\n".join(reply.grounded_facts)
    assert "Vortex" in reply.textbook_citation
    assert "Crocco" in reply.answer

    hj_pq = parse_problem("6.1 m wide apron 11.32 m^3/s at 6.1 m/s hydraulic jump")
    hj_sol = solve_hydraulic_jump(width=6.1, v1=6.1, discharge=11.32, h1=None)
    hj_reply = answer_doubt("Why is h2 smaller than constant energy?", hj_pq, hj_sol, LLMConfig(provider="offline"))
    assert any("0.73" in f or "3.53" in f for f in hj_reply.grounded_facts)


def test_twist_bank_has_12_unique_verified_entries():
    assert len(TWIST_PROBLEMS) == 12
    ids = {p["id"] for p in TWIST_PROBLEMS}
    assert len(ids) == 12
    for prob in TWIST_PROBLEMS:
        assert 0 <= prob["correct_index"] < len(prob["options"])
        assert prob["endpoint"].startswith("/api/")


def test_offline_parser_handles_symbolic_negatives_and_equation_variants():
    p_sym = parse_problem("u = 2*x, v = 3*y at t0 = -a")
    assert p_sym.family == "kinematics_equation"
    assert p_sym.params["t0"] == pytest.approx(1.0)

    p_fs = parse_problem("Solve Falkner-Skan with beta = -c")
    assert p_fs.family == "falkner_skan"

    p_nl = parse_problem("u = 2*x\nv = 3*y")
    assert p_nl.family == "kinematics_equation"
    assert p_nl.params["u_str"] == "2*x"
    assert p_nl.params["v_str"] == "3*y"

    p_comma = parse_problem("u = 2*x, v = 3*y, x0 = 1.0, y0 = 2.0")
    assert p_comma.family == "kinematics_equation"
    assert p_comma.params["x0"] == pytest.approx(1.0)
    assert p_comma.params["y0"] == pytest.approx(2.0)

    p_where = parse_problem("u = x/(t+t0), v = v0 where t0 = 1, t = 2")
    assert p_where.family == "kinematics_equation"
    assert p_where.params["v_str"] == "v0"

    p_dot = parse_problem("u = x/(t+t0), v = v0. t0 = 1, t = 2")
    assert p_dot.family == "kinematics_equation"
    assert p_dot.params["v_str"] == "v0"


def test_offline_parser_routes_twist_prompts_and_potential_superposition():
    by_id = {p["id"]: p for p in TWIST_PROBLEMS}
    assert parse_problem(by_id["TWIST-01"]["prompt"]).family == "kinematics_equation"
    p03 = parse_problem(by_id["TWIST-03"]["prompt"])
    assert p03.family == "vortex_flow"
    assert p03.params["mode"] == "forced"
    p06 = parse_problem(by_id["TWIST-06"]["prompt"])
    assert p06.family == "accelerating_tank"
    assert p06.params["az"] == pytest.approx(-9.81)
    assert parse_problem(by_id["TWIST-08"]["prompt"]).family == "couette_poiseuille"
    p11 = parse_problem(by_id["TWIST-11"]["prompt"])
    assert p11.family == "sudden_expansion"
    assert p11.params["D1"] == pytest.approx(0.10)
    assert p11.params["D2"] == pytest.approx(0.20)
    assert p11.params["V1"] == pytest.approx(4.0)

    p_3d = parse_problem("compressible 3D shock wave in turbomachinery impeller")
    assert p_3d.family == "unsupported_3d"

    p_pot = parse_problem(
        "Uniform stream plus doublet and clockwise circulation around cylinder, Magnus lift, angle of attack alpha = 10 deg"
    )
    assert p_pot.family == "potential_superposition"
    assert p_pot.params["u_inf"] == pytest.approx(2.0)
    assert p_pot.params["alpha_deg"] == pytest.approx(10.0)
    assert len(p_pot.params["vortices"]) == 1 and p_pot.params["vortices"][0]["gamma"] < 0


def test_doubt_coach_emits_katex_potential_facts_and_no_neg_zero():
    ex_pq = parse_problem(TWIST_PROBLEMS[0]["prompt"])
    ex_sol = analyze_kinematics("x / (t + t0)", "v0", params={"t0": 1.0, "v0": 1.0}, x0=1.0, y0=0.0, t0=1.0, t_eval=2.0)
    ex_reply = answer_doubt("Why did Bernoulli fail?", ex_pq, ex_sol, LLMConfig(provider="offline"))
    assert "$" in ex_reply.answer
    assert "$" in "\n".join(ex_reply.grounded_facts)
    assert "-0.000" not in ex_reply.answer
    assert all("-0.000" not in f for f in ex_reply.grounded_facts)

    pot_pq = parse_problem("Uniform stream with doublet and clockwise circulation around cylinder for Magnus lift")
    pot_sol = solve_potential_superposition(
        u_inf=2.0,
        doublets=[{"x": 0.0, "y": 0.0, "kappa": 12.566}],
        vortices=[{"x": 0.0, "y": 0.0, "gamma": -12.566}],
    )
    pot_reply = answer_doubt("Why does Magnus lift appear without viscosity?", pot_pq, pot_sol, LLMConfig(provider="offline"))
    assert len(pot_reply.grounded_facts) >= 2
    assert any("Kutta-Joukowski" in f for f in pot_reply.grounded_facts)
    assert "$" in pot_reply.answer
    assert "-0.000" not in pot_reply.answer


def test_parser_no_backtracking_digit_truncation_defect1():
    p_tank = parse_problem("Accelerating tank with ax = 0.0, az = -9.81m/s^2")
    assert p_tank.family == "accelerating_tank"
    assert p_tank.params["ax"] == pytest.approx(0.0)
    assert p_tank.params["az"] == pytest.approx(-9.81, abs=1e-6)

    p_pot = parse_problem("Potential flow around cylinder with alpha = 15deg")
    assert p_pot.family == "potential_superposition"
    assert p_pot.params["alpha_deg"] == pytest.approx(15.0)

    p_t25 = parse_problem("u = x/(t+t0), v = v0, t0 = 3.0, t = 25t0")
    assert p_t25.family == "kinematics_equation"
    assert p_t25.params["t0"] == pytest.approx(3.0)
    assert p_t25.params["t_eval"] == pytest.approx(6.0)

    p_tu = parse_problem("u = x/(t+t0), v = v0, t0 = 0.5s, t = 2.0s")
    assert p_tu.family == "kinematics_equation"
    assert p_tu.params["t0"] == pytest.approx(0.5)
    assert p_tu.params["t_eval"] == pytest.approx(2.0)

    p_fs = parse_problem("Solve Falkner-Skan with beta = -0.15c")
    assert p_fs.family == "falkner_skan"
    assert p_fs.params["beta"] == pytest.approx(-0.15)

    p_t0a = parse_problem("u = x/(t+t0), v = v0, t0 = 1.25a")
    assert p_t0a.family == "kinematics_equation"
    assert p_t0a.params["t0"] == pytest.approx(1.0)

    p_t0ea = parse_problem("u = x/(t+t0), v = v0, t0 = 1.25e-2a")
    assert p_t0ea.family == "kinematics_equation"
    assert p_t0ea.params["t0"] == pytest.approx(1.0)

    p_vortex_c = parse_problem("Free vortex between r1 = 0.1 m and r2 = 0.4 m with c = 0.9m^2/s")
    assert p_vortex_c.family == "vortex_flow"
    assert p_vortex_c.params["strength_c"] == pytest.approx(0.9)

    p_lbm_re = parse_problem("Flow past a circular cylinder at Re = 110c")
    assert p_lbm_re.family == "lbm_tunnel"
    assert p_lbm_re.params["reynolds"] == pytest.approx(105.0)

    p_couette_u = parse_problem("Couette flow between parallel plates with U = 0.5m/s and V = 0.0m/s")
    assert p_couette_u.family == "couette_poiseuille"


def test_parser_millimeter_units_and_cubic_unicode_defect2():
    by_id = {p["id"]: p for p in TWIST_PROBLEMS}

    p04 = parse_problem(by_id["TWIST-04"]["prompt"])
    assert p04.family == "rotating_vessel"
    assert p04.params["radius"] == pytest.approx(0.30)
    assert p04.params["rpm"] == pytest.approx(130.0)

    p10 = parse_problem(by_id["TWIST-10"]["prompt"])
    assert p10.family == "slip_herschel_bulkley"
    assert p10.params["tau_y"] == pytest.approx(2.5)
    assert p10.params["slip_length"] == pytest.approx(0.00025, rel=1e-6)
    assert p10.params["n"] == pytest.approx(0.65)

    p12 = parse_problem(by_id["TWIST-12"]["prompt"])
    assert p12.family == "hydraulic_jump"
    assert p12.params["width"] == pytest.approx(6.1)
    assert p12.params["v1"] == pytest.approx(6.1)
    assert p12.params["discharge"] == pytest.approx(11.32, rel=1e-4)

    p_exp = parse_problem("Sudden expansion from D1 = 100 mm to D2 = 200 mm at V1 = 4 m/s")
    assert p_exp.family == "sudden_expansion"
    assert p_exp.params["D1"] == pytest.approx(0.10)
    assert p_exp.params["D2"] == pytest.approx(0.20)

    p_exp_shared = parse_problem("Sudden expansion from 150 to 300 mm at V1 = 250 cm/s")
    assert p_exp_shared.family == "sudden_expansion"
    assert p_exp_shared.params["D1"] == pytest.approx(0.15)
    assert p_exp_shared.params["D2"] == pytest.approx(0.30)
    assert p_exp_shared.params["V1"] == pytest.approx(2.5)

    p_vessel_mm = parse_problem("Rotating cylindrical vessel radius of 300 mm height of 500 mm at 130 rpm")
    assert p_vessel_mm.family == "rotating_vessel"
    assert p_vessel_mm.params["radius"] == pytest.approx(0.30)
    assert p_vessel_mm.params["vessel_height"] == pytest.approx(0.50)

    p_rad_pot = parse_problem("Potential flow around cylinder with alpha = 0.25 rad and u_inf = 150 cm/s")
    assert p_rad_pot.family == "potential_superposition"
    assert p_rad_pot.params["alpha_deg"] == pytest.approx(math.degrees(0.25), rel=1e-4)
    assert p_rad_pot.params["u_inf"] == pytest.approx(1.5)

    p_um_kpa = parse_problem("Herschel-Bulkley slit with tau_y = 2.5 kPa and ls = 250 μm")
    assert p_um_kpa.family == "slip_herschel_bulkley"
    assert p_um_kpa.params["tau_y"] == pytest.approx(2500.0)
    assert p_um_kpa.params["slip_length"] == pytest.approx(2.5e-4, rel=1e-6)

    p_omega_rpm = parse_problem("Forced vortex omega = 120 rpm between r1 = 10 cm and r2 = 40 cm")
    assert p_omega_rpm.family == "vortex_flow"
    assert p_omega_rpm.params["omega"] == pytest.approx(120.0 * 2.0 * math.pi / 60.0, rel=1e-5)
    assert p_omega_rpm.params["r1"] == pytest.approx(0.10)
    assert p_omega_rpm.params["r2"] == pytest.approx(0.40)


def test_parser_no_cross_clause_parameter_stealing_defect3():
    p_cyl = parse_problem("Uniform stream around a cylinder of radius 0.5 m with doublet and clockwise circulation")
    assert p_cyl.family == "potential_superposition"
    assert p_cyl.params["u_inf"] == pytest.approx(2.0)
    assert p_cyl.params["doublets"][0]["kappa"] == pytest.approx(2.0 * math.pi * 2.0 * 0.25, rel=1e-3)

    p_rot_cyl = parse_problem("Rotating cylinder of radius 0.5 m at 300 rpm in uniform stream u_inf = 3 m/s producing Magnus lift")
    assert p_rot_cyl.family == "potential_superposition"
    assert p_rot_cyl.params["u_inf"] == pytest.approx(3.0)

    p_slip_tau = parse_problem("Hydrophobic slip flow of yield-stress paste with tau_y = 2.5 Pa")
    assert p_slip_tau.family == "slip_herschel_bulkley"
    assert p_slip_tau.params["tau_y"] == pytest.approx(2.5)
    assert p_slip_tau.params["slip_length"] == pytest.approx(0.00025)

    p_noslip = parse_problem("No-slip Herschel-Bulkley yield-stress paste with tau_y = 2.5 Pa")
    assert p_noslip.family == "slip_herschel_bulkley"
    assert p_noslip.params["tau_y"] == pytest.approx(2.5)
    assert p_noslip.params["slip_length"] == pytest.approx(0.0)

    p_n_ls = parse_problem("Yield-stress shear thinning fluid with n = 0.65 and ls = 0.25 mm")
    assert p_n_ls.family == "slip_herschel_bulkley"
    assert p_n_ls.params["tau_y"] == pytest.approx(0.0)
    assert p_n_ls.params["n"] == pytest.approx(0.65)
    assert p_n_ls.params["slip_length"] == pytest.approx(0.00025, rel=1e-6)

    p_vortex = parse_problem("Free vortex around inner wall bend with omega = 12 rad/s")
    assert p_vortex.family == "vortex_flow"
    assert p_vortex.params["omega"] == pytest.approx(12.0)
    assert p_vortex.params["r1"] == pytest.approx(0.15)
    assert p_vortex.params["r2"] == pytest.approx(0.45)

    p_cp_pa = parse_problem("Couette flow between moving plates with pressure p = 100 Pa")
    assert p_cp_pa.family == "couette_poiseuille"
    assert p_cp_pa.params["P"] == pytest.approx(-2.0)

    p_cp_c = parse_problem("Couette-Poiseuille flow with P = -2.5c")
    assert p_cp_c.family == "couette_poiseuille"
    assert p_cp_c.params["P"] == pytest.approx(-2.0)

    p_hj_conj = parse_problem("Hydraulic jump with conjugate depth = 1.4 m at velocity 6.1 m/s on 6.1 m wide apron")
    assert p_hj_conj.family == "hydraulic_jump"
    assert p_hj_conj.params["h1"] == pytest.approx(0.305)

    p_tl = parse_problem("Two-layer immiscible channel mu1 = 0.004, mu2 = 0.002, dp/dx = -800 Pa/m")
    assert p_tl.family == "two_layer_poiseuille"
    assert p_tl.params["mu1"] == pytest.approx(0.004)
    assert p_tl.params["mu2"] == pytest.approx(0.002)
    assert p_tl.params["dp_dx"] == pytest.approx(-800.0)

    p_bl = parse_problem("Boundary layer separation check with lambda = -15")
    assert p_bl.family == "bl_separation"
    assert p_bl.params["lambda_pg"] == pytest.approx(-15.0)


def test_doubt_coach_all_families_katex_markdown_and_neg_zero_edge_cases():
    assert _fmt_num(-0.5, 0) == "0"
    assert _fmt_num(-0.0004, 3) == "0.000"
    assert _fmt_num(-4e-16, 3, sci=True) == "0.000e+00"
    assert (
        _clamp_neg_zero_text("rpm=-0 >-0.000 x=-0.0 TWIST-01 1e-05 -0.5")
        == "rpm=0 >0.000 x=0.0 TWIST-01 1e-05 -0.5"
    )

    undef_pq = parse_problem("u = 1/x, v = 0, x0 = 0.0, y0 = 0.0, t0 = 0.0, t = 1.0")
    undef_sol = analyze_kinematics("1/x", "0", x0=0.0, y0=0.0, t0=0.0, t_eval=1.0)
    undef_reply = answer_doubt("Check divergence", undef_pq, undef_sol, LLMConfig(provider="offline"))
    undef_joined = "\n".join(undef_reply.grounded_facts)
    assert "divergence $\\nabla\\cdot\\mathbf{V} = 0.000" not in undef_joined
    if "divergence" in undef_joined:
        assert "undefined" in undef_joined

    by_id = {p["id"]: p for p in TWIST_PROBLEMS}
    family_cases = [
        (parse_problem(by_id["TWIST-01"]["prompt"]), analyze_kinematics("x / (t + t0)", "v0", params={"t0": 1.0, "v0": 1.0}, x0=1.0, y0=0.0, t0=1.0, t_eval=2.0)),
        (parse_problem(by_id["TWIST-03"]["prompt"]), solve_vortex_flow(mode="forced", omega=10.0, r1=0.1, r2=0.4)),
        (parse_problem(by_id["TWIST-04"]["prompt"]), solve_rotating_vessel(radius=0.30, vessel_height=0.503, rpm=130.0)),
        (parse_problem("Uniform stream with doublet and clockwise circulation around cylinder for Magnus lift"), solve_potential_superposition(u_inf=2.0, doublets=[{"x": 0.0, "y": 0.0, "kappa": 12.566}], vortices=[{"x": 0.0, "y": 0.0, "gamma": -12.566}])),
        (parse_problem("Solve Falkner-Skan with beta = -0.15"), solve_falkner_skan(beta=-0.15)),
        (parse_problem(by_id["TWIST-09"]["prompt"]), solve_boundary_layer_separation(lambda_pg=-12.0)),
        (parse_problem(by_id["TWIST-08"]["prompt"]), solve_couette_poiseuille(P=-3.0)),
        (parse_problem(by_id["TWIST-07"]["prompt"]), solve_two_layer_poiseuille(mu1=0.005, mu2=0.001, dp_dx=-1000.0)),
        (parse_problem(by_id["TWIST-10"]["prompt"]), solve_slip_and_herschel_bulkley(n=0.65, tau_y=2.5, slip_length=0.00025)),
        (parse_problem(by_id["TWIST-12"]["prompt"]), solve_hydraulic_jump(width=6.1, v1=6.1, discharge=11.32, h1=None)),
        (parse_problem(by_id["TWIST-11"]["prompt"]), solve_sudden_expansion(D1=0.10, D2=0.20, V1=4.0)),
        (parse_problem(by_id["TWIST-06"]["prompt"]), solve_accelerating_tank(ax=0.0, az=-9.81, h0=0.50)),
        (parse_problem("Simulate 2D flow past a circular cylinder at Re = 110"), simulate_lbm_tunnel(preset="cylinder", reynolds=110.0, n_steps=120)),
        (parse_problem("Solve 3D supersonic oblique shock inside a centrifugal compressor impeller blade passage."), None),
    ]
    seen_families = {pq.family for pq, _ in family_cases}
    assert len(seen_families) == 14

    for pq, sol in family_cases:
        for question in [
            "Why did Bernoulli fail?",
            "Check this shortcut trap",
            "Show exact governing formula",
        ]:
            reply = answer_doubt(question, pq, sol, LLMConfig(provider="offline"))
            DoubtCoachReply.model_validate(reply.model_dump())
            if pq.family == "unsupported_3d":
                assert len(reply.grounded_facts) == 0
            else:
                assert len(reply.grounded_facts) >= 1

            for text in [reply.answer, *reply.grounded_facts]:
                assert not re.search(r"(?<![\d.])-(?:0\.0+|0)(?![\d.])", text), f"Neg zero in {pq.family}: {text}"
                no_escaped = text.replace("\\$", "")
                stripped_math = re.sub(r"(?<!\\)\$(?!\s)([^$\n]+?)(?<!\s)\$", "", no_escaped)
                assert "$" not in stripped_math, f"Unpaired $ in {pq.family}: {text}"
                stripped_bold = re.sub(r"\*\*(.+?)\*\*", "", stripped_math)
                assert stripped_bold.count("*") % 2 == 0, f"Unpaired * in {pq.family}: {text}"

