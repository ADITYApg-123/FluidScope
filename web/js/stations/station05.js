/**
 * Station 05: Anti-Spoiler 12-Twist Concept Quiz & LocalStorage Mastery Persistence.
 * Enforces strict Predict-First protocol (no shortcut/assumption leaks pre-submit),
 * numbered 01-12 pill navigation, live schematic previews, and post-submit equation audit + coach.
 */
import { displaySolvedFamily } from "./scene_mapper.js";
import { persistQuizScore, loadQuizScores, resetQuizScores } from "../core/store.js";
import { setEquationStripLocked } from "../core/equation_strip.js";
import { fmtNum } from "../core/color_scales.js";

const ENDPOINT_TO_FAMILY = {
  "/api/kinematics": "kinematics_equation",
  "/api/vortex": "vortex_flow",
  "/api/vessel": "rotating_vessel",
  "/api/potential": "potential_superposition",
  "/api/falkner_skan": "falkner_skan",
  "/api/accel_tank": "accelerating_tank",
  "/api/two_layer": "two_layer_poiseuille",
  "/api/couette_poiseuille": "couette_poiseuille",
  "/api/bl_separation": "bl_separation",
  "/api/slip_hb": "slip_herschel_bulkley",
  "/api/sudden_expansion": "sudden_expansion",
  "/api/hydraulic_jump": "hydraulic_jump",
  "/api/lbm_tunnel": "lbm_tunnel",
};

const FAMILY_TO_EQ_CONTEXT = {
  kinematics_equation: "ns_x",
  vortex_flow: "radial_euler",
  rotating_vessel: "ns_x",
  potential_superposition: "ns_x",
  accelerating_tank: "frame_g_eff",
  two_layer_poiseuille: "ns_x",
  couette_poiseuille: "ns_x",
  bl_separation: "boundary_layer",
  falkner_skan: "boundary_layer",
  slip_herschel_bulkley: "ns_x",
  sudden_expansion: "specific_force",
  hydraulic_jump: "specific_force",
  lbm_tunnel: "ns_x",
};

const AUDIT_LOCKED_TEXT = "Submit your prediction to unlock the Governing Equation Audit";

let activeEpoch = 0;

function esc(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function circleRingPts(radius, steps = 64) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const th = (i / steps) * Math.PI * 2;
    pts.push([radius * Math.cos(th), radius * Math.sin(th)]);
  }
  return pts;
}

function syncQuizParamsToLab(state, prob) {
  const pl = prob.payload || {};
  if (prob.station === "02") {
    if (prob.mode === "kinematics" && state.kinParams) {
      Object.assign(state.kinParams, {
        u_str: pl.u_str ?? state.kinParams.u_str,
        v_str: pl.v_str ?? state.kinParams.v_str,
        x0: pl.x0 ?? 1.0,
        y0: pl.y0 ?? 0.0,
        t0: pl.t0 ?? pl.params?.t0 ?? 1.0,
        t_eval: pl.t_eval ?? 2.0,
        v0: pl.v0 ?? pl.params?.v0 ?? 1.0,
      });
    } else if (prob.mode === "vortex" && state.vortexParams) {
      Object.assign(state.vortexParams, {
        mode: pl.mode ?? "forced",
        strength_c: pl.strength_c ?? state.vortexParams.strength_c,
        omega: pl.omega ?? state.vortexParams.omega,
        core_radius: pl.core_radius ?? state.vortexParams.core_radius,
        r1: pl.r1 ?? 0.15,
        r2: pl.r2 ?? 0.45,
        r_max: pl.r_max ?? 0.60,
      });
    } else if (prob.mode === "vessel" && state.vesselParams) {
      Object.assign(state.vesselParams, {
        radius: pl.radius ?? 0.3,
        vessel_height: pl.vessel_height ?? 0.503,
        initial_depth: pl.initial_depth ?? 0.503,
        rpm: pl.rpm ?? 130,
      });
    }
  } else if (prob.station === "03" && state.s3) {
    if (prob.mode === "twolayer") {
      Object.assign(state.s3, {
        mu1: pl.mu1 ?? 0.005,
        mu2: pl.mu2 ?? 0.001,
        dp_dx: pl.dp_dx ?? -1000,
      });
    } else if (prob.mode === "couette") {
      state.s3.P_cp = pl.P ?? -3.0;
    } else if (prob.mode === "separation") {
      state.s3.use_falkner_skan = false;
      state.s3.lambda_pg = pl.lambda_pg ?? -12.0;
    } else if (prob.mode === "slip_hb") {
      state.s3.n_hb = pl.n ?? 0.65;
      state.s3.tau_y = pl.tau_y ?? 2.5;
      state.s3.slip_mm = (pl.slip_length ?? 0.00025) * 1000;
    }
  } else if (prob.station === "04" && state.s4) {
    if (prob.mode === "tank") {
      state.s4.tankAx = pl.ax ?? 0.0;
      state.s4.tankAz = pl.az ?? -9.81;
    } else if (prob.mode === "expansion") {
      state.s4.expD1 = pl.D1 ?? 0.1;
      state.s4.expD2 = pl.D2 ?? 0.2;
      state.s4.expV1 = pl.V1 ?? 4.0;
    } else if (prob.mode === "jump") {
      const width = pl.width ?? 6.1;
      const v1 = pl.v1 ?? 6.1;
      const qUnit = (pl.discharge ?? 11.32) / width;
      state.s4.jumpWidth = width;
      state.s4.jumpV1 = v1;
      state.s4.jumpH1 = pl.h1 ?? qUnit / v1;
    }
  }
}

export function buildLabNavPayload(prob) {
  const fam = ENDPOINT_TO_FAMILY[prob.endpoint] || "kinematics_equation";
  const pl = prob.payload || {};
  const flatParams = {
    ...pl,
    ...(pl.params && typeof pl.params === "object" ? pl.params : {}),
  };
  return {
    twistId: prob.id,
    family: fam,
    params: flatParams,
    ...flatParams,
    broken_assumptions: [...(prob.broken_assumptions || [])],
  };
}

export function buildQuizParsedQuery(prob, assumptionsState) {
  const family = ENDPOINT_TO_FAMILY[prob.endpoint] || "kinematics_equation";
  const cleanAssumptions = {};
  for (const [k, v] of Object.entries(assumptionsState || {})) {
    cleanAssumptions[String(k)] = Boolean(v);
  }
  return {
    family,
    confidence: 1.0,
    parser_mode: "quiz_bank",
    assumptions: cleanAssumptions,
    params: { ...(prob.payload || {}) },
    obstacles: [],
    concept_twist: String(prob.options?.[prob.correct_index] || prob.title || ""),
    broken_shortcut: String(prob.tempting_shortcut || ""),
    textbook_ref: String(prob.book_ref || ""),
    unsupported_reason: null,
    raw_query: String(prob.prompt || ""),
  };
}

