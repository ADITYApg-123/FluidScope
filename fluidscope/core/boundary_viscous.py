"""Boundary-Layer Separation & Viscous Concept-Twist Solvers.

Implements:
- Falkner-Skan exact similarity BVP solver (Blasius β=0 through separation β_c ≈ -0.19884).
- Karman-Pohlhausen pressure-gradient boundary layer (continues past Λ = -12 into backflow).
- Circular cylinder potential Cp(θ) vs. separated wake Cp(θ) (D'Alembert trap).
- Generalized Couette-Poiseuille with adverse pressure gradient.
- Two-Layer Immiscible Plane Poiseuille (shear-continuity vs. slope-continuity trap).
- Herschel-Bulkley non-Newtonian + Navier wall-slip slit flow.
"""

from __future__ import annotations

from typing import Any
import math
import numpy as np
from scipy.integrate import solve_bvp


def solve_falkner_skan(beta: float = 0.0, eta_max: float = 8.0, n_pts: int = 121) -> dict[str, Any]:
    """Solve Falkner-Skan BVP f''' + f*f'' + beta*(1 - (f')^2) = 0 for beta >= -0.1988."""
    beta_clamped = max(-0.1988, min(2.0, float(beta)))

    def ode(_eta, y):
        # y = [f, f', f'']
        return np.vstack([
            y[1],
            y[2],
            -y[0] * y[2] - beta_clamped * (1.0 - y[1] ** 2),
        ])

    def bc(ya, yb):
        return np.array([ya[0], ya[1], yb[1] - 1.0])

    etas = np.linspace(0.0, eta_max, n_pts)
    # Use smooth initial guess that stays on the attached forward-flow branch
    f_guess = etas - (1.0 - np.exp(-etas))
    fp_guess = 1.0 - np.exp(-etas)
    fpp_guess = np.exp(-etas)
    y_init = np.vstack([f_guess, fp_guess, fpp_guess])

    # Continuation from beta=0 if adverse beta < -0.10 to ensure clean convergence
    if beta_clamped < -0.10:
        step_betas = np.linspace(0.0, beta_clamped, 8)
        cur_y = y_init
        cur_x = etas
        for b_step in step_betas:
            def ode_s(_eta, y, b=float(b_step)):
                return np.vstack([y[1], y[2], -y[0] * y[2] - b * (1.0 - y[1] ** 2)])
            sol = solve_bvp(ode_s, bc, cur_x, cur_y, tol=1e-6, max_nodes=2500)
            cur_x, cur_y = sol.x, sol.y
        u_norm = sol.sol(etas)[1]
        shear_norm = sol.sol(etas)[2]
    else:
        sol = solve_bvp(ode, bc, etas, y_init, tol=1e-6, max_nodes=2500)
        u_norm = sol.sol(etas)[1]
        shear_norm = sol.sol(etas)[2]

    curv_norm = -np.array(sol.sol(etas)[0]) * shear_norm - beta_clamped * (1.0 - u_norm ** 2)
    fpp0 = float(shear_norm[0])
    curv0 = float(curv_norm[0])  # Equals -beta from BVP at y=0 since f(0)=f'(0)=0!

    # Detect genuine interior inflection point where d^2u/dy^2 crosses 0 (+ -> -) away from wall noise
    inflection_eta = None
    if curv0 > 1e-3:
        for i in range(2, len(etas)):
            if curv_norm[i - 1] > 0.0 >= curv_norm[i]:
                frac = curv_norm[i - 1] / (curv_norm[i - 1] - curv_norm[i] + 1e-12)
                inflection_eta = float(etas[i - 1] + frac * (etas[i] - etas[i - 1]))
                break

    # Displacement & momentum thickness in η coordinates
    d1 = float(np.trapezoid(1.0 - u_norm, etas))
    d2 = float(np.trapezoid(u_norm * (1.0 - u_norm), etas))
    shape_h = float(d1 / max(d2, 1e-12))

    # Hartree m = beta/(2 - beta); C_f * sqrt(Re_x) = (2 / sqrt(2 - beta)) * f''_FS(0) -> 0.6641 at beta=0
    m_hartree = beta_clamped / max(2.0 - beta_clamped, 1e-6)
    cf_sqrt_rex = (2.0 / math.sqrt(max(2.0 - beta_clamped, 1e-6))) * fpp0
    fpp0_blasius_equiv = cf_sqrt_rex / 2.0

    return {
        "beta": float(beta_clamped),
        "hartree_m": float(m_hartree),
        "eta": [float(e) for e in etas],
        "u_over_U": [float(u) for u in u_norm],
        "du_deta": [float(s) for s in shear_norm],
        "d2u_deta2": [float(c) for c in curv_norm],
        "wall_shear_fpp0": fpp0,
        "wall_shear_blasius_equiv": float(fpp0_blasius_equiv),
        "cf_sqrt_rex": float(cf_sqrt_rex),
        "wall_curvature_d2u0": curv0,
        "inflection_eta": inflection_eta,
        "delta_star_eta": d1,
        "theta_eta": d2,
        "shape_factor_H": shape_h,
        "adverse_gradient": beta_clamped < 0.0,
        "near_separation": fpp0 < 0.05,
    }


