/**
 * Client-Side Numerical Solvers, Animated Canvas Renderers, and Calibrated Plots
 * for FluidScope AI Interactive Assignment Workspace (HW 1–7).
 */
import { fmtNum, niceTicks, OKABE_ITO } from "../core/color_scales.js";
import { clamp, createFieldSampler } from "./tutor_canvas_core.js";
import { renderAssignmentProCanvas } from "./assignment_cfd_viz.js?v=1";

// ── Mathematical Utilities ──────────────────────────────────────────────────

/** Complementary error function erfc(x) via Abramowitz & Stegun 7.1.26 (< 1.5e-7 error). */
export function erfc(x) {
  if (x < 0) return 2 - erfc(-x);
  const t = 1 / (1 + 0.3275911 * x);
  const poly =
    t *
    (0.254829592 +
      t *
        (-0.284496736 +
          t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  return poly * Math.exp(-x * x);
}

/** Numerically safe exp(-a*(1 - s)) ratio cosh(a*s)/cosh(a) for |s| <= 1, a >= 0. */
function coshRatio(a, absS) {
  if (a < 1e-9) return 1.0;
  const num = Math.exp(-a * (1 - absS)) + Math.exp(-a * (1 + absS));
  const den = 1 + Math.exp(-2 * a);
  return num / den;
}

/** Viridis-inspired deep blue -> teal -> amber scalar colormap (t in [0, 1]). */
function ductColorCss(t, alpha = 1) {
  const s = clamp(t, 0, 1);
  let r, g, b;
  if (s < 0.5) {
    const k = s * 2;
    r = Math.round(14 + k * (12 - 14));
    g = Math.round(32 + k * (165 - 32));
    b = Math.round(82 + k * (186 - 82));
  } else {
    const k = (s - 0.5) * 2;
    r = Math.round(12 + k * (245 - 12));
    g = Math.round(165 + k * (205 - 165));
    b = Math.round(186 + k * (68 - 186));
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ── HW 1–7 Numerical Solvers ────────────────────────────────────────────────

function toPointObjs(arr) {
  return (arr || []).map((pt) =>
    Array.isArray(pt) ? { x: pt[0], y: pt[1] } : pt
  );
}

function solveHw1(v, customKin) {
  const { t0, v0, x0, y0, t_eval, nondim } = v;
  const tEnd = Math.max(t0 + 0.25, t_eval);

  if (customKin && customKin.kin_data && customKin.kin_data.curves) {
    const k = customKin.kin_data;
    const c = k.curves;
    return {
      isCustom: true,
      streamline: toPointObjs(c.streamline),
      pathline: toPointObjs(c.pathline),
      streakline: toPointObjs(c.streakline),
      sampler: k.field ? createFieldSampler(k.field) : null,
      bounds: k.field?.bounds || [-2.5, 4.5, -2.5, 3.5],
      point_probe: k.point_probe || {},
      classification: k.classification || {},
      tEnd,
    };
  }

  const N = 80;
  const streamline = [];
  const pathline = [];
  const streakline = [];

  for (let i = 0; i <= N; i++) {
    const s = i / N;
    const t = t0 + s * (tEnd - t0);
    const tau = t0 + s * (tEnd - t0);

    // Pathline from (x0, y0) released at t0
    const xp = x0 * ((t + t0) / (2 * t0));
    const yp = y0 + v0 * (t - t0);
    pathline.push({ x: xp, y: yp, t });

    // Streakline at tEnd for releases tau in [t0, tEnd]
    const xs = x0 * ((tEnd + t0) / (tau + t0));
    const ys = y0 + v0 * (tEnd - tau);
    streakline.push({ x: xs, y: ys, tau });

    // Instantaneous streamline at t0 passing through (x0, y0)
    const yStr = y0 + s * (v0 * (tEnd - t0));
    const xStr = x0 * Math.exp((yStr - y0) / (2 * v0 * t0));
    streamline.push({ x: xStr, y: yStr });
  }

  return {
    isCustom: false,
    nondim: !!nondim,
    streamline,
    pathline,
    streakline,
    tEnd,
  };
}

function solveHw2(v, customKin) {
  const { A, x1, x2, y1, y2, tau_end } = v;
  const xL = Math.min(x1, x2 - 0.05);
  const xR = Math.max(x2, xL + 0.05);
  const yB = Math.min(y1, y2 - 0.05);
  const yT = Math.max(y2, yB + 0.05);
  const tEnd = tau_end / Math.max(A, 0.05);

  if (customKin && customKin.kin_data && customKin.kin_data.curves) {
    const k = customKin.kin_data;
    const c = k.curves;
    return {
      isCustom: true,
      streamline: toPointObjs(c.streamline),
      pathline: toPointObjs(c.pathline),
      streakline: toPointObjs(c.streakline),
      initialEl: toPointObjs(c.initial_element),
      deformedEl: toPointObjs(c.deformed_element),
      sampler: k.field ? createFieldSampler(k.field) : null,
      bounds: k.field?.bounds || [-3.0, 3.0, -3.0, 3.0],
      point_probe: k.point_probe || {},
      classification: k.classification || {},
      tEnd,
      box0: { xL, xR, yB, yT },
    };
  }

  const N = 60;
  const area0 = (xR - xL) * (yT - yB);
  const timeSeries = [];
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * tEnd;
    const lx = (xR - xL) * Math.exp(A * t);
    const ly = (yT - yB) * Math.exp(-A * t);
    timeSeries.push({
      t,
      At: A * t,
      lx,
      ly,
      areaRatio: (lx * ly) / area0,
    });
  }
  const pressureCurve = [];
  for (let i = 0; i <= 50; i++) {
    const r = (i / 50) * 2.5;
    pressureCurve.push({ r, dpNorm: -0.5 * r * r });
  }
  return {
    isCustom: false,
    tEnd,
    box0: { xL, xR, yB, yT },
    area0,
    timeSeries,
    pressureCurve,
  };
}

/** Integrate HW 3 draining tank (both ideal and viscous unsteady Bernoulli ODE). */
function integrateHw3Case(ratio_A, h0_over_sqrtA, mu, A_tank, withVisc) {
  const g = 9.81;
  const rho = 1000.0;
  const nu = mu / rho;
  const R = Math.max(1.0, ratio_A);
  const beta = R * R - 1.0;
  const D = Math.sqrt((4 * A_tank) / Math.PI);
  const D0 = D / R;
  const h0 = Math.max(0.02, h0_over_sqrtA * Math.sqrt(A_tank));
  const tT = R * Math.sqrt((2 * h0) / g);

  // Graded time stepping so stiff R=1000 startup is unconditionally stable without blowing up
  let h = h0;
  let vDown = 0.0; // -dh/dt >= 0
  let t = 0.0;
  const maxTime = tT * 12.0;
  const trace = [{ t: 0, tNorm: 0, hNorm: 1.0, torricelli: 1.0 }];

  const tauStartup = tT / Math.max(25.0, R * R * 1.5);
  let stepCount = 0;
  const maxSteps = 2200;

  while (h > 0.002 * h0 && t < maxTime && stepCount < maxSteps) {
    stepCount++;
    const dt = t < 15 * tauStartup ? tauStartup * 0.25 : Math.min(tT / 220, (t + tauStartup) * 0.04);

    // Semi-implicit step on vDown >= 0: h * dv/dt = g*h - 0.5*beta*v^2 - viscTerm(h, v)
    const vSafe = Math.max(vDown, 1e-8);
    let fWall = 0.0;
    let fOrif = 0.0;
    let dLossDv = 0.0;

    if (withVisc && mu > 0) {
      const ReT = (rho * vSafe * D) / mu;
      const ft = ReT < 2100 ? 64 / Math.max(ReT, 1e-4) : 0.3164 * Math.pow(ReT, -0.25);
      const Ve = R * vSafe;
      const Re0 = (rho * Ve * D0) / mu;
      const f0 = Re0 < 2100 ? 64 / Math.max(Re0, 1e-4) : 0.3164 * Math.pow(Re0, -0.25);

      fWall = 0.5 * ft * (h / D) * vDown * vDown;
      fOrif = 0.5 * f0 * R * R * vDown * vDown;
      // Approximate Jacobian d(fWall + fOrif)/dv for stability
      const dWall = ReT < 2100 ? (32 * nu * h) / (D * D) : ft * (h / D) * vDown;
      const dOrif = Re0 < 2100 ? (32 * nu * R) / D0 : f0 * R * R * vDown;
      dLossDv = dWall + dOrif;
    }

    const rhs = g * h - 0.5 * beta * vDown * vDown - fWall - fOrif;
    const J = -((beta * vDown + dLossDv) / Math.max(h, 1e-5));
    const dv = (dt * (rhs / Math.max(h, 1e-5))) / (1 - dt * J);
    const vNext = Math.max(0.0, vDown + dv);
    const hNext = h - 0.5 * (vDown + vNext) * dt;

    if (hNext <= 0) {
      const frac = h / Math.max(h - hNext, 1e-12);
      t += frac * dt;
      h = 0;
      vDown = vNext;
      break;
    }

    t += dt;
    h = hNext;
    vDown = vNext;

    if (trace.length < 120 && t / tT - trace[trace.length - 1].tNorm >= 0.02) {
      const tn = t / tT;
      trace.push({
        t,
        tNorm: tn,
        hNorm: clamp(h / h0, 0, 1),
        torricelli: tn < 1 ? (1 - tn) * (1 - tn) : 0,
      });
    }
  }

  trace.push({
    t,
    tNorm: t / tT,
    hNorm: 0,
    torricelli: (t / tT) < 1 ? Math.pow(1 - t / tT, 2) : 0,
  });

  return { tDrain: t, tT, ratio: t / tT, trace, h0, D, D0 };
}

function solveHw3(v) {
  const ideal = integrateHw3Case(v.ratio_A, v.h0_over_sqrtA, 0, v.A_tank, false);
  const visc = integrateHw3Case(v.ratio_A, v.h0_over_sqrtA, v.mu, v.A_tank, true);

  // Parametric error sweep for ratios {1, 10, 100, 1000} and slenderness {1, 10, 100, 1000}
  const ratios = [1, 10, 100, 1000];
  const slendernessList = [1, 10, 100, 1000];
  const sweepCurves = slendernessList.map((sl) => ({
    slenderness: sl,
    pts: ratios.map((r) => {
      const res = integrateHw3Case(r, sl, v.mu, v.A_tank, true);
      return { r, errPct: Math.abs(res.ratio - 1) * 100, ratio: res.ratio };
    }),
  }));

  return {
    tT: visc.tT,
    tEnd: Math.max(visc.tDrain, visc.tT),
    t_ideal_ratio: ideal.ratio,
    t_visc_ratio: visc.ratio,
    idealTrace: ideal.trace,
    viscTrace: visc.trace,
    sweepCurves,
    h0: visc.h0,
  };
}

function solveHw4(v) {
  const g = 9.81;
  const thRad = (v.theta_deg * Math.PI) / 180;
  const tanT = Math.tan(thRad);
  const rb = Math.max(0.002, v.R_top - v.h0 * tanT);

  const teCyl = ((Math.PI * v.R_top * v.R_top) / (v.Cd * v.Ae)) * Math.sqrt((2 * v.h0) / g);
  const teCone =
    ((Math.PI * Math.sqrt(2 * v.h0)) / (v.Cd * v.Ae * Math.sqrt(g))) *
    (rb * rb + (2 / 3) * rb * v.h0 * tanT + 0.2 * v.h0 * v.h0 * tanT * tanT);

  // Numerical Torricelli h(t) & Unsteady Inertia h_unst(t) with KL
  const N = 80;
  const dtTorr = teCone / N;
  const torrCurve = [{ t: 0, h: v.h0, r: rb + v.h0 * tanT }];
  let hT = v.h0;
  for (let i = 1; i <= N; i++) {
    const dStep = dtTorr / 4;
    for (let s = 0; s < 4; s++) {
      if (hT <= 0) break;
      const rH = Math.max(0.002, rb + hT * tanT);
      const areaH = Math.PI * rH * rH;
      const dh = -(v.Cd * v.Ae * Math.sqrt(2 * g * Math.max(hT, 0))) / areaH;
      hT = Math.max(0, hT + dh * dStep);
    }
    torrCurve.push({ t: i * dtTorr, h: hT, r: rb + hT * tanT });
  }

  // Unsteady Bernoulli (4.1e) with KL loss and inertia
  const unstCurve = [{ t: 0, h: v.h0 }];
  let hU = v.h0;
  let vU = 0;
  let tU = 0;
  const dtU = Math.max(teCone / 280, 0.01);
  let tEmptyUnst = teCone;
  for (let step = 0; step < 600 && hU > 0.002 * v.h0; step++) {
    const rH = Math.max(0.002, rb + hU * tanT);
    const areaH = Math.PI * rH * rH;
    const ar = areaH / v.Ae;
    const convCoeff = 0.5 * ar * ar * (1 + v.KL) - 0.5 - (2 * hU * tanT) / rb;
    const effInertia = Math.max((rH / rb) * hU, 1e-4);
    const rhs = g * hU - Math.max(convCoeff, 0.1) * vU * vU;
    const J = -(2 * Math.max(convCoeff, 0.1) * vU) / effInertia;
    const dv = (dtU * (rhs / effInertia)) / (1 - dtU * J);
    vU = Math.max(0, vU + dv);
    hU = Math.max(0, hU - vU * dtU);
    tU += dtU;
    if (step % 4 === 0 || hU <= 0.002 * v.h0) {
      unstCurve.push({ t: tU, h: hU });
    }
    tEmptyUnst = tU;
  }

  // Theta sensitivity curve for 4.1(d)
  const thetaSweep = [];
  for (let deg = -20; deg <= 21; deg += 2) {
    const tt = Math.tan((deg * Math.PI) / 180);
    const rbS = Math.max(0.002, v.R_top - v.h0 * tt);
    const tc =
      ((Math.PI * Math.sqrt(2 * v.h0)) / (v.Cd * v.Ae * Math.sqrt(g))) *
      (rbS * rbS + (2 / 3) * rbS * v.h0 * tt + 0.2 * v.h0 * v.h0 * tt * tt);
    thetaSweep.push({ deg, ratio: tc / teCyl, te: tc });
  }

  // Problem 4.2 Spherical gas vessel
  const V_sph = (4 / 3) * Math.PI * Math.pow(v.R_sphere, 3);
  const tau = V_sph / Math.max(v.k_exhaust, 1e-6);
  const tMaxGas = 5 * tau;
  const gasCurve = [];
  for (let i = 0; i <= 70; i++) {
    const t = (i / 70) * tMaxGas;
    gasCurve.push({ t, ratio: Math.exp(-t / tau), rho: v.rho0 * Math.exp(-t / tau) });
  }
  const milestones = [
    { label: "99% ρ₀", frac: 0.99, t: tau * Math.log(100 / 99) },
    { label: "50% ρ₀", frac: 0.50, t: tau * Math.LN2 },
    { label: "10% ρ₀", frac: 0.10, t: tau * Math.LN10 },
    { label: "1% ρ₀", frac: 0.01, t: tau * Math.log(100) },
  ];

  const isGas = v.section === "p2";
  return {
    isGas,
    rb,
    tanT,
    teCyl,
    teCone,
    tEmptyUnst,
    torrCurve,
    unstCurve,
    thetaSweep,
    V_sph,
    tau,
    gasCurve,
    milestones,
    tEnd: isGas ? tMaxGas : Math.max(teCone, teCyl, tEmptyUnst),
  };
}

function solveHw5(v) {
  const { kappa, R1, omega1, mu, rho, L_cyl } = v;
  const denom = kappa * kappa - 1;
  const vWall = omega1 * R1;
  const profile = [];
  const N = 70;

  for (let i = 0; i <= N; i++) {
    const xi = i / N; // 0 (inner wall) -> 1 (outer wall)
    const rNorm = 1 + (kappa - 1) * xi; // r / R1
    const uNorm = (kappa * kappa / rNorm - rNorm) / denom;
    const uCouette = 1 - xi;
    const dpNorm =
      (kappa * kappa * kappa * kappa * (1 - 1 / (rNorm * rNorm)) -
        4 * kappa * kappa * Math.log(rNorm) +
        (rNorm * rNorm - 1)) /
      (denom * denom);
    const tauPa = (2 * mu * omega1 * kappa * kappa) / (denom * rNorm * rNorm);
    const T_Nm = 2 * Math.PI * Math.pow(rNorm * R1, 2) * L_cyl * tauPa;
    profile.push({
      xi,
      rNorm,
      uNorm,
      uCouette,
      dpNorm,
      tauPa,
      T_Nm,
    });
  }

  return {
    profile,
    dp_norm_max: profile[profile.length - 1].dpNorm,
    vWall,
    tEnd: 4.0,
  };
}

function evalDuctWStar(X, Y, alpha, nTerms) {
  // Use Dirichlet-unique dual basis if alpha < 1 so scaling is always w / [G * min(a,b)^2]
  const swapped = alpha < 1.0;
  const aEff = swapped ? 1.0 / Math.max(alpha, 0.05) : alpha;
  const xUse = swapped ? Math.abs(Y) : Math.abs(X);
  const yUse = swapped ? Math.abs(X) : Math.abs(Y);

  let w = 0.5 * (1 - yUse * yUse);
  const coeff = 16 / (Math.PI * Math.PI * Math.PI);
  for (let n = 1; n <= nTerms; n++) {
    const m = 2 * n - 1;
    const k = (m * Math.PI) / 2;
    const sign = n % 2 === 1 ? 1 : -1;
    const term =
      (sign / (m * m * m)) * coshRatio(k * aEff, xUse) * Math.cos(k * yUse);
    w -= coeff * term;
  }
  return Math.max(0, w);
}

function solveHw6(v) {
  const alpha = Math.max(0.08, v.alpha);
  const nTerms = Math.round(clamp(v.n_terms, 1, 25));
  const GN = 31; // 31x31 contour grid
  const grid = new Float32Array(GN * GN);
  let wMax = 0;

  for (let j = 0; j < GN; j++) {
    const Y = -1 + (2 * j) / (GN - 1);
    for (let i = 0; i < GN; i++) {
      const X = -1 + (2 * i) / (GN - 1);
      const val = evalDuctWStar(X, Y, alpha, nTerms);
      grid[j * GN + i] = val;
      if (val > wMax) wMax = val;
    }
  }

  const centerX = []; // varying X at Y=0
  const centerY = []; // varying Y at X=0
  for (let i = 0; i <= 50; i++) {
    const s = -1 + (2 * i) / 50;
    centerX.push({ s, w: evalDuctWStar(s, 0, alpha, nTerms), pois: 0.5 * (1 - s * s) });
    centerY.push({ s, w: evalDuctWStar(0, s, alpha, nTerms), pois: 0.5 * (1 - s * s) });
  }

  const wCenter = evalDuctWStar(0, 0, alpha, nTerms);
  const devPct = Math.max(0, ((0.5 - wCenter) / 0.5) * 100);

  // Aspect ratio convergence sweep alpha in [0.1 .. 10]
  const alphaSweep = [0.1, 0.2, 0.35, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 5.0, 7.5, 10.0].map(
    (a) => {
      const wc = evalDuctWStar(0, 0, a, 15);
      return { alpha: a, wCenter: wc, devPct: Math.max(0.001, ((0.5 - wc) / 0.5) * 100) };
    }
  );

  return {
    GN,
    grid,
    wMax: Math.max(wMax, 1e-4),
    w_center: wCenter,
    dev_pct: devPct,
    centerX,
    centerY,
    alphaSweep,
    tEnd: 4.0,
  };
}

function evalBoundedCouette(yMeters, tSec, U, nu, H) {
  if (yMeters <= 0) return U;
  if (yMeters >= H) return 0;
  const tau = (nu * tSec) / (H * H);
  let uNorm = 1 - yMeters / H;
  for (let n = 1; n <= 35; n++) {
    const decay = Math.exp(-n * n * Math.PI * Math.PI * tau);
    if (decay < 1e-8) break;
    uNorm -= (2 / (n * Math.PI)) * Math.sin((n * Math.PI * yMeters) / H) * decay;
  }
  return U * clamp(uNorm, 0, 1.02);
}

function solveHw7(v) {
  const { U, nu_e6, t_cur, H_mm, bounded } = v;
  const nu = nu_e6 * 1e-6;
  const H = H_mm * 1e-3;
  const yMaxMM = bounded ? H_mm : Math.max(12, 4.2 * Math.sqrt(nu * Math.max(t_cur, 15)) * 1000);
  const timesList = [0.5, 2.0, 8.0, 25.0];
  if (!timesList.some((tt) => Math.abs(tt - t_cur) < 0.2)) {
    timesList.push(t_cur);
  }

  const curves = timesList.map((tt) => {
    const pts = [];
    for (let i = 0; i <= 60; i++) {
      const yMM = (i / 60) * yMaxMM;
      const yM = yMM * 1e-3;
      const uVal = bounded
        ? evalBoundedCouette(yM, tt, U, nu, H)
        : U * erfc(yM / (2 * Math.sqrt(nu * Math.max(tt, 1e-3))));
      pts.push({ yMM, uNorm: uVal / Math.max(U, 1e-4) });
    }
    return { t: tt, isCurrent: Math.abs(tt - t_cur) < 0.2, pts };
  });

  const simCurve = [];
  for (let i = 0; i <= 60; i++) {
    const eta = (i / 60) * 3.2;
    simCurve.push({
      eta,
      erfcVal: erfc(eta),
      omegaNorm: Math.exp(-eta * eta), // normalized by U / sqrt(pi*nu*t)
    });
  }

  return {
    nu,
    H,
    yMaxMM,
    curves,
    simCurve,
    delta99MM: 3.6428 * Math.sqrt(nu * Math.max(t_cur, 0.05)) * 1000,
    tEnd: Math.max(t_cur, 12.0),
  };
}

export function computeAssignmentSim(hwId, values, customKinData = null) {
  switch (hwId) {
    case "hw1": return solveHw1(values, customKinData);
    case "hw2": return solveHw2(values, customKinData);
    case "hw3": return solveHw3(values);
    case "hw4": return solveHw4(values);
    case "hw5": return solveHw5(values);
    case "hw6": return solveHw6(values);
    case "hw7": return solveHw7(values);
    default: return {};
  }
}

// ── Studio-Grade Animated CFD Canvas Renderer ───────────────────────────────

export function renderAssignmentAnimCanvas(
  ctx,
  cw,
  ch,
  hwId,
  v,
  sim,
  animTimeSec,
  hoverPx = null
) {
  return renderAssignmentProCanvas(ctx, cw, ch, hwId, v, sim, animTimeSec, hoverPx, {
    erfc,
    evalBoundedCouette,
  });
}



// ── Bottom Calibrated Telemetry Plot Renderer (Light Paper Studio Palette) ────

function drawPaperPlotFrame(ctx, cw, ch, xTicks, yTicks, xLabel, yLabel) {
  const pad = { left: 54, right: 20, top: 18, bottom: 32 };
  const pw = cw - pad.left - pad.right;
  const ph = ch - pad.top - pad.bottom;

  ctx.fillStyle = "#fcfbf8";
  ctx.fillRect(0, 0, cw, ch);

  const mapX = (x) => pad.left + ((x - xTicks[0]) / Math.max(xTicks[xTicks.length - 1] - xTicks[0], 1e-9)) * pw;
  const mapY = (y) => pad.top + ph - ((y - yTicks[0]) / Math.max(yTicks[yTicks.length - 1] - yTicks[0], 1e-9)) * ph;

  ctx.strokeStyle = "#e6e1d6";
  ctx.lineWidth = 1;
  ctx.font = "10.5px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillStyle = "#5b554d";

  xTicks.forEach((tx) => {
    const px = mapX(tx);
    ctx.beginPath();
    ctx.moveTo(px, pad.top);
    ctx.lineTo(px, pad.top + ph);
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillText(fmtNum(tx, 2), px, pad.top + ph + 13);
  });

  yTicks.forEach((ty) => {
    const py = mapY(ty);
    ctx.beginPath();
    ctx.moveTo(pad.left, py);
    ctx.lineTo(pad.left + pw, py);
    ctx.stroke();
    ctx.textAlign = "right";
    ctx.fillText(fmtNum(ty, 2), pad.left - 6, py + 3);
  });

  ctx.strokeStyle = "#8a8175";
  ctx.strokeRect(pad.left, pad.top, pw, ph);

  ctx.fillStyle = "#2b2722";
  ctx.font = "600 11px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(xLabel, pad.left + pw / 2, ch - 5);

  ctx.save();
  ctx.translate(13, pad.top + ph / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(yLabel, 0, 0);
  ctx.restore();

  return { mapX, mapY, pad, pw, ph };
}

function strokeSeries(ctx, pts, mapX, mapY, color, dashed = false, width = 2.2) {
  if (!pts || pts.length < 2) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  if (dashed) ctx.setLineDash([6, 4]);
  ctx.beginPath();
  pts.forEach((p, idx) => {
    const px = mapX(p[0]), py = mapY(p[1]);
    if (idx === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();
  ctx.restore();
}

function drawPaperLegend(ctx, cw, pad, items) {
  if (!items?.length) return;
  ctx.save();
  ctx.font = "600 10px system-ui, sans-serif";
  let xCursor = cw - pad.right - 8;
  const yMid = pad.top + 11;
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    const tw = ctx.measureText(it.label).width;
    const blockW = tw + 22;
    xCursor -= blockW;
    ctx.fillStyle = "rgba(252, 251, 248, 0.88)";
    ctx.fillRect(xCursor - 2, yMid - 8, blockW, 15);
    ctx.strokeStyle = it.color;
    ctx.lineWidth = 2.2;
    if (it.dashed) ctx.setLineDash([4, 2]);
    else ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(xCursor + 2, yMid);
    ctx.lineTo(xCursor + 15, yMid);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#1e293b";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(it.label, xCursor + 18, yMid);
    xCursor -= 8;
  }
  ctx.restore();
}

export function renderAssignmentPlotCanvas(ctx, cw, ch, hwId, v, sim, plotTabId) {
  ctx.clearRect(0, 0, cw, ch);

  if (hwId === "hw1") {
    if (plotTabId === "coords" && !sim.isCustom) {
      const tTicks = niceTicks(v.t0, sim.tEnd, 5);
      const yMax = Math.max(...sim.pathline.map((p) => Math.max(p.x, p.y)), 2);
      const vTicks = niceTicks(Math.min(0, v.y0), yMax, 5);
      const f = drawPaperPlotFrame(ctx, cw, ch, tTicks, vTicks, "Time t (s)", "Coordinate (m)");
      strokeSeries(ctx, sim.pathline.map((p) => [p.t, p.x]), f.mapX, f.mapY, OKABE_ITO.blue);
      strokeSeries(ctx, sim.pathline.map((p) => [p.t, p.y]), f.mapX, f.mapY, OKABE_ITO.vermilion);
      drawPaperLegend(ctx, cw, f.pad, [
        { label: "x(t)", color: OKABE_ITO.blue },
        { label: "y(t)", color: OKABE_ITO.vermilion },
      ]);
    } else if (v.nondim && !sim.isCustom) {
      const denomY = Math.max(v.v0 * v.t0, 0.05);
      const toXY = (p) => [p.x / Math.max(v.x0, 0.05), (p.y - v.y0) / denomY];
      const all = [...sim.streamline, ...sim.pathline, ...sim.streakline].map(toXY);
      const xTicks = niceTicks(0.9, Math.max(1.8, ...all.map((p) => p[0])), 5);
      const yTicks = niceTicks(0, Math.max(1.1, ...all.map((p) => p[1])), 5);
      const f = drawPaperPlotFrame(ctx, cw, ch, xTicks, yTicks, "Nondim X = x/x₀", "Nondim Y = (y−y₀)/(v₀t₀)");
      strokeSeries(ctx, sim.streamline.map(toXY), f.mapX, f.mapY, OKABE_ITO.blue, true);
      strokeSeries(ctx, sim.pathline.map(toXY), f.mapX, f.mapY, OKABE_ITO.orange);
      strokeSeries(ctx, sim.streakline.map(toXY), f.mapX, f.mapY, OKABE_ITO.purple);
      drawPaperLegend(ctx, cw, f.pad, [
        { label: "Streamline", color: OKABE_ITO.blue, dashed: true },
        { label: "Pathline", color: OKABE_ITO.orange },
        { label: "Streakline", color: OKABE_ITO.purple },
      ]);
    } else {
      const all = [...(sim.streamline || []), ...(sim.pathline || []), ...(sim.streakline || [])];
      const xs = all.map((p) => p.x).filter(Number.isFinite);
      const ys = all.map((p) => p.y).filter(Number.isFinite);
      const xTicks = niceTicks(Math.min(0, ...(xs.length ? xs : [0])), Math.max(2, ...(xs.length ? xs : [2])), 5);
      const yTicks = niceTicks(Math.min(0, ...(ys.length ? ys : [0])), Math.max(2, ...(ys.length ? ys : [2])), 5);
      const f = drawPaperPlotFrame(ctx, cw, ch, xTicks, yTicks, "x (m)", "y (m)");
      strokeSeries(ctx, (sim.streamline || []).map((p) => [p.x, p.y]), f.mapX, f.mapY, OKABE_ITO.blue, true);
      strokeSeries(ctx, (sim.pathline || []).map((p) => [p.x, p.y]), f.mapX, f.mapY, OKABE_ITO.orange);
      strokeSeries(ctx, (sim.streakline || []).map((p) => [p.x, p.y]), f.mapX, f.mapY, OKABE_ITO.purple);
      drawPaperLegend(ctx, cw, f.pad, [
        { label: "Stream", color: OKABE_ITO.blue, dashed: true },
        { label: "Path", color: OKABE_ITO.orange },
        { label: "Streak", color: OKABE_ITO.purple },
      ]);
    }
  } else if (hwId === "hw2") {
    if (plotTabId === "pressure" && !sim.isCustom) {
      const f = drawPaperPlotFrame(ctx, cw, ch, [0, 0.5, 1, 1.5, 2, 2.5], [-3.2, -2.4, -1.6, -0.8, 0], "Radial Distance r (m)", "(p − p₀) / (½ρA²)");
      strokeSeries(ctx, sim.pressureCurve.map((p) => [p.r, p.dpNorm]), f.mapX, f.mapY, OKABE_ITO.vermilion);
      drawPaperLegend(ctx, cw, f.pad, [{ label: "−r² Stagnation Drop", color: OKABE_ITO.vermilion }]);
    } else if (!sim.isCustom) {
      const ts = sim.timeSeries || [];
      const xTicks = niceTicks(0, Math.max(0.5, ...ts.map((p) => p.t)), 5);
      const yMax = Math.max(2, ...ts.map((p) => Math.max(p.lx, p.areaRatio)));
      const yTicks = niceTicks(0, yMax, 5);
      const f = drawPaperPlotFrame(ctx, cw, ch, xTicks, yTicks, "Time t (s)", "Box Lx, Ly (m) & Area/Area₀");
      strokeSeries(ctx, ts.map((p) => [p.t, p.lx]), f.mapX, f.mapY, OKABE_ITO.blue);
      strokeSeries(ctx, ts.map((p) => [p.t, p.ly]), f.mapX, f.mapY, OKABE_ITO.orange);
      strokeSeries(ctx, ts.map((p) => [p.t, p.areaRatio]), f.mapX, f.mapY, OKABE_ITO.green, true);
      drawPaperLegend(ctx, cw, f.pad, [
        { label: "Lx(t)", color: OKABE_ITO.blue },
        { label: "Ly(t)", color: OKABE_ITO.orange },
        { label: "Area/A₀=1", color: OKABE_ITO.green, dashed: true },
      ]);
    } else {
      const all = [...(sim.streamline || []), ...(sim.pathline || []), ...(sim.streakline || [])];
      const xs = all.map((p) => p.x).filter(Number.isFinite);
      const ys = all.map((p) => p.y).filter(Number.isFinite);
      const xTicks = niceTicks(Math.min(0, ...(xs.length ? xs : [-2])), Math.max(2, ...(xs.length ? xs : [2])), 5);
      const yTicks = niceTicks(Math.min(0, ...(ys.length ? ys : [-2])), Math.max(2, ...(ys.length ? ys : [2])), 5);
      const f = drawPaperPlotFrame(ctx, cw, ch, xTicks, yTicks, "x (m)", "Custom Trajectory y (m)");
      strokeSeries(ctx, (sim.streamline || []).map((p) => [p.x, p.y]), f.mapX, f.mapY, OKABE_ITO.blue, true);
      strokeSeries(ctx, (sim.pathline || []).map((p) => [p.x, p.y]), f.mapX, f.mapY, OKABE_ITO.orange);
      strokeSeries(ctx, (sim.streakline || []).map((p) => [p.x, p.y]), f.mapX, f.mapY, OKABE_ITO.purple);
      drawPaperLegend(ctx, cw, f.pad, [
        { label: "Stream", color: OKABE_ITO.blue, dashed: true },
        { label: "Path", color: OKABE_ITO.orange },
      ]);
    }
  } else if (hwId === "hw3") {
    if (plotTabId === "error") {
      const errMax = Math.max(15, ...sim.sweepCurves.flatMap((c) => c.pts.map((p) => p.errPct)));
      const f = drawPaperPlotFrame(ctx, cw, ch, [0, 1, 2, 3], niceTicks(0, Math.min(errMax, 500), 5), "log₁₀(A / A₀)  [1 → 1000]", "% Error vs Torricelli");
      const cols = [OKABE_ITO.blue, OKABE_ITO.orange, OKABE_ITO.green, OKABE_ITO.vermilion];
      sim.sweepCurves.forEach((curve, idx) => {
        strokeSeries(
          ctx,
          curve.pts.map((p) => [Math.log10(p.r), Math.min(p.errPct, 500)]),
          f.mapX,
          f.mapY,
          cols[idx % cols.length]
        );
      });
      drawPaperLegend(ctx, cw, f.pad, [
        { label: "h₀/√A=1", color: cols[0] },
        { label: "10", color: cols[1] },
        { label: "100", color: cols[2] },
        { label: "1000", color: cols[3] },
      ]);
    } else {
      const xMax = Math.max(1.2, sim.t_visc_ratio, sim.t_ideal_ratio);
      const f = drawPaperPlotFrame(ctx, cw, ch, niceTicks(0, xMax, 5), [0, 0.25, 0.5, 0.75, 1.0], "Normalized Time t / t_T", "Liquid Height h / h₀");
      const torPts = [];
      for (let i = 0; i <= 40; i++) {
        const tn = i / 40;
        torPts.push([tn, (1 - tn) * (1 - tn)]);
      }
      strokeSeries(ctx, torPts, f.mapX, f.mapY, "#64748b", true);
      strokeSeries(ctx, sim.idealTrace.map((p) => [p.tNorm, p.hNorm]), f.mapX, f.mapY, OKABE_ITO.blue);
      strokeSeries(ctx, sim.viscTrace.map((p) => [p.tNorm, p.hNorm]), f.mapX, f.mapY, OKABE_ITO.vermilion);
      drawPaperLegend(ctx, cw, f.pad, [
        { label: "Torricelli", color: "#64748b", dashed: true },
        { label: "Ideal Bernoulli", color: OKABE_ITO.blue },
        { label: "Viscous ODE", color: OKABE_ITO.vermilion },
      ]);
    }
  } else if (hwId === "hw4") {
    if (!sim.isGas) {
      if (plotTabId === "sweep") {
        const yMax = Math.max(1.6, ...sim.thetaSweep.map((p) => p.ratio));
        const f = drawPaperPlotFrame(ctx, cw, ch, [-20, -10, 0, 10, 20], niceTicks(0, yMax, 5), "Wall Angle θ (deg)", "Emptying Ratio t_e / t_e,cyl");
        strokeSeries(ctx, sim.thetaSweep.map((p) => [p.deg, p.ratio]), f.mapX, f.mapY, OKABE_ITO.blue);
        drawPaperLegend(ctx, cw, f.pad, [{ label: "Cone/Cyl Ratio", color: OKABE_ITO.blue }]);
      } else {
        const f = drawPaperPlotFrame(ctx, cw, ch, niceTicks(0, sim.tEnd, 5), niceTicks(0, v.h0, 5), "Time t (s)", "Liquid Depth h (m)");
        strokeSeries(ctx, sim.torrCurve.map((p) => [p.t, p.h]), f.mapX, f.mapY, OKABE_ITO.blue);
        strokeSeries(ctx, sim.unstCurve.map((p) => [p.t, p.h]), f.mapX, f.mapY, OKABE_ITO.vermilion, true);
        drawPaperLegend(ctx, cw, f.pad, [
          { label: "Torricelli Cone", color: OKABE_ITO.blue },
          { label: "Unsteady + K_L", color: OKABE_ITO.vermilion, dashed: true },
        ]);
      }
    } else if (plotTabId === "sweep") {
      const mMax = Math.max(1, ...sim.milestones.map((m) => m.t));
      const f = drawPaperPlotFrame(ctx, cw, ch, [0, 1, 2, 3, 4], niceTicks(0, mMax * 1.15, 5), "Depletion Milestones (99% → 1% ρ₀)", "Elapsed Time (s)");
      sim.milestones.forEach((m, idx) => {
        const cxBar = f.mapX(idx + 0.5);
        const bw = (f.pw / 4) * 0.52;
        const yTop = f.mapY(m.t);
        const yBase = f.mapY(0);
        ctx.fillStyle = idx === 3 ? OKABE_ITO.vermilion : OKABE_ITO.blue;
        ctx.fillRect(cxBar - bw / 2, yTop, bw, Math.max(2, yBase - yTop));
        ctx.fillStyle = "#1e293b";
        ctx.font = "600 10px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.fillText(`${m.label}: ${fmtNum(m.t, 1)}s`, cxBar, Math.max(f.pad.top + 11, yTop - 4));
      });
    } else {
      const f = drawPaperPlotFrame(ctx, cw, ch, niceTicks(0, sim.tEnd, 5), [0, 0.25, 0.5, 0.75, 1.0], "Time t (s)", "Density Ratio ρ(t) / ρ₀");
      strokeSeries(ctx, sim.gasCurve.map((p) => [p.t, p.ratio]), f.mapX, f.mapY, OKABE_ITO.blue);
      sim.milestones.forEach((m) => {
        const mx = f.mapX(m.t), my = f.mapY(m.frac);
        ctx.fillStyle = OKABE_ITO.vermilion;
        ctx.beginPath();
        ctx.arc(mx, my, 4, 0, Math.PI * 2);
        ctx.fill();
      });
      drawPaperLegend(ctx, cw, f.pad, [
        { label: "ρ/ρ₀ = e⁻ᵗ/τ", color: OKABE_ITO.blue },
        { label: "99/50/10/1%", color: OKABE_ITO.vermilion },
      ]);
    }
  } else if (hwId === "hw5") {
    if (plotTabId === "pressure") {
      const f = drawPaperPlotFrame(ctx, cw, ch, [0, 0.25, 0.5, 0.75, 1.0], niceTicks(0, Math.max(0.2, sim.dp_norm_max), 5), "Gap Coord ξ = (r−R₁)/(R₂−R₁)", "Δp* vs Torque Ratio");
      strokeSeries(ctx, sim.profile.map((p) => [p.xi, p.dpNorm]), f.mapX, f.mapY, OKABE_ITO.vermilion);
      drawPaperLegend(ctx, cw, f.pad, [{ label: "Radial Δp*(r)", color: OKABE_ITO.vermilion }]);
    } else {
      const f = drawPaperPlotFrame(ctx, cw, ch, [0, 0.25, 0.5, 0.75, 1.0], [0, 0.25, 0.5, 0.75, 1.0], "Gap Coord ξ = (r−R₁)/(R₂−R₁)", "u_θ / (Ω₁R₁)");
      strokeSeries(ctx, sim.profile.map((p) => [p.xi, p.uCouette]), f.mapX, f.mapY, "#64748b", true);
      strokeSeries(ctx, sim.profile.map((p) => [p.xi, p.uNorm]), f.mapX, f.mapY, OKABE_ITO.blue);
      drawPaperLegend(ctx, cw, f.pad, [
        { label: "Planar Couette", color: "#64748b", dashed: true },
        { label: "Exact u_θ", color: OKABE_ITO.blue },
      ]);
    }
  } else if (hwId === "hw6") {
    if (plotTabId === "convergence") {
      const f = drawPaperPlotFrame(ctx, cw, ch, [-1, -0.5, 0, 0.5, 1], [0, 10, 20, 30, 45], "log₁₀(α)   [0.1 → 10]", "% Deviation vs Poiseuille (0.5)");
      strokeSeries(ctx, sim.alphaSweep.map((p) => [Math.log10(p.alpha), p.devPct]), f.mapX, f.mapY, OKABE_ITO.vermilion);
      drawPaperLegend(ctx, cw, f.pad, [{ label: "% Below Poiseuille", color: OKABE_ITO.vermilion }]);
    } else {
      const f = drawPaperPlotFrame(ctx, cw, ch, [-1, -0.5, 0, 0.5, 1], [0, 0.125, 0.25, 0.375, 0.5], "Normalized Coord X or Y", "Velocity W* = w / (G min(a,b)²)");
      strokeSeries(ctx, sim.centerX.map((p) => [p.s, p.pois]), f.mapX, f.mapY, "#64748b", true);
      strokeSeries(ctx, sim.centerX.map((p) => [p.s, p.w]), f.mapX, f.mapY, OKABE_ITO.blue);
      strokeSeries(ctx, sim.centerY.map((p) => [p.s, p.w]), f.mapX, f.mapY, OKABE_ITO.orange);
      drawPaperLegend(ctx, cw, f.pad, [
        { label: "Plane Poiseuille", color: "#64748b", dashed: true },
        { label: "X-profile", color: OKABE_ITO.blue },
        { label: "Y-profile", color: OKABE_ITO.orange },
      ]);
    }
  } else if (hwId === "hw7") {
    if (plotTabId === "similarity") {
      const f = drawPaperPlotFrame(ctx, cw, ch, [0, 0.8, 1.6, 2.4, 3.2], [0, 0.25, 0.5, 0.75, 1.0], "Similarity Variable η = y/(2√(νt))", "erfc(η) & Gaussian ωz");
      strokeSeries(ctx, sim.simCurve.map((p) => [p.eta, p.erfcVal]), f.mapX, f.mapY, OKABE_ITO.blue);
      strokeSeries(ctx, sim.simCurve.map((p) => [p.eta, p.omegaNorm]), f.mapX, f.mapY, OKABE_ITO.vermilion, true);
      drawPaperLegend(ctx, cw, f.pad, [
        { label: "erfc(η)", color: OKABE_ITO.blue },
        { label: "Vorticity exp(−η²)", color: OKABE_ITO.vermilion, dashed: true },
      ]);
    } else {
      const f = drawPaperPlotFrame(ctx, cw, ch, niceTicks(0, sim.yMaxMM, 5), [0, 0.25, 0.5, 0.75, 1.0], "Distance from Plate y (mm)", "Normalized Velocity u / U");
      const cols = [OKABE_ITO.sky, OKABE_ITO.blue, OKABE_ITO.green, OKABE_ITO.orange, OKABE_ITO.vermilion];
      sim.curves.forEach((c, idx) => {
        strokeSeries(
          ctx,
          c.pts.map((p) => [p.yMM, p.uNorm]),
          f.mapX,
          f.mapY,
          c.isCurrent ? OKABE_ITO.vermilion : cols[idx % cols.length],
          false,
          c.isCurrent ? 2.8 : 1.7
        );
      });
      if (v.bounded) {
        strokeSeries(ctx, [[0, 1], [v.H_mm, 0]], f.mapX, f.mapY, "#1e293b", true, 2.0);
      }
      drawPaperLegend(ctx, cw, f.pad, [
        { label: "Multi-Time u(y,t)", color: OKABE_ITO.blue },
        { label: "Active t", color: OKABE_ITO.vermilion },
        ...(v.bounded ? [{ label: "Steady Couette", color: "#1e293b", dashed: true }] : []),
      ]);
    }
  }
}
