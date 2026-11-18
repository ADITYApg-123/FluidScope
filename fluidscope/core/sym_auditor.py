"""Symbolic Navier-Stokes, Euler, Boundary Layer, and Bernoulli assumption auditor.

Uses SymPy symbolically to derive simplified governing equations and cross-highlight
which terms drop out or activate under physical assumption toggles matching
Som, Biswas & Chakraborty (3rd Ed.).
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any
import sympy as sp


@dataclass(frozen=True)
class AssumptionState:
    steady: bool = True
    incompressible: bool = True
    inviscid: bool = True
    irrotational: bool = True
    no_slip: bool = True
    newtonian: bool = True
    inertial_frame: bool = True
    adverse_pressure_gradient: bool = False
    irreversible_jump: bool = False

    @classmethod
    def from_dict(cls, raw: dict[str, Any] | None) -> "AssumptionState":
        if not raw:
            return cls()
        valid = {k: bool(raw[k]) for k in cls.__dataclass_fields__ if k in raw}
        return cls(**valid)


def _build_symbolic_lhs_rhs(state: AssumptionState) -> dict[str, str]:
    """Use SymPy to assemble clean LaTeX expressions for the active equations."""
    x, y, t, r = sp.symbols("x y t r", real=True, positive=True)
    rho, mu, g, V_sym, H_sym, Omega_z = sp.symbols("rho mu g V H Omega_z", real=True)
    coords = (x, y) if state.steady else (x, y, t)
    p = sp.Function("p")(*coords)
    u = sp.Function("u")(*coords)
    v = sp.Function("v")(*coords)
    a_fx = sp.Symbol("a_{\\text{frame},x}", real=True)

    # Continuity equation simplified symbolically via SymPy
    if state.incompressible:
        cont_expr = sp.Eq(sp.Derivative(u, x) + sp.Derivative(v, y), 0)
        cont_tex = sp.latex(cont_expr)
    else:
        rho_fn = sp.Function("rho")(*coords)
        cont_lhs = (0 if state.steady else sp.Derivative(rho_fn, t)) + sp.Derivative(rho_fn * u, x) + sp.Derivative(rho_fn * v, y)
        cont_tex = sp.latex(sp.Eq(cont_lhs, 0))

    # Build symbolic x-momentum LHS and RHS dynamically
    lhs_terms = []
    if not state.steady:
        lhs_terms.append(rho * sp.Derivative(u, t))
    lhs_terms.append(rho * (u * sp.Derivative(u, x) + v * sp.Derivative(u, y)))
    lhs_expr = sum(lhs_terms)

    rhs_terms = [-sp.Derivative(p, x)]
    if state.inviscid:
        pass
    elif state.newtonian:
        rhs_terms.append(mu * (sp.Derivative(u, x, 2) + sp.Derivative(u, y, 2)))
    else:
        tau_xy = sp.Function("tau_{xy}")(x, y)
        tau_xx = sp.Function("tau_{xx}")(x, y)
        rhs_terms.append(sp.Derivative(tau_xx, x) + sp.Derivative(tau_xy, y))

    if not state.inertial_frame:
        rhs_terms.append(-rho * a_fx)

    mom_eq = sp.Eq(lhs_expr, sum(rhs_terms))

    # Cross-stream normal Bernoulli gradient Eq. (4.43-4.44)
    if state.irrotational and state.inviscid and state.steady and not state.irreversible_jump:
        cross_stream_tex = r"\frac{\partial H}{\partial n} = \frac{V}{g}\,\Omega_z = 0 \implies H = \text{const globally}"
    elif state.inviscid and state.steady and not state.irreversible_jump:
        cross_stream_tex = r"\frac{\partial H}{\partial n} = \frac{V}{g}\,\Omega_z \neq 0 \quad (\text{Ch. 4.5, Eq. 4.43})"
    else:
        cross_stream_tex = r"\frac{\partial H}{\partial n} \text{ non-conservative (viscous / unsteady / jump dissipation)}"

    return {
        "continuity_tex": cont_tex,
        "momentum_x_tex": sp.latex(mom_eq),
        "cross_stream_tex": cross_stream_tex,
    }


def _build_equation_contexts(sym_eqs: dict[str, str]) -> dict[str, dict[str, str]]:
    """Build normalized textbook equation contexts for header display across labs."""
    return {
        "ns_x": {
            "id": "ns_x",
            "title": "2D Navier–Stokes / Euler (Streamwise x)",
            "tex": sym_eqs["momentum_x_tex"],
            "subtitle": "Term-by-term local inertia, convective inertia, pressure, viscous, and frame balance (Ch. 4 & Ch. 8).",
        },
        "radial_euler": {
            "id": "radial_euler",
            "title": "Radial Euler & Crocco Equation (Ch. 4.5, Eq. 4.43)",
            "tex": r"\frac{\partial p}{\partial r} = \rho \frac{v_\theta^2}{r}, \qquad \frac{\partial H}{\partial n} = \frac{V}{g}\,\Omega_z",
            "subtitle": "Outward pressure rise balances centrifugal acceleration, while total head H varies across streamlines iff Ωz ≠ 0.",
        },
        "specific_force": {
            "id": "specific_force",
            "title": "Specific Energy vs. Specific Force (Ch. 11.5 & 12.4)",
            "tex": r"E_s = h + \frac{q^2}{2gh^2}, \qquad F_s = \frac{q^2}{gh} + \frac{h^2}{2} = \text{const}",
            "subtitle": "Across hydraulic jumps and sudden expansions, integral momentum (Fs) holds while mechanical energy dissipates.",
        },
        "frame_g_eff": {
            "id": "frame_g_eff",
            "title": "Non-Inertial Frame Hydrostatics (Ch. 2.9, Eq. 2.86)",
            "tex": r"\nabla p = \rho\left(\mathbf{g} - \mathbf{a}_{\text{frame}}\right), \qquad \tan\theta = \frac{a_x}{g + a_z}",
            "subtitle": "Effective gravity g_eff = g + az drops to zero in free fall (az = -g), flattening the meniscus and halting efflux.",
        },
        "boundary_layer": {
            "id": "boundary_layer",
            "title": "Prandtl Boundary Layer & Wall Curvature (Ch. 9.6, Eq. 9.41–9.42)",
            "tex": r"u\frac{\partial u}{\partial x} + v\frac{\partial u}{\partial y} = -\frac{1}{\rho}\frac{dp}{dx} + \nu\frac{\partial^2 u}{\partial y^2}, \qquad \left.\mu\frac{\partial^2 u}{\partial y^2}\right|_w = \frac{dp}{dx}",
            "subtitle": "Adverse pressure gradient dp/dx > 0 enforces positive wall curvature and an interior inflection point ahead of separation.",
        },
    }


def audit_assumptions(
    raw_state: dict[str, Any] | AssumptionState | None = None,
    equation_context: str | None = None,
) -> dict[str, Any]:
    """Return structured term-by-term equation audit and Bernoulli / boundary rules."""
    ctx_key = equation_context
    if ctx_key is None and isinstance(raw_state, dict):
        ctx_key = raw_state.get("equation_context")
    state = raw_state if isinstance(raw_state, AssumptionState) else AssumptionState.from_dict(raw_state)
    sym_eqs = _build_symbolic_lhs_rhs(state)
    eq_contexts = _build_equation_contexts(sym_eqs)
    active_ctx_id = ctx_key if isinstance(ctx_key, str) and ctx_key in eq_contexts else "ns_x"

    ns_terms = [
        {
            "id": "local_inertia",
            "label": "Local Inertia",
            "tex": r"\rho \frac{\partial u}{\partial t}",
            "active": not state.steady,
            "role": "amber" if not state.steady else "dim",
            "note": "Non-zero in unsteady flow: streamlines, pathlines, and streaklines diverge (Ch. 3.3.3)."
            if not state.steady
            else "Zero in steady flow (Eulerian field invariant with time).",
        },
        {
            "id": "convective_inertia",
            "label": "Convective Inertia",
            "tex": r"\rho \left(u\frac{\partial u}{\partial x} + v\frac{\partial u}{\partial y}\right)",
            "active": True,
            "role": "ice",
            "note": "Spatial velocity gradients cause particle acceleration even in steady flow (Table 3.2).",
        },
        {
            "id": "pressure_grad",
            "label": "Pressure Gradient",
            "tex": r"-\frac{\partial p}{\partial x}",
            "active": True,
            "role": "coral" if state.adverse_pressure_gradient else "amber",
            "note": (
                "Adverse (dp/dx > 0): forces positive wall curvature (∂²u/∂y²)|w > 0 and an inflection point, risking separation (Eq. 9.42)."
                if state.adverse_pressure_gradient
                else "Favorable or zero pressure gradient driving fluid motion."
            ),
        },
        {
            "id": "viscous_stress",
            "label": "Viscous Diffusion / Stress",
            "tex": r"\mu \nabla^2 u" if state.newtonian else r"\nabla \cdot \boldsymbol{\tau}(\dot{\gamma})",
            "active": not state.inviscid,
            "role": ("coral" if not state.newtonian else "amber") if not state.inviscid else "dim",
            "note": (
                "Dropped (inviscid Euler limit)."
                if state.inviscid
                else (
                    "Newtonian viscous stress active — dissipates mechanical energy into internal energy."
                    if state.newtonian
                    else "Non-Newtonian constitutive law active: apparent viscosity depends on shear rate / yield stress (Ch. 1.6)."
                )
            ),
        },
        {
            "id": "frame_pseudo",
            "label": "Non-Inertial Frame Force",
            "tex": r"-\rho a_{\text{frame},x}",
            "active": not state.inertial_frame,
            "role": "coral" if not state.inertial_frame else "dim",
            "note": (
                "Accelerating or rotating control volume adds frame pseudo-body force (Ch. 2.9 / Ch. 5)."
                if not state.inertial_frame
                else "Inertial lab reference frame."
            ),
        },
    ]

    for term in ns_terms:
        term["highlight"] = "dim" if not term["active"] else ("alert" if term["role"] == "coral" else "active")

    bernoulli_along_streamline = (
        state.steady and state.incompressible and state.inviscid and state.inertial_frame and not state.irreversible_jump
    )
    bernoulli_everywhere = bernoulli_along_streamline and state.irrotational

    warnings: list[str] = []
    if not state.steady:
        warnings.append("Unsteady flow: streamline, pathline, and streakline diverge; unsteady Bernoulli requires ∫(∂V/∂t)ds.")
    if not state.inviscid:
        warnings.append("Viscous effects active: mechanical head H decreases along flow; boundary layer can separate if dp/dx > 0.")
    if not state.irrotational:
        warnings.append("Rotational flow (Ωz ≠ 0): Bernoulli constant H varies across streamlines (∂H/∂n = V·Ωz/g, Eq. 4.43).")
    if not state.no_slip:
        warnings.append("Wall slip active (u_w = l_s |∂u/∂y|_w): breaks classical zero-wall-velocity Poiseuille derivation.")
    if not state.newtonian:
        warnings.append("Non-Newtonian rheology: viscosity μ is not constant; yield-stress fluids form unyielded plug cores.")
    if not state.inertial_frame:
        warnings.append("Non-inertial reference frame: hydrostatic / Bernoulli laws must include frame acceleration (Ch. 2.9).")
    if state.adverse_pressure_gradient:
        warnings.append("Adverse pressure gradient (dp/dx > 0): Eq. (9.42) forces inflection point; separation occurs at τ_w = 0 (Eq. 9.41).")
    if state.irreversible_jump:
        warnings.append("Shock / Hydraulic Jump / Abrupt Expansion: mechanical energy is NOT conserved; apply integral momentum instead (Ch. 11.5, 12.4).")

    wall_bc_tex = (
        r"u\big|_{\text{wall}} = u_{\text{solid}}"
        if state.no_slip
        else r"u\big|_{\text{wall}} - u_{\text{solid}} = \pm l_s \left.\frac{\partial u}{\partial y}\right|_{\text{wall}}"
    )

    return {
        "assumptions": asdict(state),
        "symbolic": {
            "continuity_tex": sym_eqs["continuity_tex"],
            "momentum_x_tex": sym_eqs["momentum_x_tex"],
            "cross_stream_tex": sym_eqs["cross_stream_tex"],
            "wall_bc_tex": wall_bc_tex,
        },
        "terms": ns_terms,
        "bernoulli_status": {
            "valid_along_streamline": bernoulli_along_streamline,
            "valid_globally": bernoulli_everywhere,
            "verdict": (
                "GLOBALLY VALID (Constant H everywhere)"
                if bernoulli_everywhere
                else (
                    "STREAMLINE-ONLY (Rotational: H jumps across streamlines)"
                    if bernoulli_along_streamline
                    else "BROKEN (Do NOT use standard Bernoulli)"
                )
            ),
        },
        "warnings": warnings,
        "equation_context": eq_contexts[active_ctx_id],
        "equation_contexts": eq_contexts,
    }