def solve_boundary_layer_separation(
    lambda_pg: float = -6.0,
    n_pts: int = 101,
) -> dict[str, Any]:
    """Karman-Pohlhausen quartic boundary layer + Cylinder wake Cp(θ) trap (Ch. 9.6, 9.8).

    lambda_pg = (delta^2 / nu) * (dU/dx) = -(delta^2 / (mu*U)) * (dp/dx)
      lambda_pg > 0: favorable dp/dx < 0
      lambda_pg = 0: flat plate zero pressure gradient
      lambda_pg = -12: separation point (tau_w = 0, Eq. 9.41)
      lambda_pg < -12: post-separation reversed backflow near wall
    """
    lam = max(-18.0, min(12.0, float(lambda_pg)))
    eta = np.linspace(0.0, 1.0, n_pts)
    # Pohlhausen quartic polynomial
    f_poly = 2.0 * eta - 2.0 * eta ** 3 + eta ** 4
    g_poly = eta * ((1.0 - eta) ** 3)  # = eta - 3*eta^2 + 3*eta^3 - eta^4

    u = f_poly + (lam / 6.0) * g_poly
    du = (2.0 - 6.0 * eta ** 2 + 4.0 * eta ** 3) + (lam / 6.0) * (1.0 - 6.0 * eta + 9.0 * eta ** 2 - 4.0 * eta ** 3)
    d2u = (-12.0 * eta + 12.0 * eta ** 2) + (lam / 6.0) * (-6.0 + 18.0 * eta - 12.0 * eta ** 2)

    # Zero-pressure-gradient Pohlhausen baseline for visual comparison
    u_zpg = f_poly

    inflection_eta = None
    for i in range(1, len(eta)):
        if d2u[i - 1] > 0.0 >= d2u[i]:
            frac = d2u[i - 1] / (d2u[i - 1] - d2u[i] + 1e-12)
            inflection_eta = float(eta[i - 1] + frac * (eta[i] - eta[i - 1]))
            break

    wall_shear = float(du[0])  # = 2 + lam/6
    wall_curv = float(d2u[0])  # = -lam = (delta^2/(mu*U)) * dp/dx  (Eq. 9.42)
    separated = wall_shear <= 1e-9

    # Cylinder pressure distribution Fig. 9.5 (theta from 0 to 180 deg)
    thetas = np.linspace(0.0, 180.0, 91)
    rad = np.radians(thetas)
    cp_ideal = 1.0 - 4.0 * (np.sin(rad) ** 2)
    # Laminar separation observed near 81 deg (p. 465), wake stays near Cp_wake ≈ -1.1
    sep_deg = 81.0
    cp_actual = np.where(
        thetas <= sep_deg,
        1.0 - 3.6 * (np.sin(np.radians(thetas * (90.0 / sep_deg))) ** 2) + 0.15 * np.sin(rad),
        -1.08 + 0.04 * np.cos(np.radians(thetas - sep_deg)),
    )
    # Adjust smoothly at sep_deg
    sep_idx = int(np.searchsorted(thetas, sep_deg))
    if 0 < sep_idx < len(thetas):
        cp_actual[sep_idx:] = float(cp_actual[sep_idx - 1])

    # Pressure drag Cd_p = ∫_0^π Cp cos(θ) dθ
    cd_ideal = float(np.trapezoid(cp_ideal * np.cos(rad), rad))
    cd_actual = float(np.trapezoid(cp_actual * np.cos(rad), rad))

    return {
        "lambda_pg": lam,
        "eta": [float(x) for x in eta],
        "u": [float(x) for x in u],
        "u_zero_pg": [float(x) for x in u_zpg],
        "du_deta": [float(x) for x in du],
        "d2u_deta2": [float(x) for x in d2u],
        "wall_shear_dimless": wall_shear,
        "wall_curvature_dimless": wall_curv,
        "inflection_eta": inflection_eta,
        "has_backflow": bool(np.min(u) < -1e-6),
        "separated": separated,
        "cylinder_cp": {
            "theta_deg": [float(t) for t in thetas],
            "cp_potential": [float(c) for c in cp_ideal],
            "cp_separated": [float(c) for c in cp_actual],
            "cd_pressure_ideal": cd_ideal,
            "cd_pressure_separated": cd_actual,
            "sep_angle_deg": sep_deg,
        },
    }


