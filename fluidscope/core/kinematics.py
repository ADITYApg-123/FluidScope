"""Equation-driven 2D Eulerian & Lagrangian Kinematics Engine (Som, Biswas & Chakraborty Ch. 3).

Supports arbitrary SymPy velocity fields u(x, y, t), v(x, y, t):
- Symbolic divergence, vorticity (Ωz), rotation (ωz), shear/linear strain, local & convective accel.
- Streamlines, Pathlines, and Streaklines (matching Example 3.10 exact definitions).
- Advected & deforming fluid square (translation, shear, rotation visualizer).
- Closed-loop circulation Γ and numerical Stokes' theorem comparison.
"""

from __future__ import annotations

from typing import Any
import math
import numpy as np
from scipy.integrate import solve_ivp
import sympy as sp
from sympy.parsing.sympy_parser import (
    parse_expr,
    standard_transformations,
    implicit_multiplication_application,
    convert_xor,
)


_X, _Y, _T = sp.symbols("x y t", real=True)
_TRANSFORMS = standard_transformations + (
    implicit_multiplication_application,
    convert_xor,
)

_SAFE_FUNCS: dict[str, Any] = {
    "x": _X,
    "y": _Y,
    "t": _T,
    "pi": sp.pi,
    "e": sp.E,
    "E": sp.E,
    "exp": sp.exp,
    "sin": sp.sin,
    "cos": sp.cos,
    "tan": sp.tan,
    "sinh": sp.sinh,
    "cosh": sp.cosh,
    "tanh": sp.tanh,
    "sqrt": sp.sqrt,
    "log": sp.log,
    "ln": sp.log,
    "Abs": sp.Abs,
    "abs": sp.Abs,
}


def safe_parse_velocity(
    expr_str: str,
    params: dict[str, float] | None = None,
) -> tuple[sp.Expr, sp.Expr]:
    """Parse an arbitrary velocity expression safely without eval/exec.

    Returns (symbolic_with_params_named, numeric_substituted_expr).
    """
    cleaned = (expr_str or "").strip()
    if not cleaned:
        raise ValueError("Velocity expression cannot be empty.")
    if "__" in cleaned or ";" in cleaned or "import" in cleaned:
        raise ValueError("Invalid characters or disallowed token in velocity expression.")

    param_map: dict[str, sp.Symbol] = {}
    local_dict = dict(_SAFE_FUNCS)
    if params:
        for pname in params:
            if not isinstance(pname, str) or not pname.isidentifier() or pname in _SAFE_FUNCS:
                raise ValueError(
                    f"Invalid or reserved parameter name '{pname}'. "
                    "Parameter names cannot shadow built-in variables (x, y, t) or math functions."
                )
            sym = sp.Symbol(pname, real=True)
            param_map[pname] = sym
            local_dict[pname] = sym

    try:
        expr = parse_expr(cleaned, local_dict=local_dict, transformations=_TRANSFORMS, evaluate=True)
    except Exception as exc:
        raise ValueError(f"Could not parse expression '{expr_str}': {exc}") from exc

    allowed_syms = {_X, _Y, _T} | set(param_map.values())
    unknown = expr.free_symbols - allowed_syms
    if unknown:
        names = ", ".join(sorted(str(s) for s in unknown))
        raise ValueError(f"Unknown symbol(s) {names}. Allowed variables are x, y, t and declared parameters.")

    sub_expr = expr.subs({param_map[k]: float(v) for k, v in (params or {}).items()})
    sub_simple = sp.simplify(sub_expr)
    if sub_simple.has(sp.I) or sub_simple.is_real is False:
        raise ValueError(
            f"Velocity expression '{expr_str}' produces complex/imaginary values; "
            "only real-valued velocity fields are supported."
        )
    return expr, sub_simple


