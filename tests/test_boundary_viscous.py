"""Tests for Step 5: Falkner-Skan separation, Couette-Poiseuille, Two-Layer Ex 8.2, Slip & Herschel-Bulkley."""

import math
import pytest
from fluidscope.core.boundary_viscous import (
    solve_falkner_skan,
    solve_boundary_layer_separation,
    solve_couette_poiseuille,
    solve_two_layer_poiseuille,
    solve_slip_and_herschel_bulkley,
)


def test_falkner_skan_blasius_and_separation_limit():
    blasius = solve_falkner_skan(beta=0.0)
    assert blasius["wall_shear_fpp0"] == pytest.approx(0.46960, abs=5e-4)
    assert blasius["wall_shear_blasius_equiv"] == pytest.approx(0.33206, abs=5e-4)
    assert blasius["cf_sqrt_rex"] == pytest.approx(0.66411, abs=5e-4)
    assert blasius["inflection_eta"] is None
    assert blasius["shape_factor_H"] == pytest.approx(2.59, abs=0.03)

    sep = solve_falkner_skan(beta=-0.1985)
    assert sep["wall_shear_fpp0"] < 0.03
    assert sep["near_separation"] is True
    assert sep["wall_curvature_d2u0"] > 0.19
    assert sep["inflection_eta"] is not None


def test_pohlhausen_separation_and_backflow():
    sep = solve_boundary_layer_separation(lambda_pg=-12.0)
    assert sep["wall_shear_dimless"] == pytest.approx(0.0, abs=1e-9)
    assert sep["separated"] is True
    assert sep["inflection_eta"] is not None

    back = solve_boundary_layer_separation(lambda_pg=-15.0)
    assert back["has_backflow"] is True
    assert back["cylinder_cp"]["cd_pressure_ideal"] == pytest.approx(0.0, abs=1e-3)
    assert back["cylinder_cp"]["cd_pressure_separated"] > 0.5


def test_textbook_example_8_4_couette_poiseuille_zero_flux():
    """Som-Biswas-Chakraborty Eq. (8.42) & Ex 8.4: P=-1 onset reversal, P=-3 zero flux."""
    rev = solve_couette_poiseuille(P=-1.0)
    assert rev["tau_lower_wall"] == pytest.approx(0.0, abs=1e-9)

    zero_q = solve_couette_poiseuille(P=-3.0, H=0.003, U=0.3, mu=4.7e-4)
    assert zero_q["q_per_width"] == pytest.approx(0.0, abs=1e-12)
    assert zero_q["zero_net_flux"] is True
    assert min(zero_q["u"]) < 0.0

    zero_top = solve_couette_poiseuille(P=1.0)
    assert zero_top["tau_upper_wall"] == pytest.approx(0.0, abs=1e-9)


def test_textbook_example_8_2_two_layer_shear_continuity():
    """Som-Biswas-Chakraborty Ex 8.2 (p. 404-407): continuous velocity & shear at y=0, kinked slope."""
    res = solve_two_layer_poiseuille(H=0.002, mu1=0.006, mu2=0.001, dp_dx=-1000.0)
    # Boundary no-slip
    assert res["u_true"][0] == pytest.approx(0.0, abs=1e-12)
    assert res["u_true"][-1] == pytest.approx(0.0, abs=1e-12)
    # Shear continuity μ1*du1/dy == μ2*du2/dy at y=0
    assert res["mu1"] * res["interface_slope_1"] == pytest.approx(res["mu2"] * res["interface_slope_2"], rel=1e-9)
    # Slope is NOT equal because mu1 != mu2 (proves student trap wrong!)
    assert res["interface_slope_1"] != pytest.approx(res["interface_slope_2"], rel=0.1)
    # Peak velocity shifts into less viscous upper layer (y > 0)
    assert res["y_peak"] > 0.0


def test_slip_and_herschel_bulkley_exact_limits():
    # Newtonian limit recovers 100% Poiseuille (n=1, tau_y=0, slip=0)
    newt = solve_slip_and_herschel_bulkley(H=0.001, dp_dx=-8000.0, K=0.01, n=1.0, tau_y=0.0, slip_length=0.0)
    assert newt["flux_ratio"] == pytest.approx(1.0, rel=1e-3)
    assert newt["u_max_true"] == pytest.approx(8000.0 * (0.001 ** 2) / (2.0 * 0.01), rel=1e-6)

    # Pure Navier wall-slip analytical ratio Q_slip/Q_noslip = 1 + 3*ls/H
    H, ls = 0.001, 0.0005
    slip_only = solve_slip_and_herschel_bulkley(H=H, dp_dx=-8000.0, K=0.01, n=1.0, tau_y=0.0, slip_length=ls)
    assert slip_only["flux_ratio"] == pytest.approx(1.0 + 3.0 * ls / H, rel=2e-3)

    # Bingham yield lock when tau_wall = G*H <= tau_y
    locked = solve_slip_and_herschel_bulkley(H=0.001, dp_dx=-1000.0, K=0.01, n=1.0, tau_y=1.5, slip_length=0.0)
    assert locked["flow_locked"] is True
    assert locked["q_true"] == 0.0

    # Active yield-stress Herschel-Bulkley exhibits flat plug core y_p = tau_y / G
    hb = solve_slip_and_herschel_bulkley(H=0.001, dp_dx=-10000.0, K=0.02, n=0.7, tau_y=4.0, slip_length=0.0)
    assert hb["plug_half_width"] == pytest.approx(4.0 / 10000.0, rel=1e-6)
    assert hb["u_max_true"] > 0.0