function applyRevealedAssumptions(state, prob, fam, data) {
  Object.assign(state.assumptions, {
    steady: true,
    incompressible: true,
    inviscid: true,
    irrotational: true,
    no_slip: true,
    newtonian: true,
    inertial_frame: true,
    adverse_pressure_gradient: false,
    irreversible_jump: false,
  });

  for (const k of prob.broken_assumptions || []) {
    state.assumptions[k] = k === "adverse_pressure_gradient" || k === "irreversible_jump";
  }

  if (fam === "kinematics_equation" && data?.classification) {
    state.assumptions.steady = Boolean(data.classification.steady);
    if (data.classification.incompressible !== undefined) {
      state.assumptions.incompressible = Boolean(data.classification.incompressible);
    }
    state.assumptions.irrotational = Boolean(data.classification.irrotational);
  }

  let irrotCause = state.assumptions.irrotational ? "Ωz = 0.000 s⁻¹" : "Ωz ≠ 0";
  let incompCause = "div = 0.000 s⁻¹";

  if (fam === "kinematics_equation" && data?.point_probe) {
    incompCause = `div = ${fmtNum(data.point_probe.divergence, 3)} s⁻¹`;
    irrotCause = `Ωz = ${fmtNum(data.point_probe.vorticity_z, 3)} s⁻¹`;
  } else if (fam === "vortex_flow") {
    irrotCause = state.assumptions.irrotational
      ? "Ωz = 0.000 s⁻¹ (r > 0)"
      : `Ωz = ${fmtNum(2 * (data?.omega ?? prob.payload?.omega ?? 0), 3)} s⁻¹`;
  } else if (fam === "rotating_vessel") {
    irrotCause = `Ωz = ${fmtNum(2 * (data?.omega ?? 0), 3)} s⁻¹`;
  }

  state.assumptionCauses = {
    steady: state.assumptions.steady ? "∂V/∂t = 0" : "∂V/∂t ≠ 0",
    incompressible: incompCause,
    irrotational: irrotCause,
  };
}

/**
 * Build a zero-spoiler geometry & parameter setup schematic for both canvases pre-submission.
 * Strictly renders given problem boundary/input parameters only — never shortcut or solution outputs.
 */