def _lambdify_2d(expr: sp.Expr):
    fn = sp.lambdify((_X, _Y, _T), expr, modules=["numpy"])

    def wrapped(xv, yv, tv):
        with np.errstate(divide="ignore", invalid="ignore", over="ignore"):
            out = fn(xv, yv, tv)
        if np.iscomplexobj(out):
            if np.any(np.abs(np.imag(out)) > 1e-12):
                raise ValueError("Velocity evaluation produced complex/imaginary values.")
            out = np.real(out)
        if np.ndim(xv) == 0 and np.ndim(yv) == 0:
            return float(out)
        arr = np.broadcast_to(np.asarray(out, dtype=np.float64), np.broadcast_shapes(np.shape(xv), np.shape(yv)))
        return arr

    return wrapped


def _safe_eval_point(fn, x0: float, y0: float, t0: float) -> float | None:
    try:
        val = fn(float(x0), float(y0), float(t0))
        if val is None or not math.isfinite(val):
            return None
        return float(val)
    except Exception:
        return None


def _integrate_streamline(
    u_fn,
    v_fn,
    x0: float,
    y0: float,
    t_eval: float,
    bounds: tuple[float, float, float, float],
    max_arc: float = 12.0,
) -> list[list[float]]:
    xmin, xmax, ymin, ymax = bounds

    def unit_rhs(_s, state):
        px, py = float(state[0]), float(state[1])
        if not (xmin <= px <= xmax and ymin <= py <= ymax):
            return [0.0, 0.0]
        uv = _safe_eval_point(u_fn, px, py, t_eval)
        vv = _safe_eval_point(v_fn, px, py, t_eval)
        if uv is None or vv is None:
            return [0.0, 0.0]
        spd = math.hypot(uv, vv)
        if spd < 1e-9:
            return [0.0, 0.0]
        return [uv / spd, vv / spd]

    def out_event(_s, state):
        px, py = state[0], state[1]
        return min(px - xmin, xmax - px, py - ymin, ymax - py)

    out_event.terminal = True
    out_event.direction = -1

    def stag_event(_s, state):
        uv = _safe_eval_point(u_fn, state[0], state[1], t_eval)
        vv = _safe_eval_point(v_fn, state[0], state[1], t_eval)
        if uv is None or vv is None:
            return -1.0
        return math.hypot(uv, vv) - 1e-6

    stag_event.terminal = True
    stag_event.direction = -1

    pts_back: list[list[float]] = []
    sol_b = solve_ivp(
        lambda s, st: [-c for c in unit_rhs(s, st)],
        (0.0, max_arc * 0.5),
        [x0, y0],
        events=[out_event, stag_event],
        max_step=0.06,
        rtol=1e-6,
        atol=1e-8,
    )
    if sol_b.y.shape[1] > 1:
        pts_back = [[float(sol_b.y[0, i]), float(sol_b.y[1, i])] for i in range(sol_b.y.shape[1] - 1, 0, -1)]

    sol_f = solve_ivp(
        unit_rhs,
        (0.0, max_arc * 0.65),
        [x0, y0],
        events=[out_event, stag_event],
        max_step=0.06,
        rtol=1e-6,
        atol=1e-8,
    )
    pts_fwd = [[float(sol_f.y[0, i]), float(sol_f.y[1, i])] for i in range(sol_f.y.shape[1])]
    return pts_back + pts_fwd


def _advect_particle(
    u_fn,
    v_fn,
    x_start: float,
    y_start: float,
    t_a: float,
    t_b: float,
    bounds: tuple[float, float, float, float],
    n_samples: int = 80,
) -> np.ndarray:
    if abs(t_b - t_a) < 1e-12:
        return np.array([[x_start, y_start]], dtype=np.float64)

    xmin, xmax, ymin, ymax = bounds
    margin = 0.5 * max(xmax - xmin, ymax - ymin)
    ext_bounds = (xmin - margin, xmax + margin, ymin - margin, ymax + margin)

    def rhs(t_cur, state):
        px, py = float(state[0]), float(state[1])
        uv = _safe_eval_point(u_fn, px, py, t_cur)
        vv = _safe_eval_point(v_fn, px, py, t_cur)
        if uv is None or vv is None:
            return [0.0, 0.0]
        return [uv, vv]

    def out_ext(_t, state):
        return min(
            state[0] - ext_bounds[0],
            ext_bounds[1] - state[0],
            state[1] - ext_bounds[2],
            ext_bounds[3] - state[1],
        )

    out_ext.terminal = True
    out_ext.direction = -1

    t_eval = np.linspace(t_a, t_b, n_samples)
    sol = solve_ivp(
        rhs,
        (t_a, t_b),
        [x_start, y_start],
        t_eval=t_eval,
        events=[out_ext],
        rtol=1e-7,
        atol=1e-9,
        max_step=max(abs(t_b - t_a) / 25.0, 1e-4),
    )
    return sol.y.T


