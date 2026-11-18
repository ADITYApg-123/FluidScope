"""Numba-accelerated 2D D2Q9 BGK Lattice-Boltzmann Wind Tunnel (Ch. 9.6 / Ch. 10).

Supports calibrated presets AND custom geometric obstacles (Circle, Rectangle, Step, SplitterPlate)
so both interactive controls and the AI Text-to-Visual parser can simulate arbitrary 2D bodies.
Maintains low-Mach (u_in <= 0.08) and moderate Reynolds bounds for clean BGK stability.
"""

from __future__ import annotations

from typing import Any
import math
import numpy as np
from numba import njit


# D2Q9 discrete velocities (c_i = (cx, cy)) and lattice weights
_CX = np.array([0, 1, 0, -1, 0, 1, -1, -1, 1], dtype=np.int64)
_CY = np.array([0, 0, 1, 0, -1, 1, 1, -1, -1], dtype=np.int64)
_W = np.array([4 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 36, 1 / 36, 1 / 36, 1 / 36], dtype=np.float64)
_OPP = np.array([0, 3, 4, 1, 2, 7, 8, 5, 6], dtype=np.int64)


@njit(cache=True)
def _lbm_step_kernel(
    f: np.ndarray,
    solid: np.ndarray,
    u_in_profile: np.ndarray,
    omega_bgk: float,
    n_steps: int,
    probe_x: int,
    probe_y: int,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Run D2Q9 collide-stream-bounceback steps inside Numba JIT."""
    ny, nx, _ = f.shape
    ux = np.zeros((ny, nx), dtype=np.float64)
    uy = np.zeros((ny, nx), dtype=np.float64)
    rho = np.ones((ny, nx), dtype=np.float64)
    f_temp = np.empty_like(f)

    n_samples = max(1, n_steps // 10)
    wake_uy = np.zeros(n_samples, dtype=np.float64)
    sample_idx = 0

    for step in range(n_steps):
        # 1. Macroscopic moments + BGK collision (vector-unrolled over 9 directions)
        for j in range(ny):
            for i in range(nx):
                if solid[j, i]:
                    ux[j, i] = 0.0
                    uy[j, i] = 0.0
                    continue
                f0 = f[j, i, 0]
                f1 = f[j, i, 1]
                f2 = f[j, i, 2]
                f3 = f[j, i, 3]
                f4 = f[j, i, 4]
                f5 = f[j, i, 5]
                f6 = f[j, i, 6]
                f7 = f[j, i, 7]
                f8 = f[j, i, 8]
                r_loc = f0 + f1 + f2 + f3 + f4 + f5 + f6 + f7 + f8
                if r_loc < 1e-9:
                    r_loc = 1.0
                vx = ((f1 + f5 + f8) - (f3 + f6 + f7)) / r_loc
                vy = ((f2 + f5 + f6) - (f4 + f7 + f8)) / r_loc
                rho[j, i] = r_loc
                ux[j, i] = vx
                uy[j, i] = vy

                u2 = vx * vx + vy * vy
                for q in range(9):
                    cu = _CX[q] * vx + _CY[q] * vy
                    feq = _W[q] * r_loc * (1.0 + 3.0 * cu + 4.5 * cu * cu - 1.5 * u2)
                    f[j, i, q] = f[j, i, q] + omega_bgk * (feq - f[j, i, q])

        # 2. Streaming step (periodic default + boundary overrides right after)
        for j in range(ny):
            for i in range(nx):
                for q in range(9):
                    ni = i + _CX[q]
                    nj = j + _CY[q]
                    if 0 <= ni < nx and 0 <= nj < ny:
                        f_temp[nj, ni, q] = f[j, i, q]

        # 3. Half-way bounce-back on solid obstacles
        for j in range(ny):
            for i in range(nx):
                if solid[j, i]:
                    for q in range(9):
                        f[j, i, q] = f[j, i, _OPP[q]]
                else:
                    for q in range(9):
                        f[j, i, q] = f_temp[j, i, q]

        # 4. Top & bottom wall bounce-back
        for i in range(nx):
            # Bottom wall j=0
            f[0, i, 2] = f_temp[0, i, 4]
            f[0, i, 5] = f_temp[0, i, 7]
            f[0, i, 6] = f_temp[0, i, 8]
            # Top wall j=ny-1
            f[ny - 1, i, 4] = f_temp[ny - 1, i, 2]
            f[ny - 1, i, 7] = f_temp[ny - 1, i, 5]
            f[ny - 1, i, 8] = f_temp[ny - 1, i, 6]

        # 5. West Zou-He velocity inlet (i=0, interior j=1..ny-2)
        for j in range(1, ny - 1):
            if not solid[j, 0]:
                u_in = u_in_profile[j]
                rho_in = (f[j, 0, 0] + f[j, 0, 2] + f[j, 0, 4] + 2.0 * (f[j, 0, 3] + f[j, 0, 6] + f[j, 0, 7])) / (1.0 - u_in)
                f[j, 0, 1] = f[j, 0, 3] + (2.0 / 3.0) * rho_in * u_in
                f[j, 0, 5] = f[j, 0, 7] - 0.5 * (f[j, 0, 2] - f[j, 0, 4]) + (1.0 / 6.0) * rho_in * u_in
                f[j, 0, 8] = f[j, 0, 6] + 0.5 * (f[j, 0, 2] - f[j, 0, 4]) + (1.0 / 6.0) * rho_in * u_in

        # 6. East open zero-gradient outflow (i=nx-1)
        for j in range(1, ny - 1):
            if not solid[j, nx - 1]:
                f[j, nx - 1, 3] = f[j, nx - 2, 3]
                f[j, nx - 1, 6] = f[j, nx - 2, 6]
                f[j, nx - 1, 7] = f[j, nx - 2, 7]

        # Record wake probe time series
        if step % 10 == 0 and sample_idx < n_samples:
            wake_uy[sample_idx] = uy[probe_y, probe_x]
            sample_idx += 1

    # Final macroscopic recompute
    for j in range(ny):
        for i in range(nx):
            if solid[j, i]:
                ux[j, i] = 0.0
                uy[j, i] = 0.0
                rho[j, i] = 1.0
            else:
                r_loc = f[j, i, 0] + f[j, i, 1] + f[j, i, 2] + f[j, i, 3] + f[j, i, 4] + f[j, i, 5] + f[j, i, 6] + f[j, i, 7] + f[j, i, 8]
                rho[j, i] = r_loc
                ux[j, i] = ((f[j, i, 1] + f[j, i, 5] + f[j, i, 8]) - (f[j, i, 3] + f[j, i, 6] + f[j, i, 7])) / max(r_loc, 1e-9)
                uy[j, i] = ((f[j, i, 2] + f[j, i, 5] + f[j, i, 6]) - (f[j, i, 4] + f[j, i, 7] + f[j, i, 8])) / max(r_loc, 1e-9)

    return ux, uy, rho, wake_uy, f


def build_obstacle_mask(
    nx: int,
    ny: int,
    preset: str = "cylinder",
    obstacles: list[dict[str, Any]] | None = None,
) -> np.ndarray:
    """Build solid boolean mask from calibrated presets or validated primitive specs."""
    solid = np.zeros((ny, nx), dtype=np.bool_)
    solid[0, :] = True
    solid[-1, :] = True

    yy, xx = np.meshgrid(np.arange(ny), np.arange(nx), indexing="ij")
    p = preset.lower().strip()

    if p == "poiseuille":
        return solid
    if p in {"cylinder", "cylinder_splitter"}:
        cx, cy, rad = int(0.24 * nx), int(0.50 * ny), max(4, int(0.11 * ny))
        solid |= ((xx - cx) ** 2 + (yy - cy) ** 2) <= rad ** 2
        if p == "cylinder_splitter":
            plate_len = int(3.2 * rad)
            solid[(yy >= cy - 1) & (yy <= cy + 1) & (xx >= cx + rad) & (xx <= cx + rad + plate_len)] = True
        return solid
    if p == "backward_step":
        step_x = int(0.25 * nx)
        step_h = int(0.50 * ny)
        solid[(xx <= step_x) & (yy <= step_h)] = True
        return solid
    if p == "tandem_cylinders":
        rad = max(3, int(0.09 * ny))
        cx1, cx2, cy = int(0.22 * nx), int(0.42 * nx), int(0.50 * ny)
        solid |= ((xx - cx1) ** 2 + (yy - cy) ** 2) <= rad ** 2
        solid |= ((xx - cx2) ** 2 + (yy - cy) ** 2) <= rad ** 2
        return solid

    # Custom geometry primitives in normalized domain [0..1] x [0..1]
    if obstacles:
        for ob in obstacles:
            otype = str(ob.get("type", "")).lower()
            if otype == "circle":
                cx = float(ob.get("x", 0.25)) * nx
                cy = float(ob.get("y", 0.50)) * ny
                r = max(2.0, float(ob.get("r", 0.10)) * ny)
                solid |= ((xx - cx) ** 2 + (yy - cy) ** 2) <= r ** 2
            elif otype in {"rect", "splitter", "step"}:
                x0 = float(ob.get("x0", 0.30)) * nx
                x1 = float(ob.get("x1", 0.50)) * nx
                y0 = float(ob.get("y0", 0.45)) * ny
                y1 = float(ob.get("y1", 0.55)) * ny
                solid |= (xx >= x0) & (xx <= x1) & (yy >= y0) & (yy <= y1)
    return solid


def simulate_lbm_tunnel(
    preset: str = "cylinder",
    reynolds: float = 95.0,
    n_steps: int = 500,
    nx: int = 160,
    ny: int = 52,
    obstacles: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Run incompressible D2Q9 BGK tunnel and return downsampled flow/vorticity fields."""
    re_safe = max(15.0, min(180.0, float(reynolds)))
    u_in_max = 0.065  # Mach <= 0.12 for incompressible BGK accuracy

    solid = build_obstacle_mask(nx, ny, preset=preset, obstacles=obstacles)

    # Characteristic length for tau calibration
    l_char = max(6.0, 0.22 * ny) if preset != "poiseuille" else float(ny - 2)
    nu_lat = max(0.015, u_in_max * l_char / re_safe)
    tau = 3.0 * nu_lat + 0.5
    omega_bgk = 1.0 / tau

    # Parabolic laminar inflow + tiny y-perturbation at t=0 for cylinder shedding
    y_norm = np.linspace(0.0, 1.0, ny)
    u_in_profile = 4.0 * u_in_max * y_norm * (1.0 - y_norm)
    if preset not in {"poiseuille"}:
        # Slightly flatter uniform core for bluff-body wakes
        u_in_profile = u_in_max * np.sin(np.pi * y_norm) ** 0.35

    f = np.zeros((ny, nx, 9), dtype=np.float64)
    ux0 = np.repeat(u_in_profile[:, None], nx, axis=1)
    uy0 = np.zeros((ny, nx), dtype=np.float64)
    if preset in {"cylinder", "tandem_cylinders", "custom"}:
        # Subtle asymmetry breaks pitchfork symmetry cleanly
        yy, xx = np.meshgrid(np.arange(ny), np.arange(nx), indexing="ij")
        uy0 = 0.004 * u_in_max * np.sin(2.0 * np.pi * xx / max(nx * 0.25, 1))
    ux0[solid] = 0.0
    uy0[solid] = 0.0
    u2_0 = ux0 ** 2 + uy0 ** 2
    for q in range(9):
        cu = _CX[q] * ux0 + _CY[q] * uy0
        f[:, :, q] = _W[q] * (1.0 + 3.0 * cu + 4.5 * cu ** 2 - 1.5 * u2_0)

    probe_x = min(nx - 4, int(0.55 * nx))
    probe_y = ny // 2
    ux, uy, rho, wake_uy, _ = _lbm_step_kernel(f, solid, u_in_profile, omega_bgk, int(n_steps), probe_x, probe_y)

    # Vorticity Ωz = ∂v/∂x - ∂u/∂y
    dv_dx = np.gradient(uy, axis=1)
    du_dy = np.gradient(ux, axis=0)
    vort = (dv_dx - du_dy) / max(u_in_max, 1e-6)  # Normalized dimensionless vorticity
    vort[solid] = 0.0

    # Downsample slightly for lightweight fast JSON transport to HTML5 Canvas
    sx = max(1, nx // 54)
    sy = max(1, ny // 24)
    xs = [float(i) / (nx - 1) * (nx / ny) for i in range(0, nx, sx)]
    ys = [float(j) / (ny - 1) for j in range(0, ny, sy)]
    u_sub = (ux[::sy, ::sx] / u_in_max).tolist()
    v_sub = (uy[::sy, ::sx] / u_in_max).tolist()
    w_sub = vort[::sy, ::sx].tolist()
    solid_sub = solid[::sy, ::sx].tolist()

    # Extract full-res normalized solid pixels for crisp geometry drawing on canvas
    solid_rects: list[list[float]] = []
    aspect = nx / ny
    dx_n = aspect / nx
    dy_n = 1.0 / ny
    for j in range(1, ny - 1):
        i = 0
        while i < nx:
            if solid[j, i]:
                i_start = i
                while i < nx and solid[j, i]:
                    i += 1
                solid_rects.append([
                    round(i_start * dx_n, 4),
                    round(j * dy_n, 4),
                    round((i - i_start) * dx_n, 4),
                    round(dy_n * 1.05, 4),
                ])
            else:
                i += 1

    mass_total = float(np.sum(rho[~solid]))
    stable = bool(np.all(np.isfinite(ux)) and np.all(np.isfinite(uy)) and np.max(np.abs(ux)) < 0.4)

    # Downstream velocity profile u(y) at x = 0.75 * nx
    x_prof_idx = min(nx - 2, int(0.75 * nx))
    y_prof = [float(j) / (ny - 1) for j in range(ny)]
    u_prof = [float(ux[j, x_prof_idx] / u_in_max) for j in range(ny)]

    return {
        "preset": preset,
        "reynolds": float(re_safe),
        "tau_bgk": float(tau),
        "mach_inlet": float(u_in_max * math.sqrt(3.0)),
        "n_steps": int(n_steps),
        "grid_shape": [ny, nx],
        "stable": stable,
        "mass_fluid": mass_total,
        "wake_uy_history": [float(v / u_in_max) for v in wake_uy],
        "wake_oscillation_rms": float(np.std(wake_uy[len(wake_uy) // 2 :] / u_in_max)) if len(wake_uy) > 4 else 0.0,
        "solid_rects": solid_rects,
        "downstream_profile": {"y": y_prof, "u_over_Uin": u_prof},
        "field_2d": {
            "bounds": [0.0, float(xs[-1]), 0.0, 1.0],
            "xs": xs,
            "ys": ys,
            "U": u_sub,
            "V": v_sub,
            "vorticity": w_sub,
            "solid": solid_sub,
        },
    }

