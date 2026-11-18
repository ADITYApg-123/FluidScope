"""Tests for conservation traps against Som-Biswas-Chakraborty Ch. 2.9, 11.5, 12.4."""

import pytest
from fluidscope.core.conservation import (
    solve_hydraulic_jump,
    solve_sudden_expansion,
    solve_accelerating_tank,
)


def test_textbook_example_12_11_hydraulic_jump():
    """Som-Biswas-Chakraborty Ex 12.11 (p. 604-605): B=6.1m, Q=11.32 m^3/s, V1=6.1 m/s."""
    res = solve_hydraulic_jump(width=6.1, v1=6.1, discharge=11.32, h1=None)
    assert res["can_jump"] is True
    assert res["h1"] == pytest.approx(0.3042, abs=2e-3)
    assert res["Fr1"] == pytest.approx(3.53, abs=0.02)
    assert res["h2_true"] == pytest.approx(1.374, abs=0.015)
    assert res["head_loss_hj"] == pytest.approx(0.73, abs=0.02)
    assert res["power_loss_W"] == pytest.approx(81_060.0, rel=0.03)
    # Naive no-loss Bernoulli depth must always exceed true conjugate depth h2
    assert res["h2_naive_bernoulli"] > res["h2_true"]


def test_textbook_example_12_12_hydraulic_jump():
    """Som-Biswas-Chakraborty Ex 12.12 (p. 605): B=3.5m, Q=5.5 m^3/s, V1=4.14 m/s."""
    res = solve_hydraulic_jump(width=3.5, v1=4.14, discharge=5.5, h1=None)
    assert res["Fr1"] == pytest.approx(2.15, abs=0.02)
    assert res["jump_height"] == pytest.approx(0.60, abs=0.015)
    assert res["head_loss_hj"] == pytest.approx(0.146, abs=0.008)
    assert res["power_loss_W"] == pytest.approx(7_660.0, rel=0.05)


def test_borda_carnot_sudden_expansion():
    res = solve_sudden_expansion(D1=0.10, D2=0.20, V1=4.0, rho=1000.0)
    assert res["V2"] == pytest.approx(1.0, rel=1e-9)
    assert res["dp_true"] == pytest.approx(3000.0, rel=1e-6)
    assert res["dp_naive"] == pytest.approx(7500.0, rel=1e-6)
    assert res["head_loss_hL"] == pytest.approx(9.0 / (2.0 * 9.81), rel=1e-6)


def test_ch_2_9_accelerating_tank_and_free_fall_trap():
    # Horizontal tilt tan(theta) = -ax/g
    tilt = solve_accelerating_tank(ax=4.905, az=0.0)
    assert tilt["tilt_deg"] == pytest.approx(-26.565, abs=0.02)

    # Free fall az = -g -> hydrostatic pressure drops to 0, hole doesn't leak! (p. 99)
    ff = solve_accelerating_tank(ax=2.0, az=-9.81, h0=0.5)
    assert ff["g_effective"] == pytest.approx(0.0, abs=1e-9)
    assert ff["orifice_v_true"] == pytest.approx(0.0, abs=1e-9)
    assert ff["orifice_v_naive_static"] > 3.0
    assert max(ff["p_bottom_true_kPa"]) == pytest.approx(0.0, abs=1e-9)

