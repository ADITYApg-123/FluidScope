"""Integral Conservation, Energy Loss & Non-Inertial Reference-Frame Solvers
(Som, Biswas & Chakraborty Ch. 2.9, Ch. 11.5, Ch. 12.4).
"""

from __future__ import annotations

from typing import Any
import math
import numpy as np
from scipy.optimize import brentq


def solve_hydraulic_jump(
    width: float = 6.1,
    v1: float = 6.1,
    h1: float | None = 0.305,
    discharge: float | None = None,
    rho: float = 1000.0,
    g: float = 9.81,
) -> dict[str, Any]:
    """Rectangular open-channel hydraulic jump (Eq. 12.42-12.48 & Examples 12.11-12.12)."""
    if width <= 0 or v1 <= 0:
        raise ValueError("Channel width and upstream velocity V1 must be positive.")

    if discharge is not None and discharge > 0:
        q = float(discharge) / float(width)
        h1_eff = q / float(v1)
    elif h1 is not None and h1 > 0:
        h1_eff = float(h1)
        q = h1_eff * float(v1)
    else:
        raise ValueError("Provide either positive h1 or positive discharge Q.")

    Q_total = q * width
    fr1 = v1 / math.sqrt(g * h1_eff)
    hc = (q ** 2 / g) ** (1.0 / 3.0)
    es1 = h1_eff + (v1 ** 2) / (2.0 * g)
    es_min = 1.5 * hc

    if fr1 <= 1.0:
        # Subcritical flow: jump cannot occur physically
        h2 = h1_eff
        v2 = v1
        fr2 = fr1
        es2 = es1
        hj = 0.0
        power_loss = 0.0
        h2_naive = h1_eff
        can_jump = False
    else:
        can_jump = True
        h2 = 0.5 * h1_eff * (math.sqrt(1.0 + 8.0 * (fr1 ** 2)) - 1.0)  # Eq. (12.46)
        v2 = q / h2
        fr2 = v2 / math.sqrt(g * h2)
        es2 = h2 + (v2 ** 2) / (2.0 * g)
        hj = ((h2 - h1_eff) ** 3) / (4.0 * h1_eff * h2)  # Eq. (12.48)
        power_loss = rho * g * Q_total * hj

        # Naive Frictionless Bernoulli trap: subcritical alternate depth where Es(h) == Es1
        def f_alt(h: float) -> float:
            return h + (q ** 2) / (2.0 * g * (h ** 2)) - es1

        h2_naive = float(brentq(f_alt, hc * 1.0001, max(es1 * 1.5, hc * 2.0)))

    # Specific Energy diagram Es(h)
    h_grid = np.linspace(max(0.25 * h1_eff, 0.05 * hc), max(1.45 * max(h2_naive, h2), 2.5 * hc), 90)
    es_grid = h_grid + (q ** 2) / (2.0 * g * (h_grid ** 2))

    # Scaled free-surface channel profile x in [0, 6]
    xs_chan = np.linspace(0.0, 6.0, 80)
    hs_true = h1_eff + 0.5 * (h2 - h1_eff) * (1.0 + np.tanh((xs_chan - 2.6) / 0.35))
    hs_naive = h1_eff + 0.5 * (h2_naive - h1_eff) * (1.0 + np.tanh((xs_chan - 2.6) / 0.35))

    return {
        "can_jump": can_jump,
        "width": float(width),
        "Q_total": float(Q_total),
        "q_unit": float(q),
        "h1": float(h1_eff),
        "v1": float(v1),
        "Fr1": float(fr1),
        "hc": float(hc),
        "h2_true": float(h2),
        "v2_true": float(v2),
        "Fr2": float(fr2),
        "jump_height": float(h2 - h1_eff),
        "Es1": float(es1),
        "Es2": float(es2),
        "Es_min": float(es_min),
        "head_loss_hj": float(hj),
        "power_loss_W": float(power_loss),
        "h2_naive_bernoulli": float(h2_naive),
        "depth_overprediction": float(h2_naive - h2),
        "es_diagram": {
            "h": [float(h) for h in h_grid],
            "Es": [float(e) for e in es_grid],
        },
        "channel_profile": {
            "x": [float(x) for x in xs_chan],
            "h_true": [float(h) for h in hs_true],
            "h_naive": [float(h) for h in hs_naive],
        },
    }


