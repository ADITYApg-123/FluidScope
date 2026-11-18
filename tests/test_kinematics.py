"""Tests for Step 2: Equation-driven 2D kinematics engine against Som-Biswas-Chakraborty Ch. 3."""

import math
import pytest
from fluidscope.core.kinematics import analyze_kinematics, safe_parse_velocity


def test_safe_parser_blocks_unsafe_tokens_and_unknown_symbols():
    with pytest.raises(ValueError):
        safe_parse_velocity("__import__('os').system('echo 1')")
    with pytest.raises(ValueError):
        safe_parse_velocity("x + unknown_var")


def test_textbook_example_3_10_diverging_streamline_pathline_streakline():
    """Som, Biswas & Chakraborty Ex 3.10 (p. 135-137): u = x/(t+t0), v = v0 at t0=1, t=2*t0=2."""
    t0 = 1.0
    t_eval = 2.0
    v0 = 1.0
    x0, y0 = 1.0, 0.0
    res = analyze_kinematics(
        u_str="x / (t + t0)",
        v_str="v0",
        params={"t0": t0, "v0": v0},
        x0=x0,
        y0=y0,
        t0=t0,
        t_eval=t_eval,
        bounds=(-1.0, 8.0, -1.0, 4.0),
    )

    assert res["classification"]["steady"] is False
    assert res["classification"]["curves_coincide"] is False

    # Check Pathline Eq. (3.23): at t = 2*t0 = 2, y = y0 + v0*(t - t0) = 1.0, x/x0 = 1 + (y-y0)/(2*v0*t0) = 1.5
    # Wait: Eq (3.21): dx/x = dt/(t+t0) -> x/x0 = (t+t0)/(2*t0) = 3/2 = 1.5!
    path_end = res["curves"]["pathline"][-1]
    assert path_end[1] == pytest.approx(y0 + v0 * (t_eval - t0), abs=1e-4)
    assert path_end[0] == pytest.approx(x0 * (1.0 + (path_end[1] - y0) / (2.0 * v0 * t0)), abs=1e-4)

    # Check Streakline Eq. (3.20): for any point on streakline, x/x0 = 1 / (1 - (y - y0)/(3*v0*t0))
    # Tip at tau=t0 arrives at y = 1.0 -> x = 1 / (1 - 1/3) = 1.5; midpoint tau=1.5 arrives at y = 0.5 -> x = 1 / (1 - 0.5/3) = 1.2!
    streak = res["curves"]["streakline"]
    mid_pt = streak[len(streak) // 2]
    expected_x_mid = x0 / (1.0 - (mid_pt[1] - y0) / (3.0 * v0 * t0))
    assert mid_pt[0] == pytest.approx(expected_x_mid, abs=1e-3)

    # Check Streamline at t = 2: x = x0 * exp((y - y0)/(v0*(t + t0))) -> at y=1.0, x = exp(1/3) ≈ 1.3956 ≠ 1.5!
    stream = res["curves"]["streamline"]
    # Pick a forward point with y near 1.0 via linear interpolation along streamline
    forward_pts = [p for p in stream if p[1] >= 0.9]
    assert len(forward_pts) >= 2
    p_below = [p for p in stream if p[1] <= 1.0][-1]
    p_above = [p for p in stream if p[1] >= 1.0][0]
    if p_above[1] > p_below[1]:
        frac = (1.0 - p_below[1]) / (p_above[1] - p_below[1])
        x_at_y1 = p_below[0] + frac * (p_above[0] - p_below[0])
    else:
        x_at_y1 = p_below[0]
    assert x_at_y1 == pytest.approx(math.exp(1.0 / 3.0), abs=2e-3)


def test_steady_flow_streamline_pathline_streakline_coincide():
    res = analyze_kinematics(
        u_str="1",
        v_str="0.5 * x",
        x0=0.0,
        y0=0.0,
        t0=0.0,
        t_eval=2.0,
        bounds=(-2.0, 5.0, -2.0, 5.0),
    )
    assert res["classification"]["steady"] is True
    assert res["classification"]["incompressible"] is True
    assert res["classification"]["irrotational"] is False
    # At t=2 from (0,0), pathline reaches x=2, y=1 (exact y = 0.25*x^2 = 1.0)
    end_p = res["curves"]["pathline"][-1]
    assert end_p[0] == pytest.approx(2.0, abs=1e-4)
    assert end_p[1] == pytest.approx(1.0, abs=1e-4)
    # Streakline tip also reaches (2, 1)
    tip_s = res["curves"]["streakline"][0]
    assert tip_s[0] == pytest.approx(2.0, abs=1e-4)
    assert tip_s[1] == pytest.approx(1.0, abs=1e-4)


def test_forced_vortex_stokes_theorem_and_free_vortex_irrotational():
    # Forced vortex: u = -2*y, v = 2*x -> Ωz = 4
    forced = analyze_kinematics(
        u_str="-2*y",
        v_str="2*x",
        x0=1.0,
        y0=0.0,
        t0=0.0,
        t_eval=0.5,
        loop_center=(0.0, 0.0),
        loop_radius=1.0,
    )
    assert forced["classification"]["irrotational"] is False
    assert forced["point_probe"]["vorticity_z"] == pytest.approx(4.0, abs=1e-6)
    expected_gamma = 4.0 * math.pi * (1.0 ** 2)
    assert forced["stokes_check"]["circulation_line"] == pytest.approx(expected_gamma, rel=1e-3)
    assert forced["stokes_check"]["circulation_area_vorticity"] == pytest.approx(expected_gamma, rel=1e-3)

    # Free vortex: u = -y/(x^2 + y^2), v = x/(x^2 + y^2) -> Ωz = 0 for r > 0, Γ = 2π around origin!
    free_v = analyze_kinematics(
        u_str="-y / (x^2 + y^2)",
        v_str="x / (x^2 + y^2)",
        x0=1.5,
        y0=0.0,
        t0=0.0,
        t_eval=0.5,
        loop_center=(0.0, 0.0),
        loop_radius=1.2,
    )
    assert free_v["classification"]["irrotational"] is True
    assert free_v["stokes_check"]["circulation_line"] == pytest.approx(2.0 * math.pi, rel=1e-3)