def solve_couette_poiseuille(
    P: float = 0.0,
    H: float = 0.003,
    U: float = 0.30,
    mu: float = 4.7e-4,
    n_pts: int = 101,
) -> dict[str, Any]:
    """Generalized Couette-Poiseuille flow Eq. (8.41-8.42) & Example 8.4."""
    if H <= 0 or mu <= 0:
        raise ValueError("Channel height H and viscosity mu must be positive.")
    y_norm = np.linspace(0.0, 1.0, n_pts)
    y_phys = y_norm * H
    u_norm = y_norm + P * y_norm * (1.0 - y_norm)
    u_phys = u_norm * U
    # Naive pure Couette reference (ignores pressure gradient P=0)
    u_couette = y_norm * U

    dp_dx = -2.0 * mu * U * P / (H ** 2)
    tau_lower = (mu * U / H) * (1.0 + P)
    tau_upper = (mu * U / H) * (1.0 - P)
    q_per_width = U * H * (0.5 + P / 6.0)
    u_avg = U * (0.5 + P / 6.0)

    if P < -1.0:
        regime = "BACKFLOW_AT_STATIONARY_WALL"
    elif abs(P + 1.0) < 1e-6:
        regime = "INCIPIENT_REVERSAL (τw_0 = 0)"
    elif abs(P - 1.0) < 1e-6:
        regime = "ZERO_TOP_PLATE_SHEAR (τw_H = 0)"
    elif P > 1.0:
        regime = "PRESSURE_DOMINATED_MAX_BELOW_WALL"
    else:
        regime = "MONOTONIC_FORWARD"

    return {
        "P": float(P),
        "H": float(H),
        "U": float(U),
        "mu": float(mu),
        "dp_dx": float(dp_dx),
        "y": [float(v) for v in y_phys],
        "y_over_H": [float(v) for v in y_norm],
        "u": [float(v) for v in u_phys],
        "u_over_U": [float(v) for v in u_norm],
        "u_pure_couette": [float(v) for v in u_couette],
        "tau_lower_wall": float(tau_lower),
        "tau_upper_wall": float(tau_upper),
        "q_per_width": float(q_per_width),
        "u_avg": float(u_avg),
        "zero_net_flux": bool(abs(P + 3.0) < 1e-3),
        "regime": regime,
    }


def solve_two_layer_poiseuille(
    H: float = 0.002,
    mu1: float = 0.004,
    mu2: float = 0.001,
    dp_dx: float = -1000.0,
    n_half: int = 51,
) -> dict[str, Any]:
    """Two immiscible layers in y in [-H, H] (Example 8.2, p. 404-407)."""
    if H <= 0 or mu1 <= 0 or mu2 <= 0:
        raise ValueError("Require positive H, mu1, mu2.")

    # Solve BCs:
    # u1(y) = A1 y^2 + C1 y + C2,  A1 = dp_dx/(2*mu1)
    # u2(y) = A2 y^2 + C3 y + C4,  A2 = dp_dx/(2*mu2)
    # At y=-H: u1=0 -> C2 = -A1 H^2 + C1 H
    # At y=+H: u2=0 -> C4 = -A2 H^2 - C3 H
    # Continuity u1(0)=u2(0) -> C2 = C4
    # Continuity tau: mu1 C1 = mu2 C3 -> C3 = (mu1/mu2) C1
    a1 = dp_dx / (2.0 * mu1)
    a2 = dp_dx / (2.0 * mu2)
    # => -A1 H^2 + C1 H = -A2 H^2 - (mu1/mu2)*C1*H
    # => C1 * H * (1 + mu1/mu2) = (A1 - A2)*H^2
    c1 = (a1 - a2) * H / (1.0 + mu1 / mu2)
    c3 = (mu1 / mu2) * c1
    c2 = -a1 * (H ** 2) + c1 * H
    c4 = c2

    y1 = np.linspace(-H, 0.0, n_half)
    y2 = np.linspace(0.0, H, n_half)
    u1 = a1 * y1 ** 2 + c1 * y1 + c2
    u2 = a2 * y2 ** 2 + c3 * y2 + c4
    du1 = 2.0 * a1 * y1 + c1
    du2 = 2.0 * a2 * y2 + c3
    tau1 = mu1 * du1
    tau2 = mu2 * du2

    # Student Trap ("Naive Equal-Slope / Averaged Single-Viscosity Trap"):
    # Mistake A: setting du1/dy = du2/dy at y=0 (ignoring viscosity jump in tau = mu du/dy)
    c1_trap = 0.5 * (a1 - a2) * H
    c2_trap = -a1 * (H ** 2) + c1_trap * H
    u1_trap = a1 * y1 ** 2 + c1_trap * y1 + c2_trap
    u2_trap = a2 * y2 ** 2 + c1_trap * y2 + (-a2 * (H ** 2) - c1_trap * H)

    ys = np.concatenate([y1, y2[1:]])
    us = np.concatenate([u1, u2[1:]])
    us_trap = np.concatenate([u1_trap, u2_trap[1:]])
    taus = np.concatenate([tau1, tau2[1:]])
    slopes = np.concatenate([du1, du2[1:]])

    max_idx = int(np.argmax(us))
    q1 = float(np.trapezoid(u1, y1))
    q2 = float(np.trapezoid(u2, y2))

    return {
        "H": float(H),
        "mu1": float(mu1),
        "mu2": float(mu2),
        "dp_dx": float(dp_dx),
        "y": [float(v) for v in ys],
        "y_over_H": [float(v / H) for v in ys],
        "u_true": [float(v) for v in us],
        "u_naive_slope_trap": [float(v) for v in us_trap],
        "tau": [float(v) for v in taus],
        "du_dy": [float(v) for v in slopes],
        "interface_velocity": float(c2),
        "interface_shear": float(mu1 * c1),
        "interface_slope_1": float(c1),
        "interface_slope_2": float(c3),
        "y_peak": float(ys[max_idx]),
        "u_peak": float(us[max_idx]),
        "q_layer1": q1,
        "q_layer2": q2,
        "q_total": q1 + q2,
    }


