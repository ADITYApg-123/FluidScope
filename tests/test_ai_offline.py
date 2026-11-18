"""Tests for Step 7A: Offline AI Problem Parser, Doubt Coach grounding, and 12 Twist Problems."""

import pytest
from fluidscope.ai.problem_parser import parse_problem
from fluidscope.ai.doubt_coach import answer_doubt
from fluidscope.ai.schemas import LLMConfig
from fluidscope.data.twist_bank import TWIST_PROBLEMS
from fluidscope.core.kinematics import analyze_kinematics
from fluidscope.core.vortex import solve_potential_superposition, solve_vortex_flow
from fluidscope.core.conservation import solve_hydraulic_jump


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
    assert "Ch. 4.5" in reply.textbook_citation
    assert "4.43" in reply.answer

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

