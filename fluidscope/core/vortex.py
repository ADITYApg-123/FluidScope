"""Vortex Flows & Potential Flow Superposition.

Implements:
- Free (irrotational), Forced (solid-body rotational), Rankine combined, and Spiral free vortices.
- Radial pressure p(r), Bernoulli head H(r), vorticity Ωz(r), normal acceleration a_n(r).
- Naive constant-head Bernoulli vs. exact radial Euler comparison proving sign/head traps.
- Open cylindrical rotating vessel spill/base-uncovering paraboloid hydrostatics.
- 2D Potential Flow superposition: Uniform stream + Sources/Sinks + Doublet + Point Vortices (Magnus lift).
"""

from __future__ import annotations

from typing import Any
import math
import numpy as np


def solve_vortex_flow(
    mode: str = "forced",
    strength_c: float = 0.9,
    omega: float = 10.0,
    core_radius: float = 0.3,
    radial_c2: float = -0.35,
    rho: float = 1000.0,
    g: float = 9.81,
    r_min: float = 0.05,
    r_max: float = 0.60,
    r1: float = 0.15,
    r2: float = 0.45,
    p1: float = 0.0,
    n_pts: int = 120,
) -> dict[str, Any]:
    """Evaluate radial profiles and Naive-Bernoulli vs. True-Euler discrepancy."""
    mode = mode.lower().strip()
    if mode not in {"free", "forced", "rankine", "spiral"}:
        raise ValueError(f"Unsupported vortex mode '{mode}'.")
    if r_max <= r_min or r_min < 0:
        raise ValueError("Require 0 <= r_min < r_max.")

    r_safe_min = max(r_min, 1e-3 if mode in {"free", "spiral"} else 0.0)
    rs = np.linspace(r_safe_min, r_max, n_pts)
    rs_nonzero = np.maximum(rs, 1e-6)

    def _eval_v_vort(r_arr: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        r_s = np.maximum(r_arr, 1e-6)
        if mode == "free":
            vt = strength_c / r_s
            vr = np.zeros_like(r_arr)
            om = np.zeros_like(r_arr)
        elif mode == "spiral":
            vt = strength_c / r_s
            vr = radial_c2 / r_s
            om = np.zeros_like(r_arr)
        elif mode == "forced":
            vt = omega * r_arr
            vr = np.zeros_like(r_arr)
            om = np.full_like(r_arr, 2.0 * omega)
        else:  # rankine combined: continuous at R_c with v_max = omega * R_c
            rc = max(core_radius, 1e-4)
            c_eff = omega * (rc ** 2)
            inside = r_arr <= rc
            vt = np.where(inside, omega * r_arr, c_eff / r_s)
            vr = np.zeros_like(r_arr)
            om = np.where(inside, 2.0 * omega, 0.0)
        return vt, vr, om

    def _p_true_relative_zero(r_arr: np.ndarray) -> np.ndarray:
        """Integral ∫ ρ v_θ^2 / r dr relative to reference datum."""
        r_s = np.maximum(r_arr, 1e-6)
        if mode == "free":
            return -0.5 * rho * (strength_c ** 2) / (r_s ** 2)
        if mode == "spiral":
            # Total speed V^2 = (c1^2 + c2^2)/r^2 and irrotational -> Bernoulli exact
            return -0.5 * rho * (strength_c ** 2 + radial_c2 ** 2) / (r_s ** 2)
        if mode == "forced":
            return 0.5 * rho * (omega ** 2) * (r_arr ** 2)
        # Rankine continuous pressure relative to far-field p_inf = 0:
        rc = max(core_radius, 1e-4)
        c_eff = omega * (rc ** 2)
        p_out = -0.5 * rho * (c_eff ** 2) / (r_s ** 2)
        p_in = -rho * (omega ** 2) * (rc ** 2) * (1.0 - 0.5 * (r_arr / rc) ** 2)
        return np.where(r_arr <= rc, p_in, p_out)

    vt, vr, om = _eval_v_vort(rs)
    speed = np.hypot(vt, vr)
    a_n = -(vt ** 2) / rs_nonzero  # inward normal acceleration Eq. (4.47)

    # Probe exact quantities at r1 and r2
    vt_probes, vr_probes, om_probes = _eval_v_vort(np.array([r1, r2], dtype=np.float64))
    v1_mag = float(math.hypot(vt_probes[0], vr_probes[0]))
    v2_mag = float(math.hypot(vt_probes[1], vr_probes[1]))
    p_rel = _p_true_relative_zero(rs)
    p1_rel = float(_p_true_relative_zero(np.array([r1]))[0])
    p2_rel = float(_p_true_relative_zero(np.array([r2]))[0])

    # Shift p_true so p_true(r1) == p1
    p_true = p1 + (p_rel - p1_rel)
    p2_true = float(p1 + (p2_rel - p1_rel))

    # Naive constant-head Bernoulli anchored at r1: p + 0.5*rho*V^2 = const
    p_naive = p1 + 0.5 * rho * (v1_mag ** 2 - speed ** 2)
    p2_naive = float(p1 + 0.5 * rho * (v1_mag ** 2 - v2_mag ** 2))

    # Total Bernoulli head relative to r1: H(r) - H(r1) = (p_true - p1)/(rho*g) + (V^2 - V1^2)/(2g)
    h_head = (p_true - p1) / (rho * g) + (speed ** 2 - v1_mag ** 2) / (2.0 * g)
    h2_diff = float((p2_true - p1) / (rho * g) + (v2_mag ** 2 - v1_mag ** 2) / (2.0 * g))

    # Free surface z - z(r1) under hydrostatic balance (in pressure head units p_true/(rho*g))
    z_surf = (p_true - p1) / (rho * g)

    # 2D velocity vectors on [-r_max, r_max] grid for top-down live canvas particles
    g_n = 21
    gx = np.linspace(-r_max, r_max, g_n)
    gy = np.linspace(-r_max, r_max, g_n)
    GX, GY = np.meshgrid(gx, gy)
    RR = np.hypot(GX, GY)
    vt_2d, vr_2d, _ = _eval_v_vort(RR)
    cos_t = np.where(RR > 1e-6, GX / np.maximum(RR, 1e-6), 0.0)
    sin_t = np.where(RR > 1e-6, GY / np.maximum(RR, 1e-6), 0.0)
    U_2d = vr_2d * cos_t - vt_2d * sin_t
    V_2d = vr_2d * sin_t + vt_2d * cos_t

    def _clean(a: np.ndarray, clamp: float = 50.0) -> list[list[float]]:
        out = []
        for row in a:
            out.append([float(max(-clamp, min(clamp, x))) if math.isfinite(float(x)) else 0.0 for x in row])
        return out

    # Compute logarithmic spiral streamline if in spiral mode
    spiral_curve: list[list[float]] = []
    if mode == "spiral":
        thetas = np.linspace(0.0, 4.0 * math.pi, 160)
        tan_alpha = radial_c2 / (strength_c if abs(strength_c) > 1e-6 else 1e-6)
        r_start = r2 if radial_c2 < 0 else r1
        r_sp = r_start * np.exp(thetas * tan_alpha)
        for th, rr in zip(thetas, r_sp):
            if r_min * 0.5 <= rr <= r_max * 1.15:
                spiral_curve.append([float(rr * math.cos(th)), float(rr * math.sin(th))])

    dp_true = p2_true - p1
    dp_naive = p2_naive - p1
    rankine_total_drop = float((omega ** 2) * (core_radius ** 2) / g) if mode == "rankine" else None

    return {
        "mode": mode,
        "bernoulli_globally_valid": mode in {"free", "spiral"},
        "r": [float(x) for x in rs],
        "v_theta": [float(x) for x in vt],
        "v_r": [float(x) for x in vr],
        "speed": [float(x) for x in speed],
        "vorticity_z": [float(x) for x in om],
        "a_normal": [float(x) for x in a_n],
        "p_true": [float(x) for x in p_true],
        "p_naive": [float(x) for x in p_naive],
        "head_diff": [float(x) for x in h_head],
        "free_surface_z": [float(x) for x in z_surf],
        "probes": {
            "r1": float(r1),
            "r2": float(r2),
            "v1": v1_mag,
            "v2": v2_mag,
            "vorticity_r1": float(om_probes[0]),
            "vorticity_r2": float(om_probes[1]),
            "an_r1": float(-(vt_probes[0] ** 2) / max(r1, 1e-6)),
            "an_r2": float(-(vt_probes[1] ** 2) / max(r2, 1e-6)),
            "dp_dx_wall_r1": float(rho * (vt_probes[0] ** 2) / max(r1, 1e-6)),
            "dp_dx_wall_r2": float(rho * (vt_probes[1] ** 2) / max(r2, 1e-6)),
            "dp_true": float(dp_true),
            "dp_naive": float(dp_naive),
            "dp_discrepancy": float(dp_true - dp_naive),
            "head_gain_r1_to_r2": h2_diff,
            "rankine_total_depression": rankine_total_drop,
        },
        "spiral_curve": spiral_curve,
        "field_2d": {
            "bounds": [-float(r_max), float(r_max), -float(r_max), float(r_max)],
            "xs": [float(x) for x in gx],
            "ys": [float(y) for y in gy],
            "U": _clean(U_2d),
            "V": _clean(V_2d),
        },
    }


def solve_rotating_vessel(
    radius: float = 0.30,
    vessel_height: float = 0.503,
    initial_depth: float = 0.503,
    rpm: float = 100.0,
    rho: float = 1000.0,
    g: float = 9.81,
    n_pts: int = 100,
) -> dict[str, Any]:
    """Rotating vertical open cylinder paraboloid hydrostatics."""
    if radius <= 0 or vessel_height <= 0:
        raise ValueError("Radius and vessel_height must be positive.")
    h_init = max(0.0, min(initial_depth, vessel_height))
    omega = 2.0 * math.pi * rpm / 60.0
    h_parab = (omega ** 2) * (radius ** 2) / (2.0 * g)

    # First check rim overflow & center touch limits without overflow:
    # No spill -> center z0 = h_init - 0.5*h_parab, wall zw = h_init + 0.5*h_parab
    z0_nospill = h_init - 0.5 * h_parab
    zw_nospill = h_init + 0.5 * h_parab

    rs = np.linspace(0.0, radius, n_pts)
    uncovered_radius = 0.0
    spilled_volume_ratio = 0.0

    if zw_nospill <= vessel_height and z0_nospill >= 0.0:
        regime = "CONTAINED_FULL_BASE"
        z_surface = z0_nospill + (omega ** 2) * (rs ** 2) / (2.0 * g)
    elif zw_nospill > vessel_height:
        # Liquid reaches rim zw = vessel_height and spills excess until zw = vessel_height
        # Volume remaining at rim-touching condition without base uncover: V_rem = pi*R^2*(H - 0.5*h_parab)
        z0_at_rim = vessel_height - h_parab
        if z0_at_rim >= 0.0:
            regime = "SPILLOVER_BASE_COVERED"
            z_surface = z0_at_rim + (omega ** 2) * (rs ** 2) / (2.0 * g)
            v_rem = math.pi * (radius ** 2) * (vessel_height - 0.5 * h_parab)
            v_orig = math.pi * (radius ** 2) * h_init
            spilled_volume_ratio = max(0.0, (v_orig - v_rem) / max(v_orig, 1e-12))
        else:
            # Base uncovered, rim fixed at vessel_height -> Eq in Ex 4.8(ii): R1^2 = R^2 - 2*g*H/omega^2
            regime = "SPILLOVER_BASE_UNCOVERED"
            r1_sq = max(0.0, radius ** 2 - (2.0 * g * vessel_height) / max(omega ** 2, 1e-12))
            uncovered_radius = math.sqrt(r1_sq)
            z_raw = (omega ** 2) * (rs ** 2 - r1_sq) / (2.0 * g)
            z_surface = np.maximum(0.0, z_raw)
            v_rem = 0.5 * math.pi * (radius ** 2 - r1_sq) * vessel_height
            v_orig = math.pi * (radius ** 2) * h_init
            spilled_volume_ratio = max(0.0, (v_orig - v_rem) / max(v_orig, 1e-12))
    else:
        # Base uncovered WITHOUT spilling over rim: equate paraboloid annulus volume to pi*R^2*h_init
        # Annulus volume V = 0.5 * pi * (R^2 - R1^2) * z_wall where z_wall = omega^2*(R^2 - R1^2)/(2g)
        # => (R^2 - R1^2)^2 = 4*g*h_init*R^2 / omega^2
        regime = "CONTAINED_BASE_UNCOVERED"
        span_sq = math.sqrt(4.0 * g * h_init * (radius ** 2) / max(omega ** 2, 1e-12))
        r1_sq = max(0.0, radius ** 2 - span_sq)
        uncovered_radius = math.sqrt(r1_sq)
        z_surface = np.maximum(0.0, (omega ** 2) * (rs ** 2 - r1_sq) / (2.0 * g))

    p_bottom = rho * g * z_surface
    uncovered_area = math.pi * (uncovered_radius ** 2)
    critical_uncover_rpm = (
        (60.0 / (2.0 * math.pi)) * math.sqrt(2.0 * g * vessel_height / (radius ** 2))
    )

    return {
        "regime": regime,
        "rpm": float(rpm),
        "omega": float(omega),
        "radius": float(radius),
        "vessel_height": float(vessel_height),
        "paraboloid_height": float(h_parab),
        "critical_full_uncover_rpm": float(critical_uncover_rpm),
        "uncovered_radius": float(uncovered_radius),
        "uncovered_area": float(uncovered_area),
        "spilled_fraction": float(spilled_volume_ratio),
        "r": [float(x) for x in rs],
        "z_surface": [float(z) for z in z_surface],
        "p_bottom_gauge": [float(p) for p in p_bottom],
    }


def solve_potential_superposition(
    u_inf: float = 2.0,
    alpha_deg: float = 0.0,
    sources: list[dict[str, float]] | None = None,
    doublets: list[dict[str, float]] | None = None,
    vortices: list[dict[str, float]] | None = None,
    rho: float = 1.225,
    bounds: tuple[float, float, float, float] = (-3.5, 3.5, -2.5, 2.5),
    grid_n: int = 55,
) -> dict[str, Any]:
    """2D Potential Flow Superposition."""
    sources = sources or []
    doublets = doublets or []
    vortices = vortices or []

    alpha = math.radians(alpha_deg)
    ux_inf = u_inf * math.cos(alpha)
    uy_inf = u_inf * math.sin(alpha)

    xmin, xmax, ymin, ymax = bounds
    xs = np.linspace(xmin, xmax, grid_n)
    ys = np.linspace(ymin, ymax, grid_n)
    X, Y = np.meshgrid(xs, ys)

    U = np.full_like(X, ux_inf)
    V = np.full_like(Y, uy_inf)
    psi = ux_inf * Y - uy_inf * X

    eps = 1e-4
    for s in sources:
        dx = X - float(s.get("x", 0.0))
        dy = Y - float(s.get("y", 0.0))
        r2 = np.maximum(dx ** 2 + dy ** 2, eps)
        m = float(s.get("m", 0.0))
        U += (m / (2.0 * math.pi)) * dx / r2
        V += (m / (2.0 * math.pi)) * dy / r2
        psi += (m / (2.0 * math.pi)) * np.arctan2(dy, dx)

    for d in doublets:
        dx = X - float(d.get("x", 0.0))
        dy = Y - float(d.get("y", 0.0))
        r2 = np.maximum(dx ** 2 + dy ** 2, eps)
        r4 = r2 ** 2
        kappa = float(d.get("kappa", 0.0))
        # Doublet pointing into -x (standard Rankine/cylinder convention with +U_inf: ψ = -κ y / (2π r^2))
        U += -(kappa / (2.0 * math.pi)) * (dx ** 2 - dy ** 2) / r4
        V += -(kappa / (2.0 * math.pi)) * (2.0 * dx * dy) / r4
        psi += -(kappa / (2.0 * math.pi)) * dy / r2

    total_gamma = 0.0
    for v in vortices:
        dx = X - float(v.get("x", 0.0))
        dy = Y - float(v.get("y", 0.0))
        r2 = np.maximum(dx ** 2 + dy ** 2, eps)
        gamma = float(v.get("gamma", 0.0))  # +gamma = CCW, -gamma = CW
        total_gamma += gamma
        U += -(gamma / (2.0 * math.pi)) * dy / r2
        V += (gamma / (2.0 * math.pi)) * dx / r2
        psi += -(gamma / (2.0 * math.pi)) * 0.5 * np.log(r2)

    speed2 = U ** 2 + V ** 2
    u_ref2 = max(u_inf ** 2, 1e-6)
    cp = 1.0 - speed2 / u_ref2

    # Kutta-Joukowski lift per unit span (for CCW gamma > 0 and +U_inf along +x, top speed decreases -> L' = -rho*U*gamma; for CW gamma < 0 -> L' > 0)
    lift_per_span = -rho * ux_inf * total_gamma

    # If a central doublet is present near origin with u_inf > 0, compute equivalent cylinder radius a = sqrt(kappa/(2*pi*U_inf))
    cyl_radius = None
    stag_points: list[list[float]] = []
    if len(doublets) == 1 and abs(u_inf) > 1e-6 and doublets[0].get("kappa", 0.0) > 0:
        a = math.sqrt(doublets[0]["kappa"] / (2.0 * math.pi * u_inf))
        cyl_radius = float(a)
        cx, cy = float(doublets[0].get("x", 0.0)), float(doublets[0].get("y", 0.0))
        # Stagnation on cylinder: v_theta = -2*U_inf*sin(theta) + gamma/(2*pi*a) = 0 -> sin(theta) = gamma/(4*pi*U_inf*a)
        ratio = total_gamma / (4.0 * math.pi * u_inf * a)
        if abs(ratio) <= 1.0:
            th1 = math.asin(ratio)
            th2 = math.pi - th1
            stag_points = [
                [cx + a * math.cos(th1), cy + a * math.sin(th1)],
                [cx + a * math.cos(th2), cy + a * math.sin(th2)],
            ]

    def _clean(a: np.ndarray, clamp: float = 30.0) -> list[list[float]]:
        return [
            [float(max(-clamp, min(clamp, x))) if math.isfinite(float(x)) else 0.0 for x in row]
            for row in a
        ]

    return {
        "bounds": list(bounds),
        "xs": [float(x) for x in xs],
        "ys": [float(y) for y in ys],
        "U": _clean(U),
        "V": _clean(V),
        "psi": _clean(psi, clamp=50.0),
        "cp": _clean(cp, clamp=10.0),
        "total_circulation": float(total_gamma),
        "lift_per_unit_span": float(lift_per_span),
        "equivalent_cylinder_radius": cyl_radius,
        "stagnation_points": stag_points,
    }