def solve_slip_and_herschel_bulkley(
    H: float = 0.001,
    dp_dx: float = -12000.0,
    K: float = 0.015,
    n: float = 0.65,
    tau_y: float = 2.0,
    slip_length: float = 0.0002,
    n_pts: int = 121,
) -> dict[str, Any]:
    """Plane slit flow with Navier wall slip + Herschel-Bulkley yield-stress rheology."""
    if H <= 0 or K <= 0 or n <= 0 or tau_y < 0 or slip_length < 0:
        raise ValueError("Invalid physical bounds for channel/rheology parameters.")

    G = abs(dp_dx)
    sign = 1.0 if dp_dx <= 0 else -1.0
    tau_wall = G * H
    y = np.linspace(-H, H, n_pts)
    abs_y = np.abs(y)

    # Naive standard Newtonian No-Slip Poiseuille reference (using mu_ref = K, tau_y = 0, ls = 0)
    u_newton_noslip = sign * (G / (2.0 * K)) * (H ** 2 - y ** 2)
    q_newton_noslip = float(np.trapezoid(u_newton_noslip, y))

    if tau_wall <= tau_y or G < 1e-12:
        # Completely unyielded: flow locked because |tau_w| <= tau_y!
        y_plug = H
        u_true = np.zeros_like(y)
        u_slip_wall = 0.0
        q_true = 0.0
    else:
        y_plug = min(H, tau_y / G)
        gamma_wall = ((tau_wall - tau_y) / K) ** (1.0 / n)
        u_slip_wall = slip_length * gamma_wall
        coeff = (n / (n + 1.0)) * (1.0 / (G * (K ** (1.0 / n))))
        term_wall = (tau_wall - tau_y) ** ((n + 1.0) / n)
        core_vel = u_slip_wall + coeff * term_wall

        u_mag = np.where(
            abs_y <= y_plug,
            core_vel,
            u_slip_wall + coeff * (term_wall - np.maximum(0.0, G * abs_y - tau_y) ** ((n + 1.0) / n)),
        )
        u_true = sign * u_mag
        q_true = float(np.trapezoid(u_true, y))

    tau_profile = -dp_dx * y  # Exact from d(tau)/dy = dp/dx in symmetric slit
    flux_ratio = (q_true / q_newton_noslip) if abs(q_newton_noslip) > 1e-12 else 0.0

    return {
        "H": float(H),
        "dp_dx": float(dp_dx),
        "K": float(K),
        "n": float(n),
        "tau_y": float(tau_y),
        "slip_length": float(slip_length),
        "tau_wall": float(tau_wall),
        "plug_half_width": float(y_plug),
        "plug_fraction": float(y_plug / H),
        "u_slip_wall": float(sign * u_slip_wall),
        "u_max_true": float(u_true[n_pts // 2]),
        "u_max_newton_noslip": float(u_newton_noslip[n_pts // 2]),
        "q_true": q_true,
        "q_newton_noslip": q_newton_noslip,
        "flux_ratio": float(flux_ratio),
        "flow_locked": bool(tau_wall <= tau_y),
        "y": [float(v) for v in y],
        "y_over_H": [float(v / H) for v in y],
        "u_true": [float(v) for v in u_true],
        "u_newton_noslip": [float(v) for v in u_newton_noslip],
        "tau": [float(v) for v in tau_profile],
    }