function buildProblemSchematic(prob) {
  const pl = prob.payload || {};
  const id = prob.id;

  if (id === "TWIST-01") {
    const x0 = pl.x0 ?? 1.0;
    const y0 = pl.y0 ?? 0.0;
    const t0 = pl.params?.t0 ?? 1.0;
    const v0 = pl.params?.v0 ?? 1.0;
    const ts = Array.from({ length: 21 }, (_, k) => 1.0 + k * 0.05);
    return {
      setupSummary: `u = x/(t + t₀), v = v₀ | Port (${x0}, ${y0}) | t₀ = ${t0} s, Eval t = ${pl.t_eval ?? 2} s`,
      primaryLegend: [
        { label: "Dye Port (x₀,y₀)", color: "#D55E00" },
        { label: "Velocity V(t₀)", color: "#0072B2" },
      ],
      secondaryTitle: "Given Time Factor 1/(t + t₀) — Trajectories Locked",
      secondaryLegend: [{ label: "u / x = 1/(t + t₀)", color: "#0072B2" }],
      scene: {
        bounds: [0, 3.2, -0.45, 2.15],
        aspectLock: true,
        xLabel: "x (m)",
        yLabel: "y (m)",
        field: null,
        seedPoint: [x0, y0],
        initialElement: [
          [0.85, 0.7],
          [1.25, 0.7],
          [1.25, 1.1],
          [0.85, 1.1],
        ],
        vectorsOverlay: [
          {
            x0,
            y0,
            dx: 0.42,
            dy: 0.55,
            color: "primary",
            label: `V(t₀) = (${(x0 / (2 * t0)).toFixed(1)}, ${v0.toFixed(1)}) m/s`,
          },
        ],
        annotations: [
          { x: 1.75, y: 1.75, text: "Setup: u = x/(t + t₀), v = v₀ (Inspect t₀ → 2t₀)", color: "primary" },
          { x: x0, y: -0.24, text: `Continuous Injector (${x0}, ${y0})`, color: "amber" },
        ],
        defaultHud: "Problem Setup Schematic — choose A–D to compare streamline, pathline, and streakline",
      },
      plot: {
        xLabel: "Time t (s)",
        yLabel: "Time coefficient 1/(t + t₀) (s⁻¹)",
        xShort: "t",
        bounds: { xmin: 0.9, xmax: 2.1, ymin: 0.25, ymax: 0.62 },
        series: [{ name: "1/(t + t₀)", x: ts, y: ts.map((t) => 1 / (t + t0)), color: "#0072B2" }],
        vMarkers: [
          { x: t0, label: `Inject t₀=${t0}s`, color: "#475569" },
          { x: 2 * t0, label: `Inspect t=${2 * t0}s`, color: "#D55E00" },
        ],
        annotations: [{ x: 1.5, y: 0.54, text: "Trajectories Hidden Until Check", color: "primary" }],
        defaultHud: "Given unsteady decay 1/(t + t₀) shown — submit prediction to plot all 3 curves",
      },
    };
  }

  if (id === "TWIST-02") {
    const r1 = pl.r1 ?? 0.15;
    const r2 = pl.r2 ?? 0.45;
    const c = pl.strength_c ?? 0.9;
    const rMax = pl.r_max ?? 0.55;
    const rs = Array.from({ length: 31 }, (_, k) => r1 + (k / 30) * (r2 - r1));
    return {
      setupSummary: `Horizontal 2D Bend (r₁ = ${r1} m, r₂ = ${r2} m) | Free Vortex vθ = C/r (C = ${c} m²/s)`,
      primaryLegend: [
        { label: `Inner Wall r₁ = ${r1} m`, color: "#475569" },
        { label: `Outer Wall r₂ = ${r2} m`, color: "#D55E00" },
      ],
      secondaryTitle: "Given Swirl Speed vθ(r) = C/r — Pressure Audit Locked",
      secondaryLegend: [{ label: "Swirl Speed vθ(r)", color: "#0072B2" }],
      scene: {
        bounds: [-rMax, rMax, -rMax, rMax],
        aspectLock: true,
        xLabel: "Radial x (m)",
        yLabel: "Radial y (m)",
        field: null,
        dashedGuides: [
          { pts: circleRingPts(r1), color: "#475569", width: 2.0, dash: [5, 4] },
          { pts: circleRingPts(r2), color: "#D55E00", width: 2.0, dash: [5, 4] },
        ],
        vectorsOverlay: [
          { x0: 0, y0: 0.30, dx: -0.20, dy: 0.0, color: "primary", label: "vθ(r) = C/r (3 m/s @ mid)" },
        ],
        annotations: [
          { x: 0, y: -r1 - 0.06, text: `Inner r₁ = ${r1} m`, color: "#475569" },
          { x: 0, y: -r2 - 0.06, text: `Outer r₂ = ${r2} m`, color: "amber" },
        ],
        defaultHud: "Bend geometry (r₁ = 0.15 m to r₂ = 0.45 m) — predict how Bernoulli compares to radial Euler",
      },
      plot: {
        xLabel: "Radius r (m)",
        yLabel: "Given tangential speed vθ (m/s)",
        xShort: "r",
        bounds: { xmin: 0.1, xmax: 0.5, ymin: 0, ymax: 7.0 },
        series: [{ name: "vθ = 0.9/r", x: rs, y: rs.map((r) => c / r), color: "#0072B2" }],
        vMarkers: [
          { x: r1, label: `r₁=${r1}`, color: "#475569" },
          { x: r2, label: `r₂=${r2}`, color: "#D55E00" },
        ],
        defaultHud: "Given speed vθ(r) shown — pressure & Bernoulli verdict unlock after Check",
      },
    };
  }

  if (id === "TWIST-03") {
    const om = pl.omega ?? 10.0;
    const r1 = pl.r1 ?? 0.10;
    const r2 = pl.r2 ?? 0.40;
    const rMax = pl.r_max ?? 0.50;
    const rs = Array.from({ length: 26 }, (_, k) => (k / 25) * rMax);
    return {
      setupSummary: `Impeller Forced Rotation vθ = ωr (ω = ${om} rad/s) between r₁ = ${r1} m and r₂ = ${r2} m`,
      primaryLegend: [
        { label: `r₁ = ${r1} m`, color: "#475569" },
        { label: `r₂ = ${r2} m`, color: "#D55E00" },
      ],
      secondaryTitle: "Given Impeller Speed vθ = ωr — Δp Comparison Locked",
      secondaryLegend: [{ label: "Swirl vθ = ωr", color: "#0072B2" }],
      scene: {
        bounds: [-rMax, rMax, -rMax, rMax],
        aspectLock: true,
        xLabel: "Radial x (m)",
        yLabel: "Radial y (m)",
        field: null,
        dashedGuides: [
          { pts: circleRingPts(r1), color: "#475569", width: 2.0, dash: [5, 4] },
          { pts: circleRingPts(r2), color: "#D55E00", width: 2.0, dash: [5, 4] },
        ],
        vectorsOverlay: [
          { x0: r2, y0: 0, dx: 0, dy: 0.18, color: "primary", label: `vθ(r) = ${om}r` },
        ],
        annotations: [
          { x: 0, y: 0.0, text: `ω = ${om} rad/s`, color: "primary" },
          { x: 0, y: -r2 - 0.06, text: `Probes: r₁=${r1} m, r₂=${r2} m`, color: "amber" },
        ],
        defaultHud: "Forced vortex impeller geometry — predict true Δp vs naive formula",
      },
      plot: {
        xLabel: "Radius r (m)",
        yLabel: "Given tangential speed vθ = ωr (m/s)",
        xShort: "r",
        bounds: { xmin: 0, xmax: rMax, ymin: 0, ymax: 6.0 },
        series: [{ name: "vθ = 10r", x: rs, y: rs.map((r) => om * r), color: "#0072B2" }],
        vMarkers: [
          { x: r1, label: `r₁=${r1}`, color: "#475569" },
          { x: r2, label: `r₂=${r2}`, color: "#D55E00" },
        ],
        defaultHud: "Given speed vθ = ωr shown — Δp comparison unlocks after Check",
      },
    };
  }

  if (id === "TWIST-04") {
    const R = pl.radius ?? 0.30;
    const H = pl.vessel_height ?? 0.503;
    const rpm = pl.rpm ?? 130.0;
    const wt = R * 0.06;
    return {
      setupSummary: `Open Cylinder D = ${(2 * R).toFixed(1)} m (R = ${R} m), Height H = ${H} m, Speed = ${rpm} RPM`,
      primaryLegend: [
        { label: "Initial Fill (Full to Rim H)", color: "#0072B2" },
        { label: "Cylinder Walls", color: "#475569" },
      ],
      secondaryTitle: "Initial Fill Boundary Geometry — Free Surface & Spill Locked",
      secondaryLegend: [{ label: "Rim Reference z = H", color: "#0072B2" }],
      scene: {
        bounds: [-R * 1.32, R * 1.32, -H * 0.14, H * 1.32],
        aspectLock: true,
        xLabel: "Radial coordinate r (m)",
        yLabel: "Vessel height z (m)",
        field: null,
        fluidPoly: [
          [-R, H],
          [R, H],
          [R, 0],
          [-R, 0],
        ],
        solidRects: [
          [-R - wt, -wt, wt, H * 1.15 + wt],
          [R, -wt, wt, H * 1.15 + wt],
          [-R - wt, -wt, 2 * (R + wt), wt],
        ],
        hLines: [{ y: H, color: "#475569", dashed: true, label: `Open Rim H = ${H} m` }],
        annotations: [
          { x: 0, y: H * 1.18, text: `Target Speed: ${rpm} RPM (D = 0.6 m)`, color: "primary" },
          { x: 0, y: H * 0.45, text: "Predict Spill & Dry Base Balance", color: "amber" },
        ],
        defaultHud: "Open rotating cylinder schematic — predict free-surface balance at 130 RPM",
      },
      plot: {
        xLabel: "Radial coordinate r (m)",
        yLabel: "Elevation z (m)",
        xShort: "r",
        bounds: { xmin: -R, xmax: R, ymin: 0, ymax: H * 1.3 },
        series: [{ name: "Initial Level z = H", x: [-R, 0, R], y: [H, H, H], color: "#0072B2" }],
        hMarkers: [{ y: 0, label: "Tank Base z = 0", color: "#475569" }],
        annotations: [{ x: 0, y: H * 0.35, text: "Paraboloid Profile Hidden Until Check", color: "primary" }],
        defaultHud: "Initial rim height z = 0.503 m shown — submit prediction to compute spill & dry radius",
      },
    };
  }

  if (id === "TWIST-05") {
    const om = pl.omega ?? 8.0;
    const rc = pl.core_radius ?? 0.25;
    const rMax = pl.r_max ?? 1.2;
    const vMax = om * rc;
    const rs = Array.from({ length: 49 }, (_, k) => (k / 48) * rMax);
    const vTheta = rs.map((r) => (r <= rc ? om * r : (vMax * rc) / Math.max(r, 1e-6)));
    return {
      setupSummary: `Rankine Vortex: Solid Core r ≤ Rc (${rc} m, ω = ${om} rad/s) + Free Outer Vortex (r > Rc)`,
      primaryLegend: [
        { label: `Core Boundary Rc = ${rc} m`, color: "#D55E00", dashed: true },
        { label: "Swirl Direction", color: "#0072B2" },
      ],
      secondaryTitle: "Given Rankine Swirl Profile vθ(r) — Surface Dip Δz Locked",
      secondaryLegend: [{ label: "Given vθ(r)", color: "#0072B2" }],
      scene: {
        bounds: [-rMax, rMax, -rMax, rMax],
        aspectLock: true,
        xLabel: "x (m)",
        yLabel: "y (m)",
        field: null,
        vortexCoreRadius: rc,
        vectorsOverlay: [
          { x0: rc, y0: 0, dx: 0, dy: 0.45, color: "primary", label: `v_max = ωRc = ${vMax.toFixed(1)} m/s` },
        ],
        annotations: [
          { x: 0, y: -rc - 0.14, text: `Rigid Core Rc = ${rc} m`, color: "amber" },
          { x: 0, y: 0.92, text: "Outer r > Rc: Free Vortex", color: "primary" },
        ],
        defaultHud: "Rankine core + outer vortex schematic — predict total surface dip at r = 0",
      },
      plot: {
        xLabel: "Radius r (m)",
        yLabel: "Given tangential speed vθ (m/s)",
        xShort: "r",
        bounds: { xmin: 0, xmax: rMax, ymin: 0, ymax: vMax * 1.25 },
        series: [{ name: "Rankine vθ(r)", x: rs, y: vTheta, color: "#0072B2" }],
        vMarkers: [{ x: rc, label: `Rc = ${rc} m`, color: "#D55E00" }],
        defaultHud: "Given Rankine velocity profile vθ(r) — surface dip curves unlock after Check",
      },
    };
  }

  if (id === "TWIST-06") {
    const h0 = pl.h0 ?? 0.50;
    const xs = [-0.5, 0.5];
    return {
      setupSummary: `Perforated Tank h₀ = ${h0} m, Bottom Orifice at z = 0, Released with az = -g`,
      primaryLegend: [
        { label: `Water Column h₀ = ${h0} m`, color: "#0072B2" },
        { label: "Frame Accel az = -g", color: "#B91C1C" },
      ],
      secondaryTitle: "Initial Fill Depth h₀ = 0.50 m — Orifice & Pressure Audit Locked",
      secondaryLegend: [{ label: "Rest Depth h₀ = 0.50 m", color: "#0072B2" }],
      scene: {
        bounds: [-0.85, 0.85, -0.35, 0.92],
        aspectLock: false,
        xLabel: "Horizontal tank coordinate x (m)",
        yLabel: "Vertical elevation z (m)",
        field: null,
        fluidPoly: [
          [-0.5, 0],
          [-0.5, h0],
          [0.5, h0],
          [0.5, 0],
        ],
        solidRects: [
          [-0.55, -0.05, 0.05, 0.85],
          [0.5, -0.05, 0.05, 0.85],
          [-0.55, -0.05, 0.50, 0.05],
          [0.05, -0.05, 0.50, 0.05],
        ],
        hLines: [{ y: h0, color: "#0072B2", dashed: true, label: `Initial Depth h₀ = ${h0} m` }],
        vectorsOverlay: [{ x0: 0.65, y0: 0.7, dx: 0, dy: -0.38, color: "coral", label: "Release: az = -g" }],
        annotations: [
          { x: 0, y: -0.17, text: "Bottom Orifice (z = 0) — Predict Efflux", color: "amber" },
        ],
        defaultHud: "Free-falling perforated tank setup — predict orifice response at az = -g",
      },
      plot: {
        xLabel: "Horizontal tank span x (m)",
        yLabel: "Fill depth h (m)",
        xShort: "x",
        bounds: { xmin: -0.5, xmax: 0.5, ymin: 0, ymax: 0.7 },
        series: [{ name: "Initial Depth h₀", x: xs, y: [h0, h0], color: "#0072B2" }],
        annotations: [{ x: 0, y: 0.24, text: "Effective g & p_base Hidden Until Check", color: "primary" }],
        defaultHud: "Initial column h₀ = 0.50 m shown — pressure curve unlocks after Check",
      },
    };
  }

  if (id === "TWIST-07") {
    const ys = [-1.0, -0.001, 0.001, 1.0];
    const mus = [5.0, 5.0, 1.0, 1.0];
    return {
      setupSummary: "Immiscible Layers Between y = ±H: μ₁ = 5 mPa·s (y < 0), μ₂ = 1 mPa·s (y > 0), dp/dx < 0",
      primaryLegend: [
        { label: "Interface y = 0", color: "#D55E00", dashed: true },
        { label: "Pressure Drive dp/dx < 0", color: "#0072B2" },
      ],
      secondaryTitle: "Given Layer Viscosity μ(y) — Velocity Profile Locked",
      secondaryLegend: [{ label: "Viscosity μ (mPa·s)", color: "#0072B2" }],
      scene: {
        bounds: [0, 2, -1.15, 1.15],
        aspectLock: false,
        xLabel: "Channel length x / H",
        yLabel: "Normalized gap y / H",
        field: null,
        solidRects: [
          [0, 1.0, 2.0, 0.14],
          [0, -1.14, 2.0, 0.14],
        ],
        hLines: [{ y: 0.0, color: "#D55E00", dashed: true, label: "Immiscible Interface y = 0" }],
        vectorsOverlay: [{ x0: 0.7, y0: 0.45, dx: 0.5, dy: 0, color: "primary", label: "dp/dx < 0" }],
        annotations: [
          { x: 1.0, y: 0.72, text: "Upper Fluid: μ₂ = 1 mPa·s", color: "primary" },
          { x: 1.0, y: -0.55, text: "Lower Fluid: μ₁ = 5 mPa·s", color: "amber" },
        ],
        defaultHud: "Two-layer channel geometry (μ₁ = 5 mPa·s, μ₂ = 1 mPa·s) — predict interface condition",
      },
      plot: {
        probeAxis: "y",
        xLabel: "Dynamic viscosity μ (mPa·s)",
        yLabel: "Normalized gap y / H",
        xShort: "μ",
        yShort: "y/H",
        bounds: { xmin: 0, xmax: 6.5, ymin: -1, ymax: 1 },
        series: [{ name: "Given μ(y)", x: mus, y: ys, color: "#0072B2" }],
        hMarkers: [{ y: 0.0, label: "Interface y = 0", color: "#D55E00" }],
        defaultHud: "Given viscosity step μ₁ = 5 vs μ₂ = 1 mPa·s — velocity profiles unlock after Check",
      },
    };
  }

  if (id === "TWIST-08") {
    return {
      setupSummary: "Upper Plate Speed +U vs. Stationary Lower Plate (y = 0) with Opposing Adverse Pressure Gradient",
      primaryLegend: [
        { label: "Moving Upper Plate (+U)", color: "#0072B2" },
        { label: "Opposing Pressure Drive", color: "#D55E00" },
      ],
      secondaryTitle: "Couette Boundary Drive Setup — Recirculation Threshold Locked",
      secondaryLegend: [{ label: "Boundary Linear Ref u/U = y/H", color: "#475569" }],
      scene: {
        bounds: [0, 2, -0.15, 1.15],
        aspectLock: false,
        xLabel: "Channel length x / H",
        yLabel: "Normalized gap y / H",
        field: null,
        solidRects: [
          [0, 1.0, 2.0, 0.12],
          [0, -0.12, 2.0, 0.12],
        ],
        vectorsOverlay: [
          { x0: 0.45, y0: 0.92, dx: 0.75, dy: 0, color: "primary", label: "Upper Wall Speed +U" },
          { x0: 1.35, y0: 0.45, dx: -0.55, dy: 0, color: "amber", label: "Opposing dp*/dx > 0" },
        ],
        annotations: [
          { x: 1.0, y: 0.16, text: "Stationary Lower Wall (u = 0) · Find P for Q = 0", color: "#475569" },
        ],
        defaultHud: "Couette-Poiseuille opposing pressure setup — predict parameter P for Q = 0",
      },
      plot: {
        probeAxis: "y",
        xLabel: "Dimensionless velocity reference u / U",
        yLabel: "Normalized gap y / H",
        xShort: "u/U",
        yShort: "y/H",
        bounds: { xmin: -0.6, xmax: 1.2, ymin: 0, ymax: 1 },
        series: [{ name: "Shear Wall B.C. (0 -> +U)", x: [0, 1], y: [0, 1], color: "#475569", dashed: true }],
        vMarkers: [{ x: 0, label: "u = 0", color: "#475569" }],
        annotations: [{ x: 0.15, y: 0.55, text: "Seek Net Q = ∫ u dy = 0", color: "primary" }],
        defaultHud: "Wall boundary values u(0)=0, u(H)=+U shown — recirculation curve unlocks after Check",
      },
    };
  }

  if (id === "TWIST-09") {
    const xs = Array.from({ length: 21 }, (_, k) => k / 20);
    return {
      setupSummary: "Viscous Boundary Layer Along Curved Wall Under Adverse Pressure Gradient (dp/dx > 0)",
      primaryLegend: [
        { label: "Freestream U∞", color: "#0072B2" },
        { label: "Adverse dp/dx > 0", color: "#D55E00" },
      ],
      secondaryTitle: "Adverse Pressure Setup (dp/dx > 0) — Wall Criterion Locked",
      secondaryLegend: [{ label: "Rising Pressure Cp(x)", color: "#D55E00" }],
      scene: {
        bounds: [0, 2, -0.15, 1.15],
        aspectLock: false,
        xLabel: "Streamwise coordinate x / δ",
        yLabel: "Wall-normal coordinate y / δ",
        field: null,
        solidRects: [[0, -0.15, 2.0, 0.15]],
        vectorsOverlay: [
          { x0: 0.35, y0: 0.85, dx: 0.75, dy: 0, color: "primary", label: "Freestream U∞" },
          { x0: 1.55, y0: 0.52, dx: -0.45, dy: 0, color: "amber", label: "Adverse dp/dx > 0" },
        ],
        annotations: [
          { x: 1.0, y: 0.18, text: "No-Slip Wall (u = 0 at y = 0)", color: "#475569" },
        ],
        defaultHud: "Boundary layer under adverse dp/dx > 0 — predict exact criterion for onset of separation",
      },
      plot: {
        xLabel: "Streamwise distance x / L",
        yLabel: "External pressure rise Cp(x)",
        xShort: "x/L",
        bounds: { xmin: 0, xmax: 1, ymin: -0.7, ymax: 0.5 },
        series: [{ name: "Adverse Cp Rise", x: xs, y: xs.map((x) => -0.5 + 0.85 * x), color: "#D55E00" }],
        annotations: [{ x: 0.5, y: -0.35, text: "Velocity Profile & Curvature Hidden Until Check", color: "primary" }],
        defaultHud: "Rising external Cp (dp/dx > 0) shown — profile & curvature unlock after Check",
      },
    };
  }

  if (id === "TWIST-10") {
    const tauY = pl.tau_y ?? 2.5;
    const lsMm = ((pl.slip_length ?? 0.00025) * 1000).toFixed(2);
    const ys = [-1.0, 0.0, 1.0];
    const taus = [8.0, 0.0, -8.0];
    return {
      setupSummary: `Yield Stress τ_y = ${tauY} Pa, Shear Index n = ${pl.n ?? 0.65}, Hydrophobic Slip l_s = ${lsMm} mm`,
      primaryLegend: [
        { label: `Hydrophobic Wall (l_s = ${lsMm} mm)`, color: "#0072B2" },
        { label: `Yield Threshold |τ| = ${tauY} Pa`, color: "#D55E00" },
      ],
      secondaryTitle: "Channel Shear Balance τ(y) vs. ±τ_y — Flow Profile Locked",
      secondaryLegend: [{ label: "Linear Shear τ(y)", color: "#0072B2" }],
      scene: {
        bounds: [0, 2, -1.15, 1.15],
        aspectLock: false,
        xLabel: "Channel length x / H",
        yLabel: "Normalized gap y / H",
        field: null,
        solidRects: [
          [0, 1.0, 2.0, 0.14],
          [0, -1.14, 2.0, 0.14],
        ],
        vectorsOverlay: [{ x0: 0.65, y0: 0, dx: 0.65, dy: 0, color: "primary", label: "dp/dx < 0" }],
        annotations: [
          { x: 1.0, y: 0.80, text: `Hydrophobic Slip Wall (l_s = ${lsMm} mm)`, color: "primary" },
          { x: 1.0, y: -0.45, text: `Paste: τ_y = ${tauY} Pa, n = ${pl.n ?? 0.65}`, color: "amber" },
        ],
        defaultHud: "Hydrophobic slit geometry with yield-stress paste — predict profile distortion",
      },
      plot: {
        probeAxis: "y",
        xLabel: "Channel shear stress τ (Pa)",
        yLabel: "Normalized gap y / H",
        xShort: "τ",
        yShort: "y/H",
        bounds: { xmin: -9.0, xmax: 9.0, ymin: -1, ymax: 1 },
        series: [{ name: "Shear τ(y)", x: taus, y: ys, color: "#0072B2" }],
        vMarkers: [
          { x: -tauY, label: `-τ_y = -${tauY}`, color: "#D55E00" },
          { x: tauY, label: `+τ_y = +${tauY}`, color: "#D55E00" },
        ],
        defaultHud: "Given linear stress balance τ(y) vs ±τ_y — velocity curve unlocks after Check",
      },
    };
  }

  if (id === "TWIST-11") {
    const D1 = pl.D1 ?? 0.10;
    const D2 = pl.D2 ?? 0.20;
    const V1 = pl.V1 ?? 4.0;
    const r1 = D1 * 0.5;
    const r2 = D2 * 0.5;
    return {
      setupSummary: `Abrupt Step D₁ = ${D1.toFixed(2)} m -> D₂ = ${D2.toFixed(2)} m at Inlet Speed V₁ = ${V1.toFixed(1)} m/s`,
      primaryLegend: [
        { label: "Pipe Geometry Step", color: "#475569" },
        { label: `Inlet V₁ = ${V1.toFixed(1)} m/s`, color: "#0072B2" },
      ],
      secondaryTitle: "Pipe Cross-Sectional Area Expansion Ratio A(x)/A₁ — Δp Locked",
      secondaryLegend: [{ label: "Area Ratio A(x)/A₁", color: "#0072B2" }],
      scene: {
        bounds: [-0.4, 0.8, -0.15, 0.15],
        aspectLock: false,
        xLabel: "Axial position x (m)",
        yLabel: "Radial pipe coordinate y (m)",
        field: null,
        fluidPoly: [
          [-0.4, r1],
          [0, r1],
          [0, r2],
          [0.8, r2],
          [0.8, -r2],
          [0, -r2],
          [0, -r1],
          [-0.4, -r1],
        ],
        wallPolys: [
          [
            [-0.4, r1],
            [0, r1],
            [0, r2],
            [0.8, r2],
            [0.8, r2 + 0.04],
            [-0.4, r2 + 0.04],
          ],
          [
            [-0.4, -r1],
            [0, -r1],
            [0, -r2],
            [0.8, -r2],
            [0.8, -r2 - 0.04],
            [-0.4, -r2 - 0.04],
          ],
        ],
        vectorsOverlay: [{ x0: -0.32, y0: 0, dx: 0.22, dy: 0, color: "primary", label: `V₁ = ${V1} m/s` }],
        annotations: [
          { x: -0.20, y: -r1 - 0.03, text: `D₁ = ${D1.toFixed(2)} m`, color: "#475569" },
          { x: 0.42, y: 0.0, text: `D₂ = ${D2.toFixed(2)} m · Δp = p₂ - p₁ = ?`, color: "amber" },
        ],
        defaultHud: "Sudden expansion geometry — predict static pressure recovery p₂ - p₁",
      },
      plot: {
        xLabel: "Axial position x (m)",
        yLabel: "Pipe area ratio A(x) / A₁",
        xShort: "x",
        bounds: { xmin: -0.4, xmax: 0.8, ymin: 0, ymax: 4.8 },
        series: [{ name: "Area Ratio A/A₁", x: [-0.4, -0.001, 0.001, 0.8], y: [1, 1, 4, 4], color: "#0072B2" }],
        vMarkers: [{ x: 0, label: "Abrupt Step x = 0", color: "#D55E00" }],
        defaultHud: "Area step ratio 1 -> 4 shown — pressure recovery curves unlock after Check",
      },
    };
  }

  // TWIST-12 default: Hydraulic Jump
  const width = pl.width ?? 6.1;
  const v1 = pl.v1 ?? 6.1;
  const discharge = pl.discharge ?? 11.32;
  const h1 = (discharge / width) / v1;
  return {
    setupSummary: `Apron Width W = ${width} m, Q = ${discharge} m³/s, Upstream V₁ = ${v1} m/s (h₁ ≈ ${h1.toFixed(3)} m)`,
    primaryLegend: [
      { label: `Inflow Sheet h₁ = ${h1.toFixed(3)} m`, color: "#0072B2" },
      { label: "Sluice Gate", color: "#475569" },
    ],
    secondaryTitle: "Given Upstream Depth h₁ — Subcritical Jump Depth h₂ Locked",
    secondaryLegend: [{ label: "Upstream Supercritical h₁", color: "#0072B2" }],
    scene: {
      bounds: [-0.8, 8.2, -0.35, 2.25],
      aspectLock: false,
      xLabel: "Apron streamwise distance x (m)",
      yLabel: "Water depth y (m)",
      field: null,
      fluidPoly: [
        [0, 0],
        [0, h1],
        [2.2, h1],
        [2.2, 0],
      ],
      solidRects: [
        [-0.35, h1 + 0.05, 0.45, 1.9],
        [-0.8, -0.3, 9.0, 0.3],
      ],
      vectorsOverlay: [{ x0: 0.4, y0: h1 * 0.55, dx: 1.0, dy: 0, color: "primary", label: `V₁ = ${v1} m/s (Fr₁ = 3.53)` }],
      annotations: [
        { x: 5.0, y: 0.95, text: `Q = ${discharge} m³/s, W = ${width} m -> Downstream h₂ = ?`, color: "amber" },
      ],
      defaultHud: "Sluice-gate inflow geometry (h₁ = 0.304 m, Fr₁ = 3.53) — predict downstream depth h₂",
    },
    plot: {
      xLabel: "Apron position x (m)",
      yLabel: "Flow depth h (m)",
      xShort: "x",
      bounds: { xmin: 0, xmax: 8.0, ymin: 0, ymax: 2.0 },
      series: [{ name: "Inflow Depth h₁", x: [0, 2.2], y: [h1, h1], color: "#0072B2" }],
      hMarkers: [{ y: h1, label: `Given h₁ = ${h1.toFixed(3)} m`, color: "#0072B2" }],
      annotations: [{ x: 5.1, y: 0.95, text: "Specific Energy / Conjugate Curves Hidden", color: "primary" }],
      defaultHud: "Inflow depth h₁ shown — energy/momentum comparison unlocks after Check",
    },
  };
}

