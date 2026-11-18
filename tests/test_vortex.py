"""Tests for Step 3: Vortex flows and Ch. 7 potential superposition vs Som-Biswas-Chakraborty."""

import math
import pytest
from fluidscope.core.vortex import (
    solve_vortex_flow,
    solve_rotating_vessel,
    solve_potential_superposition,
)


def test_textbook_example_4_7_free_vortex_right_angle_bend():
    """Som, Biswas & Chakraborty Ex 4.7 (p. 206-208): r1=0.15m, r2=0.45m, v_cl=3 m/s."""
    # Centerline r=0.3 m -> C = 3 * 0.3 = 0.9 m^2/s
    res = solve_vortex_flow(
        mode="free",
        strength_c=0.9,
        r_min=0.10,
        r_max=0.50,
        r1=0.15,
        r2=0.45,
        rho=1000.0,
        p1=0.0,
    )
    pr = res["probes"]
    assert res["bernoulli_globally_valid"] is True
    assert pr["v1"] == pytest.approx(6.0, rel=1e-6)
    assert pr["v2"] == pytest.approx(2.0, rel=1e-6)
    assert pr["an_r1"] == pytest.approx(-240.0, rel=1e-5)
    assert pr["an_r2"] == pytest.approx(-8.8889, rel=1e-3)
    assert pr["dp_dx_wall_r1"] == pytest.approx(240_000.0, rel=1e-5)
    assert pr["dp_true"] == pytest.approx(16_000.0, rel=1e-5)
    # In free vortex, naive Bernoulli == exact radial Euler!
    assert pr["dp_discrepancy"] == pytest.approx(0.0, abs=1e-6)
    assert pr["head_gain_r1_to_r2"] == pytest.approx(0.0, abs=1e-6)


def test_forced_vortex_bernoulli_sign_trap_and_head_increase():
    """Verify forced vortex Eq. (4.57) & (4.60): naive Bernoulli gives opposite pressure sign."""
    omega = 10.0
    r1, r2 = 0.1, 0.4
    res = solve_vortex_flow(mode="forced", omega=omega, r1=r1, r2=r2, rho=1000.0, p1=0.0)
    pr = res["probes"]
    assert res["bernoulli_globally_valid"] is False
    expected_dp_true = 0.5 * 1000.0 * (omega ** 2) * (r2 ** 2 - r1 ** 2)
    expected_head_gain = (omega ** 2) * (r2 ** 2 - r1 ** 2) / 9.81
    assert pr["dp_true"] == pytest.approx(expected_dp_true, rel=1e-6)
    assert pr["dp_naive"] == pytest.approx(-expected_dp_true, rel=1e-6)  # Exact opposite sign!
    assert pr["head_gain_r1_to_r2"] == pytest.approx(expected_head_gain, rel=1e-6)


def test_rankine_vortex_double_depression_and_continuity():
    omega = 8.0
    rc = 0.25
    res = solve_vortex_flow(mode="rankine", omega=omega, core_radius=rc, r_min=0.0, r_max=1.5, r1=0.1, r2=0.5)
    expected_total_drop = (omega ** 2) * (rc ** 2) / 9.81
    assert res["probes"]["rankine_total_depression"] == pytest.approx(expected_total_drop, rel=1e-6)
    # Max speed occurs right at r = R_c
    max_vt = max(res["v_theta"])
    assert max_vt == pytest.approx(omega * rc, rel=2e-2)


def test_textbook_example_4_8_rotating_vessel():
    """Som, Biswas & Chakraborty Ex 4.8 (p. 208-209): D=0.6m (R=0.3m), 100 rpm -> H=0.503m, 130 rpm -> area=0.116m^2."""
    res_100 = solve_rotating_vessel(radius=0.30, vessel_height=0.503, initial_depth=0.503, rpm=100.0)
    assert res_100["paraboloid_height"] == pytest.approx(0.503, abs=2e-3)
    assert res_100["uncovered_area"] == pytest.approx(0.0, abs=2e-3)

    res_130 = solve_rotating_vessel(radius=0.30, vessel_height=0.503, initial_depth=0.503, rpm=130.0)
    assert res_130["regime"] == "SPILLOVER_BASE_UNCOVERED"
    assert res_130["uncovered_area"] == pytest.approx(0.116, abs=2e-3)


def test_potential_superposition_magnus_cylinder_lift():
    # Cylinder a = 1.0 in U_inf = 2.0 => kappa = 2*pi*U_inf*a^2 = 4*pi
    u_inf = 2.0
    a = 1.0
    kappa = 2.0 * math.pi * u_inf * (a ** 2)
    # Clockwise circulation gamma = -4*pi gives upward lift L' = +rho*U*4*pi
    res = solve_potential_superposition(
        u_inf=u_inf,
        doublets=[{"x": 0.0, "y": 0.0, "kappa": kappa}],
        vortices=[{"x": 0.0, "y": 0.0, "gamma": -4.0 * math.pi}],
        rho=1.225,
    )
    assert res["equivalent_cylinder_radius"] == pytest.approx(1.0, rel=1e-6)
    assert res["lift_per_unit_span"] == pytest.approx(1.225 * u_inf * 4.0 * math.pi, rel=1e-6)
    # Stagnation points sit on the cylinder at y < 0 (theta = -arcsin(0.5) = -30 deg)
    assert len(res["stagnation_points"]) == 2
    assert res["stagnation_points"][0][1] == pytest.approx(-0.5, abs=1e-4)