def analyze_kinematics(
    u_str: str,
    v_str: str,
    params: dict[str, float] | None = None,
    x0: float = 1.0,
    y0: float = 1.0,
    t0: float = 1.0,
    t_eval: float = 2.0,
    bounds: tuple[float, float, float, float] = (-4.0, 6.0, -4.0, 6.0),
    grid_n: int = 26,
    loop_center: tuple[float, float] = (1.5, 1.5),
    loop_radius: float = 0.75,
) -> dict[str, Any]:
    """Perform full symbolic & numerical 2D kinematics analysis."""
    if t_eval < t0:
        raise ValueError("Evaluation time t_eval must be >= release time t0.")

    u_sym_raw, u_expr = safe_parse_velocity(u_str, params)
    v_sym_raw, v_expr = safe_parse_velocity(v_str, params)

    # Symbolic derivatives
    du_dx = sp.simplify(sp.diff(u_expr, _X))
    du_dy = sp.simplify(sp.diff(u_expr, _Y))
    du_dt = sp.simplify(sp.diff(u_expr, _T))

    dv_dx = sp.simplify(sp.diff(v_expr, _X))
    dv_dy = sp.simplify(sp.diff(v_expr, _Y))
    dv_dt = sp.simplify(sp.diff(v_expr, _T))

    div_expr = sp.simplify(du_dx + dv_dy)
    vort_expr = sp.simplify(dv_dx - du_dy)  # Som-Biswas-Chakraborty Ωz
    rot_expr = sp.simplify(vort_expr / 2)   # fluid angular velocity ωz
    shear_expr = sp.simplify(dv_dx + du_dy) # engineering shear rate γ̇_xy

    ax_local = du_dt
    ay_local = dv_dt
    ax_conv = sp.simplify(u_expr * du_dx + v_expr * du_dy)
    ay_conv = sp.simplify(u_expr * dv_dx + v_expr * dv_dy)
    ax_tot = sp.simplify(ax_local + ax_conv)
    ay_tot = sp.simplify(ay_local + ay_conv)

    is_steady = (du_dt == 0) and (dv_dt == 0)
    is_incompressible = div_expr == 0
    is_irrotational = vort_expr == 0

    u_fn = _lambdify_2d(u_expr)
    v_fn = _lambdify_2d(v_expr)
    vort_fn = _lambdify_2d(vort_expr)
    div_fn = _lambdify_2d(div_expr)
    ax_fn = _lambdify_2d(ax_tot)
    ay_fn = _lambdify_2d(ay_tot)
    ax_local_fn = _lambdify_2d(ax_local)
    ax_conv_fn = _lambdify_2d(ax_conv)
    ay_local_fn = _lambdify_2d(ay_local)
    ay_conv_fn = _lambdify_2d(ay_conv)

    # Whole field grid at t_eval for quiver/heatmap & mouse hover probe interpolation
    xmin, xmax, ymin, ymax = bounds
    xs = np.linspace(xmin, xmax, grid_n)
    ys = np.linspace(ymin, ymax, grid_n)
    X, Y = np.meshgrid(xs, ys)
    U_grid = u_fn(X, Y, float(t_eval))
    V_grid = v_fn(X, Y, float(t_eval))
    W_grid = vort_fn(X, Y, float(t_eval))

    def clean_grid(arr: np.ndarray, clamp: float = 50.0) -> list[list[float | None]]:
        out: list[list[float | None]] = []
        for row in arr:
            r_list: list[float | None] = []
            for val in row:
                f = float(val)
                if not math.isfinite(f) or abs(f) > 1e6:
                    r_list.append(None)
                else:
                    r_list.append(float(max(-clamp, min(clamp, f))))
            out.append(r_list)
        return out

    # Streamline through (x0, y0) at t_eval
    streamline_pts = _integrate_streamline(
        u_fn,
        v_fn,
        float(x0),
        float(y0),
        float(t_eval),
        bounds,
        max_arc=2.2 * ((xmax - xmin) + (ymax - ymin)),
    )

    # Pathline starting at (x0, y0) at t0 ending at t_eval
    path_arr = _advect_particle(u_fn, v_fn, float(x0), float(y0), float(t0), float(t_eval), bounds, n_samples=90)
    pathline_pts = [[float(p[0]), float(p[1])] for p in path_arr]

    # Streakline at t_eval: dye continuously emitted from (x0, y0) during tau in [t0, t_eval]
    n_streak = 42
    taus = np.linspace(float(t0), float(t_eval), n_streak)
    streakline_pts: list[list[float]] = []
    for tau in taus:
        traj = _advect_particle(u_fn, v_fn, float(x0), float(y0), float(tau), float(t_eval), bounds, n_samples=20)
        tip = traj[-1]
        streakline_pts.append([float(tip[0]), float(tip[1])])

    # Advect an initial fluid square around (x0, y0) from t0 to t_eval (shows translation + rotation + shear)
    span = min(xmax - xmin, ymax - ymin) * 0.045
    sq_local = [
        (-span, -span),
        (0.0, -span),
        (span, -span),
        (span, 0.0),
        (span, span),
        (0.0, span),
        (-span, span),
        (-span, 0.0),
    ]
    initial_square = [[float(x0 + dx), float(y0 + dy)] for dx, dy in sq_local]
    deformed_square: list[list[float]] = []
    for dx, dy in sq_local:
        tr = _advect_particle(u_fn, v_fn, float(x0 + dx), float(y0 + dy), float(t0), float(t_eval), bounds, n_samples=25)
        deformed_square.append([float(tr[-1, 0]), float(tr[-1, 1])])

    # Stokes' Theorem numerical verification around circular loop
    lcx, lcy = float(loop_center[0]), float(loop_center[1])
    lr = float(max(0.05, loop_radius))
    n_theta = 180
    thetas = np.linspace(0.0, 2.0 * math.pi, n_theta, endpoint=False)
    dtheta = 2.0 * math.pi / n_theta
    gamma_line = 0.0
    valid_loop = True
    for th in thetas:
        px = lcx + lr * math.cos(th)
        py = lcy + lr * math.sin(th)
        uv = _safe_eval_point(u_fn, px, py, t_eval)
        vv = _safe_eval_point(v_fn, px, py, t_eval)
        if uv is None or vv is None:
            valid_loop = False
            break
        dx_ds = -lr * math.sin(th)
        dy_ds = lr * math.cos(th)
        gamma_line += (uv * dx_ds + vv * dy_ds) * dtheta

    # Area integral ∬ Ωz dA over loop disk using midpoint polar quadrature
    nr, nt = 24, 72
    r_edges = np.linspace(0.0, lr, nr + 1)
    r_mids = 0.5 * (r_edges[:-1] + r_edges[1:])
    dr = lr / nr
    t_mids = np.linspace(0.0, 2.0 * math.pi, nt, endpoint=False) + math.pi / nt
    dt_q = 2.0 * math.pi / nt
    RR, TT = np.meshgrid(r_mids, t_mids, indexing="ij")
    XX = lcx + RR * np.cos(TT)
    YY = lcy + RR * np.sin(TT)
    WW = vort_fn(XX, YY, float(t_eval))
    finite_mask = np.isfinite(WW) & (np.abs(WW) < 1e4)
    UU_disk = u_fn(XX, YY, float(t_eval))
    VV_disk = v_fn(XX, YY, float(t_eval))
    vel_finite = np.isfinite(UU_disk) & np.isfinite(VV_disk) & (np.abs(UU_disk) < 1e4) & (np.abs(VV_disk) < 1e4)
    if np.any(finite_mask):
        gamma_area = float(np.sum(np.where(finite_mask, WW, 0.0) * RR) * dr * dt_q)
    else:
        gamma_area = 0.0
    tol = 1e-4 if is_irrotational else max(0.05, 0.08 * abs(gamma_line))
    discrepancy = valid_loop and abs(gamma_line - gamma_area) > tol
    center_u = _safe_eval_point(u_fn, lcx, lcy, t_eval)
    center_v = _safe_eval_point(v_fn, lcx, lcy, t_eval)
    center_singular = (center_u is None) or (center_v is None) or (abs(center_u) > 1e4) or (abs(center_v) > 1e4)
    stokes_singularity_inside = bool(
        (not valid_loop) or (not np.all(finite_mask)) or (not np.all(vel_finite)) or center_singular or discrepancy
    )

    # Point telemetry at (x0, y0, t_eval)
    pt_u = _safe_eval_point(u_fn, x0, y0, t_eval)
    pt_v = _safe_eval_point(v_fn, x0, y0, t_eval)
    pt_w = _safe_eval_point(vort_fn, x0, y0, t_eval)
    pt_div = _safe_eval_point(div_fn, x0, y0, t_eval)
    pt_ax = _safe_eval_point(ax_fn, x0, y0, t_eval)
    pt_ay = _safe_eval_point(ay_fn, x0, y0, t_eval)
    pt_ax_local = _safe_eval_point(ax_local_fn, x0, y0, t_eval)
    pt_ax_conv = _safe_eval_point(ax_conv_fn, x0, y0, t_eval)
    pt_ay_local = _safe_eval_point(ay_local_fn, x0, y0, t_eval)
    pt_ay_conv = _safe_eval_point(ay_conv_fn, x0, y0, t_eval)

    return {
        "expressions": {
            "u_input": u_str,
            "v_input": v_str,
            "u_tex": sp.latex(u_sym_raw),
            "v_tex": sp.latex(v_sym_raw),
            "div_tex": sp.latex(div_expr),
            "vorticity_tex": sp.latex(vort_expr),
            "rotation_tex": sp.latex(rot_expr),
            "shear_rate_tex": sp.latex(shear_expr),
            "ax_tex": sp.latex(ax_tot),
            "ay_tex": sp.latex(ay_tot),
            "ax_local_tex": sp.latex(ax_local),
            "ax_conv_tex": sp.latex(ax_conv),
            "ay_local_tex": sp.latex(ay_local),
            "ay_conv_tex": sp.latex(ay_conv),
        },
        "classification": {
            "steady": bool(is_steady),
            "incompressible": bool(is_incompressible),
            "irrotational": bool(is_irrotational),
            "curves_coincide": bool(is_steady),
        },
        "point_probe": {
            "x": float(x0),
            "y": float(y0),
            "t": float(t_eval),
            "u": pt_u,
            "v": pt_v,
            "speed": (math.hypot(pt_u, pt_v) if pt_u is not None and pt_v is not None else None),
            "vorticity_z": pt_w,
            "rotation_z": (0.5 * pt_w if pt_w is not None else None),
            "divergence": pt_div,
            "ax": pt_ax,
            "ay": pt_ay,
            "ax_local": pt_ax_local,
            "ax_convective": pt_ax_conv,
            "ay_local": pt_ay_local,
            "ay_convective": pt_ay_conv,
        },
        "curves": {
            "streamline": streamline_pts,
            "pathline": pathline_pts,
            "streakline": streakline_pts,
            "initial_element": initial_square,
            "deformed_element": deformed_square,
        },
        "stokes_check": {
            "center": [lcx, lcy],
            "radius": lr,
            "circulation_line": float(gamma_line) if valid_loop else None,
            "circulation_area_vorticity": float(gamma_area),
            "singularity_suspected": stokes_singularity_inside,
        },
        "field": {
            "bounds": list(bounds),
            "xs": [float(v) for v in xs],
            "ys": [float(v) for v in ys],
            "U": clean_grid(U_grid),
            "V": clean_grid(V_grid),
            "vorticity": clean_grid(W_grid, clamp=100.0),
        },
    }