export async function renderStation05(ctx, renderOpts = {}) {
  const {
    state,
    bus,
    apiPost,
    flowEngine,
    plotEngine,
    setLegend,
    setConceptBanner,
    clearSecondaryControls,
    renderRockers,
    refreshAudit,
    setDrawerMetrics,
    setDrawerCards,
    openLab,
  } = ctx;

  const myEpoch = ++activeEpoch;
  clearSecondaryControls();

  if (!state.s5) {
    state.s5 = {
      twists: null,
      activeIndex: 0,
      chosenIdx: null,
      checked: false,
      scores: loadQuizScores(),
      lastSolvedData: null,
    };
  } else {
    const persisted = loadQuizScores();
    if (Object.keys(persisted).length > 0 || !state.s5.scores) {
      state.s5.scores = persisted;
    }
  }

  if (!state.s5.twists) {
    const res = await fetch("/api/twists").then((r) => r.json());
    if (myEpoch !== activeEpoch) return;
    state.s5.twists = res.data || [];
  }

  const twists = state.s5.twists;
  if (!twists.length) return;

  if (state.s5.activeIndex < 0 || state.s5.activeIndex >= twists.length) {
    state.s5.activeIndex = 0;
  }

  const prob = twists[state.s5.activeIndex] || twists[0];
  const host = document.getElementById("bayControls");
  if (!host) return;

  const getMasteredCount = () =>
    twists.filter((t) => state.s5.scores?.[t.id] === true).length;

  host.innerHTML = `
    <section class="panel-bay quiz-panel-bay" aria-label="12-Twist Concept Quiz">
      <div class="quiz-mastery-bar">
        <span class="quiz-title">12-Twist Quiz Bank</span>
        <div class="quiz-mastery-controls">
          <span class="quiz-mastery-count tabular-nums" id="quizMasteryCount">Mastered ${getMasteredCount()} / ${twists.length}</span>
          <button type="button" class="btn-machined btn-xs quiz-reset-btn" id="btnResetQuizProgress" title="Clear persisted mastery scores">Reset Progress</button>
        </div>
      </div>
      <div class="quiz-pill-nav" id="quizPillNav" role="tablist" aria-label="Problems 01 to 12"></div>
      <div class="quiz-meta-row">
        <span class="quiz-id-label tabular-nums">${esc(prob.id)} &middot; Predict First</span>
        <span class="quiz-ref-tag tabular-nums">${esc(prob.book_ref)}</span>
      </div>
      <div class="quiz-prompt">${esc(prob.prompt)}</div>
      <div class="quiz-audit-locked-badge" id="quizAuditLockedBadge" role="status">
        <span aria-hidden="true">&#128274;</span>
        <span>${AUDIT_LOCKED_TEXT}</span>
      </div>
      <div class="quiz-question">${esc(prob.question)}</div>
      <div id="twistOpts" class="quiz-options-list" role="radiogroup" aria-label="Prediction options A to D"></div>
      <div id="twistFeedback" class="quiz-feedback"></div>
      <button type="button" class="btn-machined btn-primary quiz-btn-verify" id="btnVerifyTwist">Check Prediction &amp; Prove on Canvas</button>
    </section>
  `;

  const syncAuditLockedBadge = () => {
    const badge = document.getElementById("quizAuditLockedBadge");
    if (badge) {
      badge.classList.toggle("hidden", Boolean(state.s5.checked));
    }
  };

  const switchTwist = (nextIdx, fromKeyboard = false) => {
    if (nextIdx < 0 || nextIdx >= twists.length || nextIdx === state.s5.activeIndex) return;
    state.s5.activeIndex = nextIdx;
    state.s5.chosenIdx = null;
    state.s5.checked = false;
    state.s5.lastSolvedData = null;
    state.activeCoachContext = { parsedQuery: null, solverData: null, suggestedPrompt: "" };
    bus?.emit?.("coach:close");
    renderStation05(ctx, fromKeyboard ? { focusPillIndex: nextIdx } : {});
  };

  const renderMasteryNav = () => {
    const countEl = document.getElementById("quizMasteryCount");
    if (countEl) {
      countEl.textContent = `Mastered ${getMasteredCount()} / ${twists.length}`;
    }
    const navEl = document.getElementById("quizPillNav");
    if (!navEl) return;
    navEl.innerHTML = "";
    twists.forEach((t, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("role", "tab");
      btn.dataset.twistIndex = String(idx);
      const isActive = idx === state.s5.activeIndex;
      const scoreVal = state.s5.scores?.[t.id];
      const statusCls =
        scoreVal === true ? "mastered" : scoreVal === false ? "needs-review" : "";
      const mark =
        scoreVal === true ? "\u2713" : scoreVal === false ? "\u21BB" : "\u00B7";
      const statusNote =
        scoreVal === true
          ? "Mastered"
          : scoreVal === false
          ? "Attempted — needs review"
          : "Not yet attempted";

      btn.className = ["quiz-pill", statusCls, isActive ? "active" : ""]
        .filter(Boolean)
        .join(" ");
      btn.setAttribute("aria-selected", String(isActive));
      btn.setAttribute("tabindex", isActive ? "0" : "-1");
      btn.setAttribute("aria-label", `${t.id}: ${t.title} (${statusNote})`);
      btn.title = `${t.id}: ${t.title} — ${t.book_ref} (${statusNote})`;
      btn.innerHTML = `<span class="quiz-pill-num">${String(idx + 1).padStart(2, "0")}</span><span class="quiz-pill-mark" aria-hidden="true">${mark}</span>`;

      btn.onclick = () => switchTwist(idx, false);
      btn.onkeydown = (e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          switchTwist((idx + 1) % twists.length, true);
        } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          switchTwist((idx - 1 + twists.length) % twists.length, true);
        } else if (e.key === "Home") {
          e.preventDefault();
          switchTwist(0, true);
        } else if (e.key === "End") {
          e.preventDefault();
          switchTwist(twists.length - 1, true);
        }
      };
      navEl.appendChild(btn);
    });
  };

  const renderQuizOptions = () => {
    const optsBox = document.getElementById("twistOpts");
    if (!optsBox) return;
    optsBox.innerHTML = "";
    prob.options.forEach((optText, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("role", "radio");
      const selected = state.s5.chosenIdx === i;
      const isRight = state.s5.checked && i === prob.correct_index;
      const isWrongSel = state.s5.checked && selected && i !== prob.correct_index;

      let cls = "quiz-opt-btn";
      if (isRight) cls += " correct";
      else if (isWrongSel) cls += " wrong";
      else if (selected) cls += " selected";

      btn.className = cls;
      btn.disabled = Boolean(state.s5.checked);
      btn.setAttribute("aria-checked", String(selected));
      btn.textContent = `${String.fromCharCode(65 + i)}. ${optText}`;
      btn.onclick = () => {
        if (state.s5.checked) return;
        state.s5.chosenIdx = i;
        const fb = document.getElementById("twistFeedback");
        if (fb) fb.innerHTML = "";
        renderQuizOptions();
      };
      optsBox.appendChild(btn);
    });
  };

  const renderFeedbackBox = () => {
    const fb = document.getElementById("twistFeedback");
    if (!fb) return;
    if (!state.s5.checked) {
      fb.innerHTML = "";
      return;
    }

    const correct = state.s5.chosenIdx === prob.correct_index;
    const verdictHtml = correct
      ? `<div class="quiz-verdict-banner correct" role="status">
           <div class="quiz-verdict-title">Exact Physics! &#10003;</div>
           <div class="quiz-verdict-sub">Matches exact governing equations and live solver proof.</div>
         </div>`
      : `<div class="quiz-verdict-banner trap" role="status">
           <div class="quiz-verdict-title">Shortcut Trap Triggered!</div>
           <div class="quiz-verdict-sub">Option ${String.fromCharCode(65 + prob.correct_index)} matches the exact physics proof on the right.</div>
         </div>`;

    fb.innerHTML = `
      ${verdictHtml}
      <div class="quiz-shortcut-card">
        <div class="quiz-shortcut-label">Shortcut Trap Broken</div>
        <div class="quiz-shortcut-text">${esc(prob.tempting_shortcut)}</div>
      </div>
      <div class="quiz-actions-footer">
        <button type="button" class="btn-machined quiz-action-btn" id="btnExploreLiveLab">Explore in Live Lab &rarr;</button>
        <button type="button" class="btn-machined btn-primary quiz-action-coach" id="btnAskCoachQuiz">Ask Doubt Coach Why</button>
      </div>
    `;

    const labBtn = document.getElementById("btnExploreLiveLab");
    if (labBtn) {
      labBtn.onclick = () => {
        syncQuizParamsToLab(state, prob);
        const navPayload = buildLabNavPayload(prob);
        if (bus && typeof bus.emit === "function") {
          bus.emit("lab:navigate", {
            bay: prob.station,
            mode: prob.mode,
            payload: navPayload,
            autoSolve: true,
          });
        } else if (typeof openLab === "function") {
          openLab(prob.station, prob.mode);
        }
      };
    }

    const coachBtn = document.getElementById("btnAskCoachQuiz");
    if (coachBtn) {
      coachBtn.onclick = () => {
        const parsedQuery = buildQuizParsedQuery(prob, state.assumptions);
        const solverData = state.s5.lastSolvedData ?? null;
        const suggestedPrompt = `Why does "${prob.tempting_shortcut}" fail for ${prob.id} (${prob.book_ref})?`;
        state.activeCoachContext = { parsedQuery, solverData, suggestedPrompt };
        if (bus && typeof bus.emit === "function") {
          bus.emit("solver:updated", {
            bay: prob.station,
            sub: prob.mode,
            family: parsedQuery.family,
            payload: prob.payload,
            solverData,
            parsedQuery,
            suggestedPrompt,
          });
          bus.emit("coach:open", {
            parsedQuery,
            solverData,
            suggestedPrompt,
          });
        }
      };
    }
  };

  const showUnspoiledCanvas = () => {
    state.s5.checked = false;
    state.s5.lastSolvedData = null;
    state.activeCoachContext = { parsedQuery: null, solverData: null, suggestedPrompt: "" };

    flowEngine?.setInteractiveHandles?.([], null);
    flowEngine?.setDrawMode?.(null, null);

    setEquationStripLocked(AUDIT_LOCKED_TEXT);
    renderRockers?.();
    syncAuditLockedBadge();

    const warnBox = document.getElementById("assumptionWarnings");
    if (warnBox) warnBox.innerHTML = "";

    const schematic = buildProblemSchematic(prob);

    const pTitleEl = document.getElementById("primaryTitle");
    const sTitleEl = document.getElementById("secondaryTitle");
    if (pTitleEl) pTitleEl.textContent = `Schematic Setup \u00b7 ${prob.id}: ${prob.title}`;
    if (sTitleEl) sTitleEl.textContent = schematic.secondaryTitle;

    setLegend?.("primaryLegend", schematic.primaryLegend || []);
    setLegend?.("secondaryLegend", schematic.secondaryLegend || []);

    setConceptBanner?.(
      `<strong>${esc(prob.id)} \u2014 ${esc(prob.title)} (${esc(prob.book_ref)}):</strong> ${esc(prob.prompt)}`,
      `<strong>Predict First:</strong> Choose A\u2013D on the left and click Check Prediction to reveal the hidden shortcut trap &amp; exact solver curves.`,
      "insight"
    );

    flowEngine?.setScene?.(schematic.scene);
    plotEngine?.setPlot?.(schematic.plot);

    setDrawerMetrics?.([
      { k: "Problem", v: prob.id, color: "var(--accent)" },
      { k: "Reference", v: prob.book_ref, color: "var(--ink-secondary)" },
      { k: "Status", v: "Predict First (Locked)", color: "var(--amber)" },
    ]);
    setDrawerCards?.([
      { k: "Topic Reference", v: prob.book_ref },
      { k: "Given Problem Setup", v: schematic.setupSummary },
      {
        k: "Predict-First Protocol",
        v: "Select A\u2013D on the left and click 'Check Prediction & Prove on Canvas' to unlock the Governing Equation Audit, live solver fields, and the shortcut comparison.",
      },
    ]);
  };

  const solveTwist = async () => {
    try {
      const fam = ENDPOINT_TO_FAMILY[prob.endpoint] || "kinematics_equation";
      const data = await apiPost(prob.endpoint, prob.payload, "activeLab");

      if (myEpoch !== activeEpoch) return;
      const cur = twists[state.s5.activeIndex];
      if (!cur || cur.id !== prob.id || !state.s5.checked) return;

      state.s5.lastSolvedData = data;
      applyRevealedAssumptions(state, prob, fam, data);
      renderRockers?.();

      const eqCtx = FAMILY_TO_EQ_CONTEXT[fam] || "ns_x";
      if (typeof refreshAudit === "function") {
        await refreshAudit(eqCtx);
      }

      if (myEpoch !== activeEpoch || !state.s5.checked) return;

      displaySolvedFamily(
        fam,
        data,
        ctx,
        fam === "vortex_flow" && prob.payload?.mode === "rankine"
          ? { vortexCoreRadius: prob.payload.core_radius }
          : {}
      );

      setConceptBanner?.(
        `<strong>Verified Proof (${esc(prob.id)} \u00b7 ${esc(prob.book_ref)}):</strong> ${esc(prob.options[prob.correct_index])}`,
        `<strong>Shortcut Trap Broken:</strong> ${esc(prob.tempting_shortcut)}`,
        "trap"
      );

      const grid = document.querySelector("#drawerBody .diag-grid");
      if (grid) {
        grid.querySelectorAll("[data-quiz-diag]").forEach((el) => el.remove());
        const prependCard = (kTxt, vTxt, tone) => {
          const cell = document.createElement("div");
          cell.className = "diag-cell";
          cell.dataset.quizDiag = "1";
          const kEl = document.createElement("div");
          kEl.className = "diag-key";
          kEl.textContent = kTxt;
          const vEl = document.createElement("div");
          vEl.className = `diag-val ${tone || ""}`;
          vEl.textContent = vTxt;
          cell.appendChild(kEl);
          cell.appendChild(vEl);
          grid.prepend(cell);
        };
        prependCard("Tempting Exam Shortcut", prob.tempting_shortcut, "coral");
        prependCard(`Quiz Diagnosis (${prob.id})`, prob.options[prob.correct_index], "ok");
      }

      const metricsBox = document.getElementById("drawerMetrics");
      if (metricsBox) {
        metricsBox.querySelectorAll("[data-quiz-metric]").forEach((el) => el.remove());
        const badge = document.createElement("span");
        badge.dataset.quizMetric = "1";
        badge.style.color = "var(--cobalt-ink)";
        badge.textContent = `${prob.id} \u00b7 ${prob.book_ref}`;
        metricsBox.prepend(badge);
      }

      const parsedQuery = buildQuizParsedQuery(prob, state.assumptions);
      const suggestedPrompt = `Why does "${prob.tempting_shortcut}" fail for ${prob.id} (${prob.book_ref})?`;
      state.activeCoachContext = { parsedQuery, solverData: data, suggestedPrompt };
      bus?.emit?.("solver:updated", {
        bay: prob.station,
        sub: prob.mode,
        family: fam,
        payload: prob.payload,
        solverData: data,
        parsedQuery,
        suggestedPrompt,
      });
    } catch (err) {
      if (err?.name === "AbortError") return;
      const hud = document.getElementById("flowProbeHud");
      if (hud) hud.textContent = `Verification error: ${err.message}`;
    }
  };

  const resetBtn = document.getElementById("btnResetQuizProgress");
  if (resetBtn) {
    resetBtn.onclick = () => {
      state.s5.scores = resetQuizScores();
      state.s5.chosenIdx = null;
      state.s5.checked = false;
      state.s5.lastSolvedData = null;
      state.activeCoachContext = { parsedQuery: null, solverData: null, suggestedPrompt: "" };
      bus?.emit?.("coach:close");
      renderStation05(ctx);
    };
  }

  const verifyBtn = document.getElementById("btnVerifyTwist");
  if (verifyBtn) {
    verifyBtn.onclick = async () => {
      if (state.s5.chosenIdx === null || state.s5.chosenIdx === undefined) {
        const fb = document.getElementById("twistFeedback");
        if (fb) {
          fb.innerHTML = `<div class="quiz-feedback-warn" role="alert">Select an option (A\u2013D) above before verifying your prediction.</div>`;
        }
        return;
      }
      const isCorrect = state.s5.chosenIdx === prob.correct_index;
      state.s5.checked = true;
      state.s5.scores = persistQuizScore(prob.id, isCorrect);
      syncAuditLockedBadge();
      renderMasteryNav();
      renderQuizOptions();
      renderFeedbackBox();
      await solveTwist();
    };
  }

  renderMasteryNav();
  syncAuditLockedBadge();
  renderQuizOptions();
  renderFeedbackBox();

  if (typeof renderOpts.focusPillIndex === "number") {
    const targetPill = document.querySelector(
      `#quizPillNav [data-twist-index="${renderOpts.focusPillIndex}"]`
    );
    try {
      targetPill?.focus({ preventScroll: true });
    } catch (_) {}
  }

  if (state.s5.checked) {
    await solveTwist();
  } else {
    showUnspoiledCanvas();
  }
}
