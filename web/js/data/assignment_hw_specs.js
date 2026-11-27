/**
 * Structured Homework Assignment Specifications (HW 1–7), Subpart Hierarchies,
 * Interactive CAD Parameter Schemas, and Parameterized KaTeX Step-by-Step Solutions.
 */
import { fmtNum } from "../core/color_scales.js";

function f(v, d = 3) {
  return fmtNum(v, d);
}

export const HOMEWORK_SPECS = [
  {
    id: "hw1",
    code: "HW 1",
    title: "Unsteady Streamlines, Pathlines & Streaklines",
    topic: "Streamlines, Pathlines & Streaklines in Unsteady Flow",
    supportsCustomEquations: true,
    defaultEquations: { u_str: "x / (t + t0)", v_str: "v0" },
    eqParamsKeys: ["t0", "v0"],
    plotTabs: [
      { id: "primary", label: "Nondim & Curves" },
      { id: "coords", label: "x(t) & y(t) Time History" },
    ],
    presets: [
      { label: "Default (t0=1, v0=1)", values: { u_str: "x / (t + t0)", v_str: "v0", t0: 1.0, v0: 1.0, x0: 1.0, y0: 0.0, t_eval: 2.0 } },
      { label: "Faster Vertical (v0=2)", values: { u_str: "x / (t + t0)", v_str: "v0", t0: 1.0, v0: 2.0, x0: 1.0, y0: 0.0, t_eval: 2.0 } },
      { label: "Steady Comparison", values: { u_str: "x / 2", v_str: "v0", t0: 1.0, v0: 1.0, x0: 1.0, y0: 0.0, t_eval: 2.0 } },
    ],
    params: [
      { key: "t0", label: "Ref time t₀", min: 0.3, max: 3.0, step: 0.1, def: 1.0, unit: "s" },
      { key: "v0", label: "Vertical speed v₀", min: 0.3, max: 3.0, step: 0.1, def: 1.0, unit: "m/s" },
      { key: "x0", label: "Seed x₀", min: 0.2, max: 2.5, step: 0.1, def: 1.0, unit: "m" },
      { key: "y0", label: "Seed y₀", min: -1.0, max: 1.0, step: 0.1, def: 0.0, unit: "m" },
      { key: "t_eval", label: "Obs time t", min: 0.8, max: 6.0, step: 0.1, def: 2.0, unit: "s" },
      { key: "nondim", label: "Nondimensional (X, Y) plot", type: "toggle", def: true },
    ],
    statementHtml:
      "Consider a three-dimensional, unsteady velocity field described by " +
      "$\\mathbf{u} = (x/(t+t_0),\\; v_0,\\; 0)$ where $t_0 > 0$ and $v_0 > 0$ are positive constants. " +
      "Motion starting in $z=z_0$ stays strictly planar.",
    subparts: [
      { id: "a", label: "(a) Streamline", prompt: "Derive the instantaneous streamline passing through $(x_0, y_0)$ at time $t = t_0$." },
      { id: "b", label: "(b) Streakline", prompt: "Dye is continuously injected at $(x_0, y_0)$ beginning at $t = t_0$. Find the dye locus at $t = 2t_0$." },
      { id: "c", label: "(c) Pathline", prompt: "Determine the trajectory of a single fluid parcel passing through $(x_0, y_0)$ at $t = t_0$." },
      { id: "d", label: "(d) Visualization & Coincidence", prompt: "Plot streamline, streakline, and pathline in nondimensional $(X,Y)$ and explain why they diverge." },
    ],
  },
  {
    id: "hw2",
    code: "HW 2",
    title: "Planar Stagnation-Point Flow",
    topic: "Kinematics & Deformation of u = Ax, v = -Ay",
    supportsCustomEquations: true,
    defaultEquations: { u_str: "A * x", v_str: "-A * y" },
    eqParamsKeys: ["A"],
    plotTabs: [
      { id: "primary", label: "Dimension & Area Lx, Ly, A" },
      { id: "pressure", label: "Bernoulli Pressure vs r" },
    ],
    presets: [
      { label: "Standard (A = 1.0)", values: { u_str: "A * x", v_str: "-A * y", A: 1.0, x1: 0.5, x2: 1.1, y1: 0.8, y2: 1.6, tau_end: 1.15 } },
      { label: "Strong Strain (A = 1.8)", values: { u_str: "A * x", v_str: "-A * y", A: 1.8, x1: 0.4, x2: 0.9, y1: 1.0, y2: 1.8, tau_end: 1.15 } },
      { label: "Rotational Vortex", values: { u_str: "-A * y", v_str: "A * x", A: 1.2, x1: 0.5, x2: 1.1, y1: 0.2, y2: 0.8, tau_end: 1.5 } },
    ],
    params: [
      { key: "A", label: "Strain rate A", min: 0.2, max: 3.0, step: 0.1, def: 1.0, unit: "s⁻¹" },
      { key: "x1", label: "Box left x₁", min: 0.15, max: 1.5, step: 0.05, def: 0.5, unit: "m" },
      { key: "x2", label: "Box right x₂", min: 0.4, max: 2.0, step: 0.05, def: 1.1, unit: "m" },
      { key: "y1", label: "Box bottom y₁", min: 0.2, max: 1.8, step: 0.05, def: 0.8, unit: "m" },
      { key: "y2", label: "Box top y₂", min: 0.6, max: 2.5, step: 0.05, def: 1.6, unit: "m" },
      { key: "tau_end", label: "Duration A·t", min: 0.4, max: 1.6, step: 0.05, def: 1.15, unit: "—" },
    ],
    statementHtml:
      "Consider the steady 2D velocity field $u = Ax$, $v = -Ay$ where $A > 0$ has dimensions $T^{-1}$.",
    subparts: [
      { id: "a", label: "(a) Streamlines & ψ", prompt: "Derive the differential equation governing the streamlines and obtain $xy = C$." },
      { id: "b", label: "(b) Particle Trajectories", prompt: "Determine trajectories $x(t), y(t)$ for parcels released from different initial positions." },
      { id: "c", label: "(c) Material Element", prompt: "Animate an initially rectangular fluid parcel $[x_1,x_2]\\times[y_1,y_2]$ and prove constant area." },
      { id: "d", label: "(d) Stagnation & Strain", prompt: "Explain stagnation point $(0,0)$, stagnation pressure, and pure extensional strain." },
      { id: "e", label: "(e) Div & Vorticity", prompt: "Prove mathematically that $\\nabla\\cdot\\mathbf{u} = 0$ and $\\omega_z = 0$." },
    ],
  },
  {
    id: "hw3",
    code: "HW 3",
    title: "Tank Draining & Torricelli's Law",
    topic: "Unsteady Momentum Balance & Viscous Departure",
    supportsCustomEquations: false,
    plotTabs: [
      { id: "primary", label: "Height h(t)/h₀ vs Torricelli" },
      { id: "error", label: "Parametric Error % vs A/A₀" },
    ],
    presets: [
      { label: "Standard (A/A₀=10, Water)", values: { ratio_A: 10, h0_over_sqrtA: 100, mu: 0.001, A_tank: 0.01 } },
      { label: "Free Fall Limit (A/A₀=1)", values: { ratio_A: 1, h0_over_sqrtA: 10, mu: 0.001, A_tank: 0.01 } },
      { label: "High Viscosity (μ=0.1 Pa·s)", values: { ratio_A: 100, h0_over_sqrtA: 1, mu: 0.1, A_tank: 0.01 } },
    ],
    params: [
      { key: "ratio_A", label: "Area ratio A / A₀", min: 1, max: 1000, step: 1, def: 10, unit: "—" },
      { key: "h0_over_sqrtA", label: "Slenderness h₀ / √A", min: 1, max: 1000, step: 1, def: 100, unit: "—" },
      { key: "mu", label: "Viscosity μ", min: 0.0005, max: 0.15, step: 0.0005, def: 0.001, unit: "Pa·s" },
      { key: "A_tank", label: "Tank area A", min: 0.005, max: 0.05, step: 0.005, def: 0.01, unit: "m²" },
    ],
    statementHtml:
      "A vertical tank of uniform area $A$ contains incompressible Newtonian liquid $(\\rho, \\mu)$ draining through a bottom outlet of area $A_0$ under gravity ($p_1=p_2=p_{\\text{atm}}$).",
    subparts: [
      { id: "a", label: "(a) Integral Balances", prompt: "Derive the unsteady mass and $z$-momentum control-volume balances including $F_{\\text{bottom}}$." },
      { id: "b", label: "(b) Ideal ODE & Sign Check", prompt: "Verify the ideal unsteady Bernoulli ODE $-h\\ddot{h} + \\frac{1}{2}\\dot{h}^2[(A/A_0)^2 - 1] - gh = 0$ and list assumptions." },
      { id: "c", label: "(c) Analytical vs Torricelli", prompt: "Solve the first integral for $\\dot{h}^2$ and contrast with $V_e = \\sqrt{2gh}$ and $t_T$." },
      { id: "d", label: "(d) Parametric Study", prompt: "Evaluate draining across $A/A_0 \\in \\{1,10,100,1000\\}$ and $h_0/\\sqrt{A} \\in \\{1,10,100,1000\\}$." },
      { id: "e", label: "(e) Viscous Regime Map", prompt: "Compare $\\mu = 10^{-3}\\,\\text{Pa}\\cdot\\text{s}$ vs $\\mu = 10^{-1}\\,\\text{Pa}\\cdot\\text{s}$ with wall and orifice friction." },
      { id: "f", label: "(f) Real Discrepancies", prompt: "Identify physical discrepancies: vena contracta ($C_c$), viscosity, inertia, swirl, and capillarity." },
    ],
  },
  {
    id: "hw4",
    code: "HW 4",
    title: "Tapered Tank & Gas Depressurization",
    topic: "Variable-Geometry & Compressible Mass Conservation",
    supportsCustomEquations: false,
    sections: [
      { id: "p1", label: "Problem 4.1 · Tapered Tank" },
      { id: "p2", label: "Problem 4.2 · Spherical Vessel" },
    ],
    plotTabs: [
      { id: "primary", label: "Transient Decay vs Ref" },
      { id: "sweep", label: "Taper Sensitivity / Milestones" },
    ],
    presets: [
      { label: "4.1 Cylinder (θ = 0°)", values: { section: "p1", theta_deg: 0, h0: 1.0, R_top: 0.4, Ae: 0.002, Cd: 1.0, KL: 0.0, R_sphere: 0.5, k_exhaust: 0.05, rho0: 1.2 } },
      { label: "4.1 Flared Cone (θ = 20°)", values: { section: "p1", theta_deg: 20, h0: 1.0, R_top: 0.4, Ae: 0.002, Cd: 1.0, KL: 0.0, R_sphere: 0.5, k_exhaust: 0.05, rho0: 1.2 } },
      { label: "4.2 Spherical Vessel", values: { section: "p2", theta_deg: 0, h0: 1.0, R_top: 0.4, Ae: 0.002, Cd: 1.0, KL: 0.0, R_sphere: 0.5, k_exhaust: 0.05, rho0: 1.2 } },
    ],
    params: [
      { key: "section", label: "Active Sub-Problem", type: "select", options: [{ value: "p1", label: "4.1 Tapered Conical Tank" }, { value: "p2", label: "4.2 Spherical Gas Vessel" }], def: "p1" },
      { key: "theta_deg", label: "Wall angle θ (4.1)", min: -20, max: 21, step: 1, def: 12, unit: "°", section: "p1" },
      { key: "h0", label: "Initial depth h₀", min: 0.3, max: 2.0, step: 0.05, def: 1.0, unit: "m", section: "p1" },
      { key: "R_top", label: "Top radius R", min: 0.25, max: 1.0, step: 0.05, def: 0.4, unit: "m", section: "p1" },
      { key: "Ae", label: "Outlet area A_e", min: 0.0005, max: 0.006, step: 0.0005, def: 0.002, unit: "m²", section: "p1" },
      { key: "Cd", label: "Discharge coeff C_d", min: 0.5, max: 1.0, step: 0.02, def: 1.0, unit: "—", section: "p1" },
      { key: "KL", label: "Loss coeff K_L (4.1e)", min: 0.0, max: 2.5, step: 0.1, def: 0.0, unit: "—", section: "p1" },
      { key: "R_sphere", label: "Sphere radius R (4.2)", min: 0.2, max: 1.5, step: 0.05, def: 0.5, unit: "m", section: "p2" },
      { key: "k_exhaust", label: "Exhaust coeff k (4.2)", min: 0.01, max: 0.25, step: 0.01, def: 0.05, unit: "m³/s", section: "p2" },
      { key: "rho0", label: "Initial ρ₀ (4.2)", min: 0.5, max: 5.0, step: 0.1, def: 1.2, unit: "kg/m³", section: "p2" },
    ],
    statementHtml:
      "<strong>4.1 Tapered Tank:</strong> Axisymmetric frustum ($h(0)=h_0, r(0)=R$, inclination $\\theta$) draining through outlet $A_e$. " +
      "<strong>4.2 Rigid Sphere:</strong> Volume $\\mathcal{V}=\\frac{4}{3}\\pi R^3$ depressurizing at $\\dot{m}_e = k\\rho$.",
    subparts: [
      { id: "4.1a", section: "p1", label: "4.1(a) Area A(h)", prompt: "Express $r(h)$ and free-surface area $A(h)$ cleanly in terms of $r_b = R - h_0\\tan\\theta$." },
      { id: "4.1b", section: "p1", label: "4.1(b) Mass ODE", prompt: "Apply mass conservation $A(h)\\,dh/dt = -C_d A_e\\sqrt{2gh}$." },
      { id: "4.1c", section: "p1", label: "4.1(c) Emptying Time", prompt: "Integrate analytically for $t_e$ and verify cylindrical & inverted cone ($1/5$) limits." },
      { id: "4.1d", section: "p1", label: "4.1(d) Sensitivities", prompt: "Investigate how $t_e$ depends on taper angle $\\theta$, $h_0$, and outlet area $A_e$." },
      { id: "4.1e", section: "p1", label: "4.1(e) Unsteady Bernoulli", prompt: "Remove Torricelli assumption via internal continuity + unsteady Bernoulli ($K_L$)." },
      { id: "4.2a", section: "p2", label: "4.2(a) Sphere Mass ODE", prompt: "Apply control-volume mass conservation to obtain $\\mathcal{V}\\,d\\rho/dt + k\\rho = 0$." },
      { id: "4.2b", section: "p2", label: "4.2(b) Exact ρ(t)", prompt: "Solve analytically for $\\rho(t) = \\rho_0 e^{-t/\\tau}$." },
      { id: "4.2c", section: "p2", label: "4.2(c) Timescale τ", prompt: "Identify the e-folding residence timescale $\\tau = 4\\pi R^3/(3k)$." },
      { id: "4.2d", section: "p2", label: "4.2(d) Milestones", prompt: "Compute exact depletion times for $99\\%, 50\\%, 10\\%, 1\\%$ of initial density." },
      { id: "4.2e", section: "p2", label: "4.2(e) Rapid Blowdown", prompt: "Explain acoustic $t_a \\sim R/c$ and choked-flow assumptions when rapid venting breaks uniformity." },
    ],
  },
  {
    id: "hw5",
    code: "HW 5",
    title: "Taylor–Couette vs. Planar Couette & Torque",
    topic: "Annular Swirl Velocity, Shear Stress Decay & Constant Torque",
    supportsCustomEquations: false,
    plotTabs: [
      { id: "primary", label: "Velocity vs Planar Couette" },
      { id: "pressure", label: "Radial Pressure & Shear τ" },
    ],
    presets: [
      { label: "Annular Flow (κ = 2.5)", values: { kappa: 2.5, R1: 0.05, omega1: 12.0, mu: 0.05, rho: 900, L_cyl: 1.0 } },
      { label: "Planar Couette Limit (κ = 1.05)", values: { kappa: 1.05, R1: 0.05, omega1: 12.0, mu: 0.05, rho: 900, L_cyl: 1.0 } },
      { label: "Free-Vortex Limit (κ = 20)", values: { kappa: 20.0, R1: 0.05, omega1: 12.0, mu: 0.05, rho: 900, L_cyl: 1.0 } },
    ],
    params: [
      { key: "kappa", label: "Radius ratio κ = R₂ / R₁", min: 1.05, max: 20.0, step: 0.05, def: 2.5, unit: "—" },
      { key: "R1", label: "Inner radius R₁", min: 0.02, max: 0.25, step: 0.01, def: 0.05, unit: "m" },
      { key: "omega1", label: "Inner speed Ω₁", min: 2.0, max: 40.0, step: 1.0, def: 12.0, unit: "rad/s" },
      { key: "mu", label: "Viscosity μ", min: 0.001, max: 0.2, step: 0.005, def: 0.05, unit: "Pa·s" },
      { key: "rho", label: "Density ρ", min: 500, max: 1400, step: 50, def: 900, unit: "kg/m³" },
      { key: "L_cyl", label: "Cylinder length L", min: 0.2, max: 3.0, step: 0.1, def: 1.0, unit: "m" },
    ],
    statementHtml:
      "Steady, incompressible, laminar flow between coaxial cylinders ($R_1 < r < R_2$): inner rotates at $\\Omega_1$, outer is stationary ($\\Omega_2 = 0$).",
    subparts: [
      { id: "a", label: "(a) u_θ(r) & p(r)", prompt: "Derive azimuthal velocity $u_\\theta(r)$ and radial pressure $p(r) - p(R_1)$ from cylindrical Navier–Stokes." },
      { id: "b", label: "(b) Limits vs κ", prompt: "Examine $\\kappa \\to 1^+$ (planar Couette) and $\\kappa \\to \\infty$ (irrotational free-vortex profile)." },
      { id: "c", label: "(c) Planar Couette Regime", prompt: "Derive small-gap expansion $\\epsilon = (R_2 - R_1)/R_1 \\ll 1$ and quantify linearization accuracy." },
      { id: "d", label: "(d) Shear & Torque", prompt: "Derive shear stress $\\tau_{r\\theta}(r) \\propto r^{-2}$ and constant transmitted torque $T(r)$." },
      { id: "e", label: "(e) f_visc,θ = 0 Paradox", prompt: "Explain how nonzero $\\tau_{r\\theta}(r)$ produces zero net azimuthal viscous force density $f_{\\text{visc},\\theta} = 0$." },
      { id: "f", label: "(f) Torque vs Stress", prompt: "Contrast global angular momentum conservation ($T = \\text{const}$) with $1/r^2$ local stress decay." },
    ],
  },
  {
    id: "hw6",
    code: "HW 6",
    title: "Rectangular-Duct Flow vs. Plane Poiseuille",
    topic: "Separation of Variables, Eigenmodes & Parallel-Plate Limit",
    supportsCustomEquations: false,
    plotTabs: [
      { id: "primary", label: "X & Y Centrelines vs Poiseuille" },
      { id: "convergence", label: "Poiseuille Limit Convergence" },
    ],
    presets: [
      { label: "Square Duct (α = 1.0)", values: { alpha: 1.0, n_terms: 15, G_norm: 1.0 } },
      { label: "Tall Narrow (α = 0.5)", values: { alpha: 0.5, n_terms: 15, G_norm: 1.0 } },
      { label: "Wide Slot Poiseuille (α = 10)", values: { alpha: 10.0, n_terms: 15, G_norm: 1.0 } },
      { label: "Thin Vertical Slot (α = 0.1)", values: { alpha: 0.1, n_terms: 15, G_norm: 1.0 } },
    ],
    params: [
      { key: "alpha", label: "Aspect ratio α = a / b", min: 0.1, max: 10.0, step: 0.1, def: 1.0, unit: "—" },
      { key: "n_terms", label: "Fourier modes N", min: 1, max: 25, step: 1, def: 15, unit: "modes" },
      { key: "G_norm", label: "Forcing G = -(1/μ)dp/dz", min: 0.5, max: 4.0, step: 0.1, def: 1.0, unit: "(ms)⁻¹" },
    ],
    statementHtml:
      "Steady laminar pressure-driven flow $\\mu(\\partial_{xx} w + \\partial_{yy} w) = dp/dz < 0$ inside a rectangular duct $-a \\le x \\le a$, $-b \\le y \\le b$ with no-slip walls.",
    subparts: [
      { id: "a", label: "(a) Laplace Reduction", prompt: "Split $w = w_p(y) + w_h(x, y)$ using 1D plane-Poiseuille $w_p$ to isolate $\\nabla^2 w_h = 0$." },
      { id: "b", label: "(b) Separation Constant C", prompt: "Analyze all three cases $C = +\\lambda^2$, $C = -\\lambda^2$, and $C = 0$ without prejudging signs." },
      { id: "c", label: "(c) Admissibility", prompt: "Filter modes by BCs/symmetry and prove equivalence of dual $+C / -C$ bases via Dirichlet uniqueness." },
      { id: "d", label: "(d) Fourier Series", prompt: "Evaluate Fourier coefficients $C_n$, prove uniform Weierstrass convergence, and nondimensionalize." },
      { id: "e", label: "(e) Contour & Centerlines", prompt: "Visualize $W^*$ contours for $\\alpha \\in \\{0.1, 0.5, 1, 2, 10\\}$ and locate peak velocity." },
      { id: "f", label: "(f) Poiseuille Limits", prompt: "Prove exponential approach to plane Poiseuille flow as $a/b \\to \\infty$ or $b/a \\to \\infty$." },
      { id: "g", label: "(g) Spectral Physics", prompt: "Interpret boundary layers as spectral filters with sidewall penetration depth $\\sim \\min(a,b)$." },
    ],
  },
  {
    id: "hw7",
    code: "HW 7",
    title: "Stokes' First Problem & Bounded Couette Transition",
    topic: "Transient Momentum Diffusion vs. Finite-Gap Couette Limit",
    supportsCustomEquations: false,
    plotTabs: [
      { id: "primary", label: "Profiles u(y,t) / U" },
      { id: "similarity", label: "Self-Similar erfc(η) & ωz" },
    ],
    presets: [
      { label: "Semi-Infinite (Water, t=8s)", values: { bounded: false, U: 1.0, nu_e6: 1.0, t_cur: 8.0, H_mm: 10.0 } },
      { label: "High Viscosity (ν = 5e-6)", values: { bounded: false, U: 1.0, nu_e6: 5.0, t_cur: 8.0, H_mm: 10.0 } },
      { label: "Bounded Wall → Couette (H=10mm)", values: { bounded: true, U: 1.0, nu_e6: 1.0, t_cur: 12.0, H_mm: 10.0 } },
    ],
    params: [
      { key: "bounded", label: "Bounded upper wall at y = H", type: "toggle", def: false },
      { key: "U", label: "Plate speed U", min: 0.2, max: 3.0, step: 0.1, def: 1.0, unit: "m/s" },
      { key: "nu_e6", label: "Kinematic viscosity ν (×10⁻⁶)", min: 0.5, max: 10.0, step: 0.5, def: 1.0, unit: "mm²/s" },
      { key: "H_mm", label: "Upper wall gap H (bounded)", min: 4.0, max: 25.0, step: 1.0, def: 10.0, unit: "mm" },
      { key: "t_cur", label: "Elapsed time t", min: 0.5, max: 60.0, step: 0.5, def: 8.0, unit: "s" },
    ],
    statementHtml:
      "An infinite flat plate at $y=0$ impulsively accelerates to constant velocity $U$ in $y>0$, governed by $\\partial u/\\partial t = \\nu \\partial^2 u/\\partial y^2$.",
    subparts: [
      { id: "a", label: "(a) Similarity ODE", prompt: "Transform the transient PDE using $\\eta = y/(2\\sqrt{\\nu t})$ into $f'' + 2\\eta f' = 0$." },
      { id: "b", label: "(b) erfc(η) Solution", prompt: "Solve in terms of $\\mathrm{erfc}(\\eta)$ and interpret $\\eta^2 = (y^2/4\\nu)/t$ physically." },
      { id: "c", label: "(c) Transient Evolution", prompt: "Compare velocity profiles $u(y,t)$ across multiple times ($0.5\\text{–}60\\,\\text{s}$)." },
      { id: "d", label: "(d) Long-Time Non-Equilibrium", prompt: "Contrast local $u(y,t)\\to U$ at fixed $y$ with unbounded global domain never reaching steady state." },
      { id: "e", label: "(e) Bounded Wall (Couette)", prompt: "Place a stationary wall at $y = H$: contrast Fourier transient decay against steady Couette $U(1 - y/H)$." },
      { id: "f", label: "(f) δ₉₉ & Vorticity Sheet", prompt: "Compute $\\delta_{99}(t) \\approx 3.643\\sqrt{\\nu t}$ and connect to Gaussian diffusion of total circulation $\\int \\omega_z\\,dy = U$." },
    ],
  },
];