def solve_sudden_expansion(
    D1: float = 0.10,
    D2: float = 0.20,
    V1: float = 4.0,
    rho: float = 1000.0,
    g: float = 9.81,
    p1: float = 100_000.0,
) -> dict[str, Any]:
    """Borda-Carnot sudden pipe enlargement (Ch. 11.5, Eq. 11.18-11.23)."""
    if D1 <= 0 or D2 <= D1 or V1 < 0:
        raise ValueError("Require 0 < D1 < D2 and V1 >= 0.")

    A1 = 0.25 * math.pi * (D1 ** 2)
    A2 = 0.25 * math.pi * (D2 ** 2)
    V2 = V1 * (A1 / A2)

    # Eq. (11.21) momentum pressure recovery with p' = p1 on expansion annulus
    dp_true = rho * V2 * (V1 - V2)
    p2_true = p1 + dp_true
    # Eq. (11.23) irreversible eddy head loss
    hL_borda = ((V1 - V2) ** 2) / (2.0 * g)

    # Naive ideal Bernoulli pressure recovery
    dp_naive = 0.5 * rho * (V1 ** 2 - V2 ** 2)
    p2_naive = p1 + dp_naive

    xs = np.linspace(-1.0, 3.0, 81)
    blend = 0.5 * (1.0 + np.tanh(xs / 0.35))
    p_true_x = np.where(xs < 0.0, p1, p1 + dp_true * np.tanh(np.maximum(0.0, xs) / 0.65))
    p_naive_x = np.where(xs < 0.0, p1, p1 + dp_naive * np.tanh(np.maximum(0.0, xs) / 0.45))

    return {
        "D1": float(D1),
        "D2": float(D2),
        "area_ratio": float(A1 / A2),
        "V1": float(V1),
        "V2": float(V2),
        "p1": float(p1),
        "p2_true": float(p2_true),
        "p2_naive": float(p2_naive),
        "dp_true": float(dp_true),
        "dp_naive": float(dp_naive),
        "dp_overestimation": float(dp_naive - dp_true),
        "head_loss_hL": float(hL_borda),
        "power_loss_W": float(rho * g * (A1 * V1) * hL_borda),
        "x": [float(x) for x in xs],
        "p_true_x": [float(p) for p in p_true_x],
        "p_naive_x": [float(p) for p in p_naive_x],
    }


def solve_accelerating_tank(
    length: float = 1.2,
    h0: float = 0.50,
    tank_height: float = 0.80,
    ax: float = 3.0,
    az: float = 0.0,
    rho: float = 1000.0,
    g: float = 9.81,
    n_pts: int = 61,
) -> dict[str, Any]:
    """Uniform linear acceleration & free-fall trap (Ch. 2.9, Eq. 2.86-2.88, p. 97-99)."""
    if length <= 0 or tank_height <= 0:
        raise ValueError("Tank dimensions must be positive.")

    h_init = max(0.0, min(h0, tank_height))
    g_eff = g + az
    xs = np.linspace(-0.5 * length, 0.5 * length, n_pts)

    if g_eff <= 1e-6:
        # Free fall or stronger downward acceleration: fluid becomes weightless / p = patm at open top
        regime = "FREE_FALL_ZERO_HYDROSTATIC (ORIFICE NO-LEAK)"
        slope = 0.0
        tilt_deg = 0.0
        z_surf = np.full_like(xs, h_init)
        p_bottom = np.zeros_like(xs)
        orifice_v_true = 0.0
        spilled = False
    else:
        slope = -ax / g_eff  # Eq. (2.87): dz/dx = -ax / (g + az)
        tilt_deg = math.degrees(math.atan(slope))
        max_rise = 0.5 * length * abs(slope)
        # Check whether surface hits top rim or bottom corners
        if h_init + max_rise <= tank_height and h_init - max_rise >= 0.0:
            regime = "CONTAINED_TILTED_SURFACE"
            z_surf = h_init + slope * xs
            spilled = False
        elif h_init + max_rise > tank_height:
            regime = "SPILLOVER_AT_WALL"
            spilled = True
            # Highest side clamped at tank_height
            if slope >= 0:
                z_surf = np.maximum(0.0, np.minimum(tank_height, tank_height + slope * (xs - 0.5 * length)))
            else:
                z_surf = np.maximum(0.0, np.minimum(tank_height, tank_height + slope * (xs + 0.5 * length)))
        else:
            regime = "BASE_PARTIALLY_EXPOSED"
            spilled = False
            z_surf = np.maximum(0.0, h_init + slope * xs)

        p_bottom = rho * g_eff * z_surf
        z_center = float(z_surf[n_pts // 2])
        orifice_v_true = math.sqrt(max(0.0, 2.0 * g_eff * z_center))

    orifice_v_naive = math.sqrt(max(0.0, 2.0 * g * h_init))
    p_bottom_naive = np.full_like(xs, rho * g * h_init)

    return {
        "regime": regime,
        "length": float(length),
        "tank_height": float(tank_height),
        "h0": float(h_init),
        "ax": float(ax),
        "az": float(az),
        "g_effective": float(max(0.0, g_eff)),
        "tilt_deg": float(tilt_deg),
        "spilled": spilled,
        "orifice_v_true": float(orifice_v_true),
        "orifice_v_naive_static": float(orifice_v_naive),
        "x": [float(x) for x in xs],
        "z_surface": [float(z) for z in z_surf],
        "p_bottom_true_kPa": [float(p / 1000.0) for p in p_bottom],
        "p_bottom_naive_kPa": [float(p / 1000.0) for p in p_bottom_naive],
    }