export function buildSolutionSteps(hwId, v, sim, customOverride = null) {
  if (customOverride && typeof customOverride === "object") {
    if (customOverride.steps_by_subpart) return customOverride.steps_by_subpart;
  }

  if (hwId === "hw1") {
    const { t0, v0, x0, y0, t_eval } = v;
    const xPath = x0 * ((t_eval + t0) / (2 * t0));
    const yPath = y0 + v0 * (t_eval - t0);
    const xStrAt2t0 = x0 * Math.exp(v0 * (t_eval - t0) / (v0 * (t0 + t0)));
    return {
      a: [
        {
          title: "Instantaneous Streamline Differential Equation",
          explanation: `At fixed instant $t = t_0 = ${f(t0, 2)}\\,\\text{s}$, $u(x,t_0) = x/(2t_0)$ and $v = v_0 = ${f(v0, 2)}$. Setting $dx/u = dy/v$:`,
          equation_tex: String.raw`\frac{\mathrm{d}x}{x/(2t_0)} = \frac{\mathrm{d}y}{v_0} \implies \int_{x_0}^{x}\frac{\mathrm{d}x'}{x'} = \int_{y_0}^{y}\frac{\mathrm{d}y'}{2v_0 t_0}`,
        },
        {
          title: "Exponential Streamline Equation",
          explanation: `For $(x_0,y_0)=(${f(x0, 2)}, ${f(y0, 2)})$ and $2v_0 t_0 = ${f(2 * v0 * t0, 3)}\\,\\text{m}$:`,
          equation_tex: `x = x_0 \\exp\\!\\left(\\frac{y - y_0}{2v_0 t_0}\\right) = ${f(x0, 2)}\\exp\\!\\left(\\frac{y - ${f(y0, 2)}}{${f(2 * v0 * t0, 3)}}\\right)`,
        },
      ],
      b: [
        {
          title: "Lagrangian Map for Dye Emitted at $\\tau$",
          explanation: "Integrating $\\mathrm{d}x/x = \\mathrm{d}t'/(t'+t_0)$ and $\\mathrm{d}y/\\mathrm{d}t' = v_0$ from release instant $\\tau \\in [t_0, t]$ to $t$:",
          equation_tex: String.raw`x(t;\tau) = x_0\frac{t+t_0}{\tau+t_0}, \qquad y(t;\tau) = y_0 + v_0(t - \tau)`,
        },
        {
          title: "Streakline Locus at $t = 2t_0$",
          explanation: `Eliminating $\\tau = 2t_0 - (y-y_0)/v_0$ yields the finite dye curve stretching from injector $(${f(x0, 2)}, ${f(y0, 2)})$ to tip $(${f(1.5 * x0, 3)}, ${f(y0 + v0 * t0, 3)})$:`,
          equation_tex: `x = \\frac{x_0}{1 - \\frac{y-y_0}{3v_0 t_0}} = \\frac{${f(x0, 2)}}{1 - \\frac{y-${f(y0, 2)}}{${f(3 * v0 * t0, 3)}}}, \\qquad ${f(y0, 2)} \\le y \\le ${f(y0 + v0 * t0, 2)}`,
        },
      ],
      c: [
        {
          title: "Parametric Pathline Trajectory ($\\tau = t_0$)",
          explanation: "Fixing the release time of a single parcel at $\\tau = t_0$ gives $x(t) = x_0(t+t_0)/(2t_0)$ and $y(t) = y_0 + v_0(t-t_0)$:",
          equation_tex: `x = x_0\\!\\left(1 + \\frac{y-y_0}{2v_0 t_0}\\right) \\implies \\text{At } t=${f(t_eval, 2)}\\text{s}:\\; (${f(xPath, 3)},\\; ${f(yPath, 3)})`,
        },
      ],
      d: [
        {
          title: "Nondimensional Parameter-Free Collapse & Physics",
          explanation: `Using $X = x/x_0$ and $Y = (y-y_0)/(v_0 t_0)$ collapses all parameters. At $Y=1$, streamline hits $e^{1/2}\\approx 1.649$ (or $X=${f(xStrAt2t0 / Math.max(x0, 1e-6), 3)}$ at $t=2t_0$) while pathline and streakline tip meet at $(1.5, 1.0)$:`,
          equation_tex: String.raw`X_{\text{stream}}(t_0)=e^{Y/2}, \quad X_{\text{path}}=1+\frac{Y}{2}, \quad X_{\text{streak}}=\frac{1}{1-Y/3}`,
        },
      ],
    };
  }

  if (hwId === "hw2") {
    const { A, x1, x2, y1, y2, tau_end } = v;
    const lx0 = Math.max(0.05, x2 - x1);
    const ly0 = Math.max(0.05, y2 - y1);
    const area0 = lx0 * ly0;
    const stretch = Math.exp(tau_end);
    const comp = Math.exp(-tau_end);
    return {
      a: [
        {
          title: "Separable Streamline ODE & Stream Function",
          explanation: `With $u=${f(A, 2)}x$ and $v=-${f(A, 2)}y$, setting $\\mathrm{d}y/\\mathrm{d}x = -y/x$ separates cleanly:`,
          equation_tex: String.raw`\frac{\mathrm{d}y}{y} + \frac{\mathrm{d}x}{x} = 0 \implies xy = C, \qquad \psi(x,y) = Axy = ${f(A, 2)}xy`,
        },
      ],
      b: [
        {
          title: "Exponential Lagrangian Trajectories",
          explanation: `Integrating $\\dot{x} = Ax$ and $\\dot{y} = -Ay$ from $(x_0, y_0)$ over $At = ${f(tau_end, 2)}$:`,
          equation_tex: `x(t) = x_0 e^{At} = ${f(stretch, 3)}\\,x_0, \\qquad y(t) = y_0 e^{-At} = ${f(comp, 3)}\\,y_0`,
        },
      ],
      c: [
        {
          title: "Exact Area Conservation of Material Rectangle",
          explanation: `Vertical walls remain vertical ($x_1 e^{At}\\to x_2 e^{At}$) and horizontal walls remain horizontal. Initial box $[${f(x1, 2)}, ${f(x2, 2)}]\\times[${f(y1, 2)}, ${f(y2, 2)}]$ keeps exact constant area $\\mathcal{A} = ${f(area0, 3)}\\,\\text{m}^2$:`,
          equation_tex: `L_x = ${f(lx0 * stretch, 3)}\\,\\text{m}, \\quad L_y = ${f(ly0 * comp, 3)}\\,\\text{m}, \\quad \\mathcal{A}(t) = L_x L_y = ${f(area0, 3)}\\,\\text{m}^2`,
        },
      ],
      d: [
        {
          title: "Stagnation Point Pressure & Pure Strain Tensor",
          explanation: "Velocity vanishes at $(0,0)$ yielding peak stagnation pressure $p_0$. The gradient tensor is strictly symmetric ($\\mathbf{\\Omega}=0$):",
          equation_tex: `\\mathbf{S} = \\begin{pmatrix} ${f(A, 2)} & 0 \\\\ 0 & ${f(-A, 2)} \\end{pmatrix}, \\quad \\frac{L_x/L_{x0}}{L_y/L_{y0}} = e^{2At} = ${f(Math.exp(2 * tau_end), 2)}`,
        },
      ],
      e: [
        {
          title: "Incompressible & Irrotational Verification",
          explanation: "Opposite linear strains cancel divergence identically, and zero cross-derivatives make vorticity vanish everywhere:",
          equation_tex: `\\nabla\\cdot\\mathbf{u} = ${f(A, 2)} + (${f(-A, 2)}) = 0, \\quad \\omega_z = \\frac{\\partial v}{\\partial x} - \\frac{\\partial u}{\\partial y} = 0, \\quad \\phi = \\frac{${f(A, 2)}}{2}(x^2 - y^2)`,
        },
      ],
    };
  }

  if (hwId === "hw3") {
    const R = v.ratio_A;
    const rH = v.h0_over_sqrtA;
    const beta = R * R - 1;
    const h0 = rH * Math.sqrt(v.A_tank);
    const tT = R * Math.sqrt((2 * h0) / 9.81);
    const tdRatioVisc = sim?.t_visc_ratio ?? 1.0;
    const pctErr = Math.abs(tdRatioVisc - 1) * 100;
    return {
      a: [
        {
          title: "Deforming CV Mass & Vertical Momentum Balance",
          explanation: `For $A/A_0 = ${f(R, 0)}$, outlet speed scales as $V_e = (A/A_0)V_s$. Accounting for unsteady column inertia adds an $(1 - A/A_0)$ momentum flux reaction:`,
          equation_tex: String.raw`\rho A\left[h\ddot{h} + \dot{h}^2\left(1 - \frac{A}{A_0}\right)\right] = F_{\text{bottom}} - p_{\text{atm}}(A-A_0) - \rho gAh + F_{\text{visc},z}`,
        },
      ],
      b: [
        {
          title: "Ideal Unsteady Bernoulli & Crucial Sign Verification",
          explanation: "Integrating $\\int_h^0 \\ddot{h}\\,\\mathrm{d}z = -h\\ddot{h}$ confirms the exact sign (checking $t=0,\\dot{h}=0 \\implies \\ddot{h}=-g$ rejects printed $+h\\ddot{h}$):",
          equation_tex: String.raw`-h\ddot{h} + \frac{1}{2}\dot{h}^2\left[\left(\frac{A}{A_0}\right)^2 - 1\right] - gh = 0 \qquad (\beta = ${f(beta, 1)})`,
        },
      ],
      c: [
        {
          title: "First Integral vs. Classical Torricelli",
          explanation: `Here classical Torricelli empties in $t_T = ${f(tT, 3)}\\,\\text{s}$. Note for $A/A_0=1$, exact free fall is $1-(t/t_T)^2$ (concave down) vs Torricelli $(1-t/t_T)^2$ (concave up):`,
          equation_tex: R === 2 ? String.raw`\dot{h}^2 = 2gh\ln(h_0/h)` : String.raw`\dot{h}^2 = \frac{2gh}{\beta - 1}\left[1 - \left(\frac{h}{h_0}\right)^{\beta - 1}\right], \quad t_T = ${f(tT, 3)}\,\text{s}`,
        },
      ],
      d: [
        {
          title: "Active Grid Point Evaluation",
          explanation: `At $A/A_0 = ${f(R, 0)}$, $h_0/\\sqrt{A} = ${f(rH, 0)}$ ($h_0 = ${f(h0, 2)}\\,\\text{m}$), dimensionless ideal draining ratio is ${f(sim?.t_ideal_ratio ?? 1, 4)}:`,
          equation_tex: `\\frac{t_{\\text{visc}}}{t_T} = ${f(tdRatioVisc, 4)}, \\qquad \\left|\\frac{t_{\\text{visc}}-t_T}{t_T}\\right| = ${f(pctErr, 2)}\\%`,
        },
      ],
      e: [
        {
          title: "Viscous Dissipation & Accuracy Limits",
          explanation: `With $\\mu = ${v.mu}\\,\\text{Pa}\\cdot\\text{s}$, tank-wall Darcy friction ($f_t = \\max(64/\\mathrm{Re}_t, 0.3164\\,\\mathrm{Re}_t^{-0.25})$) and orifice laminar loss ($64/\\mathrm{Re}_0$) increase draining time by $${f(pctErr, 2)}\\%$ over Torricelli:`,
          equation_tex: String.raw`-h\ddot{h} + \frac{1}{2}\dot{h}^2(\beta) + \frac{32\nu h}{D^2}|\dot{h}| + \frac{32\nu}{D_0}\frac{A}{A_0}|\dot{h}| = gh`,
        },
      ],
      f: [
        {
          title: "Real Physical Discrepancy Mechanisms",
          explanation: "Even viscous 1D models diverge from lab drain tests because: (1) Vena contracta $C_c \\approx 0.62$ shrinks effective exit area, lengthening $t_{\\text{drain}}$ ~60%; (2) entrance loss $C_v < 1$; (3) initial startup inertia; (4) bathtub vortex air core; (5) capillary pinch-off at small $D_0$.",
          equation_tex: String.raw`A_{\text{eff}} = C_c A_0 \; (C_c \approx 0.62) \implies t_{\text{real}} \sim \frac{t_T}{C_d}`,
        },
      ],
    };
  }

  if (hwId === "hw4") {
    const thRad = (v.theta_deg * Math.PI) / 180;
    const tanT = Math.tan(thRad);
    const rb = v.R_top - v.h0 * tanT;
    const validCone = rb > 0.001;
    const rbSafe = Math.max(0.001, rb);
    const teCyl = ((Math.PI * v.R_top * v.R_top) / (v.Cd * v.Ae)) * Math.sqrt((2 * v.h0) / 9.81);
    const teCone = ((Math.PI * Math.sqrt(2 * v.h0)) / (v.Cd * v.Ae * Math.sqrt(9.81))) * (rbSafe * rbSafe + (2 / 3) * rbSafe * v.h0 * tanT + 0.2 * v.h0 * v.h0 * tanT * tanT);
    const V_sph = (4 / 3) * Math.PI * Math.pow(v.R_sphere, 3);
    const tau = V_sph / Math.max(v.k_exhaust, 1e-6);

    return {
      "4.1a": [
        {
          title: "Conical Frustum Geometry $r(h)$ & $A(h)$",
          explanation: `Base radius $r_b = R - h_0\\tan\\theta = ${f(rb, 4)}\\,\\text{m}$ ${!validCone ? "(clamped at 0 for full inverted cone limit)" : ""}:`,
          equation_tex: `A(h) = \\pi(r_b + h\\tan\\theta)^2 = \\pi(${f(rbSafe, 3)} + ${f(tanT, 3)}\\,h)^2`,
        },
      ],
      "4.1b": [
        {
          title: "Nonlinear Draining Differential Equation",
          explanation: "Equating liquid volume depletion rate $A(h)\\,dh/dt$ to Torricelli outflow $-C_d A_e\\sqrt{2gh}$:",
          equation_tex: String.raw`\frac{\mathrm{d}h}{\mathrm{d}t} = -\frac{C_d A_e \sqrt{2g}}{\pi(r_b + h\tan\theta)^2}\,h^{1/2}`,
        },
      ],
      "4.1c": [
        {
          title: "Exact Emptying Time & Limiting Checks",
          explanation: `Integrating $h=h_0 \\to 0$ gives $t_e = ${f(teCone, 2)}\\,\\text{s}$ vs cylindrical benchmark $t_{e,\\text{cyl}} = ${f(teCyl, 2)}\\,\\text{s}$ (ratio $${f(teCone / teCyl, 3)}$; full cone limit $= 0.200$):`,
          equation_tex: String.raw`t_e = \frac{\pi\sqrt{2h_0}}{C_d A_e\sqrt{g}}\!\left(r_b^2 + \frac{2}{3}r_b h_0\tan\theta + \frac{1}{5}h_0^2\tan^2\theta\right) = ${f(teCone, 2)}\,\text{s}`,
        },
      ],
      "4.1d": [
        {
          title: "Dependence on $A_e$, $\\theta$, and $h_0$",
          explanation: "Emptying scales strictly as $t_e \\propto A_e^{-1}$ and $t_e \\propto h_0^{1/2}$ (cylinder) up to $h_0^{5/2}$ (cone). At fixed top radius $R$, widening upward ($\\theta > 0$) removes bottom volume and speeds draining.",
          equation_tex: `t_e / t_{e,\\text{cyl}} = ${f(teCone / teCyl, 3)} \\quad (\\text{at } \\theta = ${f(v.theta_deg, 1)}^\\circ)`,
        },
      ],
      "4.1e": [
        {
          title: "Unsteady Bernoulli Inertia Closure (No Torricelli)",
          explanation: `With loss coefficient $K_L = ${f(v.KL, 2)}$, internal continuity $v_z = (A(h)/A(z))\\dot{h}$ closes the unsteady momentum balance cleanly:`,
          equation_tex: String.raw`-\frac{r(h)}{r_b}h\ddot{h} + \left[\frac{1}{2}\!\left(\frac{A(h)}{A_e}\right)^2(1+K_L) - \frac{1}{2} - \frac{2h\tan\theta}{r_b}\right]\dot{h}^2 - gh = 0`,
        },
      ],
      "4.2a": [
        {
          title: "Integral Mass Balance on Fixed Sphere",
          explanation: `Volume $\\mathcal{V} = \\frac{4}{3}\\pi R^3 = ${f(V_sph, 4)}\\,\\text{m}^3$ with $\\dot{m}_e = k\\rho$ ($k = ${f(v.k_exhaust, 3)}\\,\\text{m}^3/\\text{s}$):`,
          equation_tex: String.raw`\frac{\mathrm{d}\rho}{\mathrm{d}t} + \frac{3k}{4\pi R^3}\rho = 0`,
        },
      ],
      "4.2b": [
        {
          title: "Exponential Density Decay",
          explanation: `Integrating from $\\rho(0) = ${f(v.rho0, 2)}\\,\\text{kg/m}^3$:`,
          equation_tex: `\\rho(t) = ${f(v.rho0, 2)}\\,\\exp\\!\\left(-\\frac{t}{${f(tau, 2)}}\\right)\\,\\text{kg/m}^3`,
        },
      ],
      "4.2c": [
        {
          title: "Characteristic Residence Timescale $\\tau$",
          explanation: "Time required for density to drop to $e^{-1} \\approx 36.79\\%$ of $\\rho_0$:",
          equation_tex: `\\tau = \\frac{\\mathcal{V}}{k} = \\frac{4\\pi (${f(v.R_sphere, 2)})^3}{3(${f(v.k_exhaust, 3)})} = ${f(tau, 2)}\\,\\text{s}`,
        },
      ],
      "4.2d": [
        {
          title: "Depressurization Milestone Times",
          explanation: `Half-life $t_{50\\%} = ${f(tau * Math.LN2, 2)}\\,\\text{s}$, decade $t_{10\\%} = ${f(tau * Math.LN10, 2)}\\,\\text{s}$, 99% evacuated at $${f(tau * Math.log(100), 2)}\\,\\text{s}$:`,
          equation_tex: `t_{99\\%}=${f(tau * Math.log(100 / 99), 3)}\\text{s}, \\; t_{50\\%}=${f(tau * Math.LN2, 2)}\\text{s}, \\; t_{10\\%}=${f(tau * Math.LN10, 2)}\\text{s}, \\; t_{1\\%}=${f(tau * Math.log(100), 2)}\\text{s}`,
        },
      ],
      "4.2e": [
        {
          title: "Breakdown of Uniform-Density Model in Rapid Venting",
          explanation: "Assumes acoustic time $t_a \\sim R/c \\ll \\tau$ and low Mach $M_{\\text{int}} \\ll 1$. Rapid valve opening ($\\tau \\lesssim R/c$) spawns rarefaction waves, adiabatic cooling gradients, and choked sonic outflow $\\dot{m}_e \\propto \\rho^{(\\gamma+1)/2}$.",
          equation_tex: String.raw`t_a \sim \frac{R}{c} \ll \tau, \qquad \text{Choked } M_e=1 \implies \dot{m}_e \propto \rho c \not\propto \rho`,
        },
      ],
    };
  }

  if (hwId === "hw5") {
    const { kappa, R1, omega1, mu, rho, L_cyl } = v;
    const R2 = kappa * R1;
    const eps = kappa - 1;
    const denom = kappa * kappa - 1;
    const vWall = omega1 * R1;
    const tauInner = (2 * mu * omega1 * kappa * kappa) / denom;
    const tauOuter = (2 * mu * omega1) / denom;
    const T_const = (4 * Math.PI * mu * L_cyl * omega1 * R1 * R1 * R2 * R2) / (R2 * R2 - R1 * R1);
    const dP_norm = sim?.dp_norm_max ?? 0;
    const dP_Pa = dP_norm * 0.5 * rho * vWall * vWall;

    return {
      a: [
        {
          title: "Cylindrical Azimuthal Momentum & Pressure",
          explanation: `Integrating $\\frac{\\mathrm{d}}{\\mathrm{d}r}[\\frac{1}{r}\\frac{\\mathrm{d}(r u_\\theta)}{\\mathrm{d}r}] = 0$ with $u_\\theta(R_1)=${f(vWall, 3)}\\,\\text{m/s}$, $u_\\theta(R_2)=0$ ($\\kappa=${f(kappa, 2)}$):`,
          equation_tex: String.raw`u_\theta(r) = \frac{\Omega_1 R_1}{\kappa^2 - 1}\left(\frac{\kappa^2}{r/R_1} - \frac{r}{R_1}\right), \qquad \frac{\mathrm{d}p}{\mathrm{d}r} = \rho\frac{u_\theta^2}{r} \implies \Delta p_{\text{gap}} = ${f(dP_Pa, 1)}\,\text{Pa}`,
        },
      ],
      b: [
        {
          title: "Narrow-Gap vs Wide-Gap Asymptotic Limits",
          explanation: `Active normalized pressure rise across gap $\\Delta p^* = ${f(dP_norm, 3)}$ (approaches $0$ linearly as $\\kappa\\to 1^+$, and saturates at $1.000$ as $\\kappa \\to \\infty$):`,
          equation_tex: String.raw`\kappa \to 1^+: \frac{u_\theta}{\Omega_1 R_1} \to 1-\xi, \quad \Delta p^* \to \frac{2}{3}\epsilon; \qquad \kappa \to \infty: u_\theta \to \frac{\Omega_1 R_1^2}{r}, \quad \Delta p^* \to 1`,
        },
      ],
      c: [
        {
          title: "Planar Couette Approximation Regime ($\\epsilon \\ll 1$)",
          explanation: `Here $\\epsilon = h/R_1 = ${f(eps, 3)}$. Curvature deviation from planar Couette scales as $\\approx \\frac{\\epsilon}{2}\\xi$ (~$${f(eps * 25, 1)}\\%$ max midpoint deviation):`,
          equation_tex: String.raw`\frac{u_\theta}{\Omega_1 R_1} = (1 - \xi)\left[1 - \frac{\epsilon}{2}\xi + O(\epsilon^2)\right]`,
        },
      ],
      d: [
        {
          title: "Azimuthal Shear Stress & Constant Torque $T$",
          explanation: `Inner wall shear $|\\tau_{r\\theta}(R_1)| = ${f(tauInner, 3)}\\,\\text{Pa}$ drops outward to $|\\tau_{r\\theta}(R_2)| = ${f(tauOuter, 3)}\\,\\text{Pa}$, keeping transmitted torque strictly constant at $${f(T_const, 4)}\\,\\text{N}\\cdot\\text{m}$:`,
          equation_tex: `|\\tau_{r\\theta}(r)| = \\frac{2\\mu\\Omega_1 R_1^2 R_2^2}{(R_2^2-R_1^2)\\,r^2}, \\qquad T(r) = 2\\pi r^2 L |\\tau_{r\\theta}| = ${f(T_const, 4)}\\,\\text{N}\\cdot\\text{m}`,
        },
      ],
      e: [
        {
          title: "How Nonzero Shear Produces Zero Azimuthal Force",
          explanation: "Curved outer faces have larger arc length ($\\propto r$) while shear decays faster ($\\propto r^{-2}$), and rotating basis vectors contribute metric stress $\\tau_{r\\theta}/r$, canceling identically:",
          equation_tex: String.raw`f_{\text{visc},\theta} = \frac{1}{r^2}\frac{\mathrm{d}}{\mathrm{d}r}\!\left(r^2\tau_{r\theta}\right) = \frac{1}{r^2}\frac{\mathrm{d}}{\mathrm{d}r}(-2\mu C_2) \equiv 0`,
        },
      ],
      f: [
        {
          title: "Global Angular Momentum vs. Local Shear Decay",
          explanation: "Steady angular momentum balance constrains integrated torque flux $T(r_b) - T(r_a) = 0$; local stress $\\tau_{r\\theta}$ MUST decay as $r^{-2}$ so growing area ($\\propto r$) and lever arm ($\\propto r$) keep $T$ constant.",
          equation_tex: String.raw`T(r) = (2\pi r L) \cdot r \cdot |\tau_{r\theta}(r)| = \text{const} \implies |\tau_{r\theta}| \propto r^{-2}`,
        },
      ],
    };
  }

  if (hwId === "hw6") {
    const alpha = v.alpha;
    const wMax = sim?.w_center ?? 0.2947;
    const ppDev = sim?.dev_pct ?? 41.06;
    const nTerms = Math.round(v.n_terms);
    return {
      a: [
        {
          title: "Laplace Reduction via Plane-Poiseuille Split",
          explanation: "Defining $G = -\\frac{1}{\\mu}\\frac{\\mathrm{d}p}{\\mathrm{d}z} = " + f(v.G_norm, 2) + "$ and $w(x,y) = w_p(y) + w_h(x,y)$ removes the source term:",
          equation_tex: String.raw`w_p(y)=\frac{G}{2}(b^2-y^2), \qquad \nabla^2 w_h = 0, \qquad w_h(\pm a,y) = -\frac{G}{2}(b^2-y^2)`,
        },
      ],
      b: [
        {
          title: "Three Separation Constant Cases ($C = +\\lambda^2, -\\lambda^2, 0$)",
          explanation: "Separating $w_h = X(x)Y(y)$ yields $X''/X = -Y''/Y = C$: $C=+\\lambda^2$ gives $\\cosh(\\lambda x)\\cos(\\lambda y)$; $C=-\\lambda^2$ gives $\\cos(\\lambda x)\\cosh(\\lambda y)$; $C=0$ gives bilinear polynomials.",
          equation_tex: String.raw`\frac{X''}{X} = -\frac{Y''}{Y} = C \quad (\lambda > 0)`,
        },
      ],
      c: [
        {
          title: "Admissibility & Equivalence of Dual Bases",
          explanation: "Enforcing $Y(\\pm b)=0$ eliminates $C=0$ and $C=-\\lambda^2$ ($\\cosh>0$), leaving eigenvalues $\\lambda_n = \\frac{(2n-1)\\pi}{2b}$. Splitting via $w_p(x)$ flips the sign to $C=-\\mu_n^2$—yielding the identical flow by Dirichlet uniqueness.",
          equation_tex: String.raw`\cos(\lambda_n b)=0 \implies \lambda_n = \frac{(2n-1)\pi}{2b}, \quad n=1,2,3,\dots`,
        },
      ],
      d: [
        {
          title: "Complete Uniformly Convergent Fourier Series ($N=" + nTerms + "$)",
          explanation: "Matching $w_h(\\pm a, y) = -w_p(y)$ by orthogonality gives coefficients decaying as $(2n-1)^{-3}$, converging exponentially for $|X|<1$:",
          equation_tex: String.raw`W(X,Y;\alpha) = \frac{1-Y^2}{2} - \frac{16}{\pi^3}\sum_{n=1}^{N}\frac{(-1)^{n-1}}{(2n-1)^3}\frac{\cosh(\frac{(2n-1)\pi}{2}\alpha X)}{\cosh(\frac{(2n-1)\pi}{2}\alpha)}\cos\!\left(\frac{(2n-1)\pi}{2}Y\right)`,
        },
      ],
      e: [
        {
          title: "Normalized Peak Speed & Aspect Ratio $\\alpha = " + f(alpha, 2) + "$",
          explanation: `Using narrow-gap normalization $W^* = w/[G\\min(a,b)^2]$ preserves scale across thin ducts (plane Poiseuille $=0.500$). Current center maximum:`,
          equation_tex: `W^*(0,0) = ${f(wMax, 4)} \\quad (${f(ppDev, 2)}\\%\\text{ below Plane Poiseuille } 0.5000)`,
        },
      ],
      f: [
        {
          title: "Exponential Approach to Plane-Poiseuille Limit",
          explanation: `For $|X|<1$, each mode decays as $\\sim \\exp(-\\frac{\\pi}{2}\\alpha(1-|X|))$. Once $\\alpha \\gtrsim 3$, the core recovers Poiseuille within $<1\\%$ (current deviation: $${f(ppDev, 2)}\\%$):`,
          equation_tex: String.raw`\frac{\cosh(\lambda_n\alpha X)}{\cosh(\lambda_n\alpha)} \sim \exp\!\left(-\frac{(2n-1)\pi}{2}\alpha(1-|X|)\right) \xrightarrow{\alpha\to\infty} 0`,
        },
      ],
      g: [
        {
          title: "Physical Interpretation (Sidewall Penetration Depth)",
          explanation: "Walls impose zero slip across all four faces; viscous drag diffuses over penetration length $\\sim \\min(a,b)$. Square ducts ($\\alpha=1$) maximize 2D sidewall retardation ($41.06\\%$ drop).",
          equation_tex: String.raw`\text{Sidewall boundary layer thickness } \sim \min(a, b)`,
        },
      ],
    };
  }

  // HW 7 Stokes' First Problem
  const { U, nu_e6, t_cur, H_mm, bounded } = v;
  const nu = nu_e6 * 1e-6;
  const H = H_mm * 1e-3;
  const tauDiff = nu * t_cur / (H * H);
  const delta99 = 3.6428 * Math.sqrt(nu * t_cur) * 1000; // in mm
  const sigmaMM = Math.sqrt(2 * nu * t_cur) * 1000;
  return {
    a: [
      {
        title: "Similarity Reduction via Diffusion Length $\\sqrt{\\nu t}$",
        explanation: "Without an intrinsic wall spacing, $\\eta = y/(2\\sqrt{\\nu t})$ collapses the parabolic heat/momentum PDE into an exact 2nd-order ODE:",
        equation_tex: String.raw`f''(\eta) + 2\eta f'(\eta) = 0, \qquad f(0)=1,\; f(\infty)=0`,
      },
    ],
    b: [
      {
        title: "Complementary Error Function Form",
        explanation: "Integrating $f'(\\eta) = -(2/\\sqrt{\\pi})e^{-\\eta^2}$ gives the exact similarity solution. Note $\\eta^2 = (y^2/4\\nu)/t$ compares local diffusion time to $t$:",
        equation_tex: String.raw`\frac{u(y,t)}{U} = 1 - \mathrm{erf}\!\left(\frac{y}{2\sqrt{\nu t}}\right) = \mathrm{erfc}(\eta)`,
      },
    ],
    c: [
      {
        title: "Transient Smoothing at $t = " + f(t_cur, 1) + "\\,\\text{s}$",
        explanation: `At $\\nu = ${f(nu_e6, 1)}\\times 10^{-6}\\,\\text{m}^2/\\text{s}$ and $U=${f(U, 2)}\\,\\text{m/s}$, wall shear decays cleanly as $t^{-1/2}$ as viscosity smooths the $t=0^+$ discontinuity:`,
        equation_tex: `2\\sqrt{\\nu t} = ${f(2 * Math.sqrt(nu * t_cur) * 1000, 2)}\\,\\text{mm}, \\qquad \\tau_w(t) = \\frac{\\mu U}{\\sqrt{\\pi \\nu t}}`,
      },
    ],
    d: [
      {
        title: "Local Convergence vs. Global Non-Equilibrium",
        explanation: "At any fixed $y$, $u(y,t)/U \\approx 1 - y/\\sqrt{\\pi\\nu t} \\to 1$ slowly ($t^{-1/2}$). Globally, $\\partial u/\\partial t > 0$ everywhere for all $t < \\infty$; momentum forever marches outward.",
        equation_tex: String.raw`\frac{\partial u}{\partial t} = \frac{Uy}{2\sqrt{\pi\nu t^3}}e^{-y^2/(4\nu t)} > 0 \quad \forall\, t < \infty`,
      },
    ],
    e: [
      {
        title: bounded
          ? `Bounded Wall Active (H = ${f(H_mm, 1)} mm, νt/H² = ${f(tauDiff, 3)})`
          : "Effect of Adding a Stationary Upper Wall at $y = H$",
        explanation: `With finite gap $H = ${f(H_mm, 1)}\\,\\text{mm}$, dimensionless Fourier time is $\\nu t/H^2 = ${f(tauDiff, 3)}$ (${tauDiff >= 0.45 ? "within <1% of steady Couette!" : "transient diffusion approaching Couette"}). Steady state recovers planar Couette:`,
        equation_tex: String.raw`\frac{u(y,t)}{U} = \left(1 - \frac{y}{H}\right) - \frac{2}{\pi}\sum_{n=1}^{\infty}\frac{1}{n}\sin\!\left(\frac{n\pi y}{H}\right)e^{-n^2\pi^2(\nu t/H^2)} \;\xrightarrow{t\to\infty}\; U\left(1-\frac{y}{H}\right)`,
      },
    ],
    f: [
      {
        title: "99% Penetration Depth & Vorticity Sheet Conservation",
        explanation: `Impulsive plate motion injects a vortex sheet of conserved strength $\\int_0^\\infty \\omega_z\\,dy = U$. Gaussian diffusion spreads it to depth $\\delta_{99} = ${f(delta99, 2)}\\,\\text{mm}$ ($\\sigma = ${f(sigmaMM, 2)}\\,\\text{mm}$):`,
        equation_tex: `\\delta_{99}(t) = 3.643\\sqrt{\\nu t} = ${f(delta99, 2)}\\,\\text{mm}, \\qquad \\omega_z(y,t) = \\frac{U}{\\sqrt{\\pi\\nu t}}e^{-y^2/(4\\nu t)}`,
      },
    ],
  };
}
