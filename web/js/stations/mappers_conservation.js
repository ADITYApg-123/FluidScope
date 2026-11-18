/**
 * Conservation Traps & 2D D2Q9 LBM Tunnel Scene Mappers
 * (Hydraulic Jump Ch. 12.4, Sudden Expansion Ch. 11.5, Accelerating/Free-Fall Tank Ch. 2.9, 2D LBM Tunnel).
 * Wave 1 — Agent D implementation with Fs(h), pipe EGL/HGL, vertical g_eff/az vector fix & fmtNum.
 */
import { fmtNum } from "../core/color_scales.js";

const GRAVITY = 9.81;
const WATER_RHO = 1000.0;

function formatSci(val, digits = 2) {
  const n = Number(val);
  if (!Number.isFinite(n)) return "-";
  if (Math.abs(n) < 1e-12) return (0).toFixed(digits);
  return n.toExponential(digits);
}

export function buildHydraulicJumpScene(d) {
  const cp = d.channel_profile;
  const poly = cp.x.map((xv, i) => [xv, cp.h_true[i]]);
  poly.push([cp.x[cp.x.length - 1], 0.0], [cp.x[0], 0.0]);
  const naiveCurve = cp.x.map((xv, i) => [xv, cp.h_naive[i]]);

  const q = Number(d.q_unit) || 0;
  const eglCurve = cp.x.map((xv, i) => {
    const hVal = Math.max(Number(cp.h_true[i]) || 0.02, 0.02);
    const vLoc = q / hVal;
    return [xv, hVal + (vLoc * vLoc) / (2.0 * GRAVITY)];
  });
  const eglFlatRef = [
    [cp.x[0], d.Es1],
    [cp.x[cp.x.length - 1], d.Es1],
  ];

  const yMax = Math.max(d.h2_naive_bernoulli || 0, d.h2_true || 0, (d.Es1 || 0) * 1.08, (d.hc || 0) * 1.4, 0.5) * 1.24;
  const nx = 26;
  const ny = 18;
  const xs = Array.from({ length: nx }, (_, i) => (i / (nx - 1)) * 6.0);
  const ys = Array.from({ length: ny }, (_, j) => (j / (ny - 1)) * yMax);

  const interpH = (xVal) => {
    for (let k = 0; k < cp.x.length - 1; k++) {
      if (xVal >= cp.x[k] && xVal <= cp.x[k + 1]) {
        const f = (xVal - cp.x[k]) / (cp.x[k + 1] - cp.x[k]);
        return cp.h_true[k] + f * (cp.h_true[k + 1] - cp.h_true[k]);
      }
    }
    return cp.h_true[cp.h_true.length - 1];
  };

  const U = [];
  const V = [];
  for (let j = 0; j < ny; j++) {
    const rowU = [];
    const rowV = [];
    for (let i = 0; i < nx; i++) {
      const xv = xs[i];
      const yv = ys[j];
      const hx = interpH(xv);
      if (yv > hx * 0.98 || yv <= 0) {
        rowU.push(null);
        rowV.push(null);
      } else {
        const vLocal = d.q_unit / Math.max(hx, 0.05);
        const inRoller = d.can_jump && xv >= 2.0 && xv <= 3.3 && yv > 0.58 * hx;
        rowU.push(inRoller ? -vLocal * 0.45 : vLocal);
        rowV.push(inRoller ? -0.35 * (xv - 2.6) : 0.0);
      }
    }
    U.push(rowU);
    V.push(rowV);
  }

  const solidRects = [
    [0.0, -0.1 * yMax, 6.0, 0.1 * yMax],
    [0.25, d.h1, 0.16, yMax - d.h1],
  ];

  const eddies = d.can_jump
    ? [{ cx: 2.65, cy: 0.72 * d.h2_true, rx: 0.42, ry: 0.18 * d.h2_true, ccw: true, color: "coral" }]
    : [];

  const dashedGuides = [
    { pts: eglCurve, color: "amber", width: 2.0, dash: [6, 3] },
  ];
  if (d.can_jump) {
    dashedGuides.push({ pts: eglFlatRef, color: "coral", width: 1.4, dash: [3, 4] });
  }

  const annotations = [
    {
      x: 1.25,
      y: Math.min(yMax * 0.88, Math.max(d.h1 + 0.17 * yMax, d.hc + 0.11 * yMax)),
      text: `Fr₁ = ${fmtNum(d.Fr1, 2)}`,
      color: "primary",
    },
    {
      x: 4.55,
      y: Math.max(0.16 * yMax, d.h2_true * 0.52),
      text: `True HGL h₂ = ${fmtNum(d.h2_true, 3)} m`,
      color: "primary",
    },
  ];
  if (d.can_jump) {
    annotations.push(
      {
        x: 3.55,
        y: Math.min(yMax * 0.91, d.h2_naive_bernoulli + 0.06 * yMax),
        text: `Naive h₂ = ${fmtNum(d.h2_naive_bernoulli, 3)} m`,
        color: "coral",
      },
      {
        x: 5.05,
        y: Math.min(yMax * 0.94, d.Es1 + 0.07 * yMax),
        text: `EGL loss hj = ${fmtNum(d.head_loss_hj, 3)} m`,
        color: "amber",
      }
    );
  }

  return {
    bounds: [0, 6.0, -0.1 * yMax, yMax],
    aspectLock: false,
    xLabel: "Apron distance x (m)",
    yLabel: "Elevation / Grade Line Head (m)",
    field: { bounds: [0, 6.0, 0, yMax], xs, ys, U, V },
    fluidPoly: poly,
    naiveLine: naiveCurve,
    dashedGuides,
    solidRects,
    eddies,
    hLines: [{ y: d.hc, color: "#475569", dashed: true, label: `Critical hc = ${fmtNum(d.hc, 2)} m` }],
    annotations,
    defaultHud: `Fr₁ = ${fmtNum(d.Fr1, 2)} | True h₂ = ${fmtNum(d.h2_true, 3)} m | Head loss hj = ${fmtNum(d.head_loss_hj, 3)} m | EGL₁ = ${fmtNum(d.Es1, 3)} → EGL₂ = ${fmtNum(d.Es2, 3)} m`,
  };
}

export function buildSuddenExpansionScene(d) {
  const r1 = d.D1 / 2;
  const r2 = d.D2 / 2;
  const yLim = r2 * 1.38;

  const solidRects = [
    [-1.0, r1, 1.0, yLim - r1],
    [-1.0, -yLim, 1.0, yLim - r1],
    [0.0, r2, 3.0, yLim - r2],
    [0.0, -yLim, 3.0, yLim - r2],
  ];

  const nx = 24;
  const ny = 21;
  const xs = Array.from({ length: nx }, (_, i) => -1.0 + (i / (nx - 1)) * 4.0);
  const ys = Array.from({ length: ny }, (_, j) => -r2 + (j / (ny - 1)) * (2 * r2));
  const U = [];
  const V = [];
  for (let j = 0; j < ny; j++) {
    const rowU = [];
    const rowV = [];
    const yv = ys[j];
    for (let i = 0; i < nx; i++) {
      const xv = xs[i];
      if (xv < 0 && Math.abs(yv) > r1) {
        rowU.push(null);
        rowV.push(null);
        continue;
      }
      if (xv < 0) {
        rowU.push(d.V1 * (1 - 0.15 * (yv / r1) ** 2));
        rowV.push(0);
      } else {
        const halfJet = r1 + (r2 - r1) * Math.tanh(xv / 1.15);
        const blend = Math.tanh(xv / 1.15);
        const uJet = d.V1 * (1 - blend) + d.V2 * blend;
        if (Math.abs(yv) <= halfJet) {
          rowU.push(uJet * (1 - 0.18 * (yv / Math.max(halfJet, 1e-4)) ** 2));
          rowV.push((yv / Math.max(r2, 1e-4)) * (d.V1 - d.V2) * 0.18 * Math.exp(-xv * 1.1));
        } else {
          const rec = -0.32 * d.V1 * Math.exp(-xv * 1.3);
          rowU.push(rec);
          rowV.push((yv > 0 ? -1 : 1) * 0.15 * d.V1 * Math.exp(-xv * 1.3));
        }
      }
    }
    U.push(rowU);
    V.push(rowV);
  }

  const eddies = [
    { cx: 0.42, cy: 0.52 * (r1 + r2), rx: 0.28, ry: 0.34 * (r2 - r1), ccw: true, color: "coral" },
    { cx: 0.42, cy: -0.52 * (r1 + r2), rx: 0.28, ry: 0.34 * (r2 - r1), ccw: false, color: "coral" },
  ];

  const annotations = [
    { x: -0.5, y: 0, text: `V₁ = ${fmtNum(d.V1, 2)} m/s`, color: "primary" },
    { x: 0.62, y: 0.58 * (r1 + r2), text: `Dead-zone eddies (p' ≈ p₁)`, color: "coral" },
    { x: 2.32, y: 0, text: `V₂ = ${fmtNum(d.V2, 2)} m/s`, color: "teal" },
  ];

  return {
    bounds: [-1.0, 3.0, -yLim, yLim],
    aspectLock: false,
    xLabel: "Axial distance x (m) — sudden step at x = 0",
    yLabel: "Radial pipe coordinate y (m)",
    field: { bounds: [-1.0, 3.0, -r2, r2], xs, ys, U, V },
    fluidPoly: [[-1, -r1], [0, -r1], [0, -r2], [3, -r2], [3, r2], [0, r2], [0, r1], [-1, r1]],
    solidRects,
    eddies,
    annotations,
    defaultHud: `True Δp = ${fmtNum(d.dp_true / 1000, 2)} kPa vs Naive = ${fmtNum(d.dp_naive / 1000, 2)} kPa | Borda Loss hL = ${fmtNum(d.head_loss_hL, 3)} m`,
  };
}

export function buildAccelTankScene(d) {
  const L = d.length;
  const H = d.tank_height;
  const poly = d.x.map((xv, i) => [xv, d.z_surface[i]]);
  poly.push([d.x[d.x.length - 1], 0], [d.x[0], 0]);

  const wallT = 0.035;
  const holeHalf = 0.04;
  const solidRects = [
    [-0.5 * L - wallT, -wallT, wallT, H + wallT],
    [0.5 * L, -wallT, wallT, H + wallT],
    [-0.5 * L - wallT, -wallT, 0.5 * L + wallT - holeHalf, wallT],
    [holeHalf, -wallT, 0.5 * L + wallT - holeHalf, wallT],
  ];

  const dashedGuides = [];
  for (const frac of [0.35, 0.68]) {
    const pts = [];
    for (let i = 0; i < d.x.length; i += 6) {
      const zIso = d.z_surface[i] * frac;
      if (zIso > 0.01) pts.push([d.x[i], zIso]);
    }
    if (pts.length >= 2) dashedGuides.push({ pts, color: "primary", width: 1.0, dash: [3, 4] });
  }

  const orificeJet = [];
  const annotations = [];
  if (d.orifice_v_true > 0.05) {
    const xOffset = -0.02 * (d.ax || 0);
    for (let k = 0; k <= 16; k++) {
      const frac = k / 16;
      const jy = -frac * 0.34 * H;
      const jx = xOffset * frac;
      orificeJet.push([jx, jy]);
    }
    annotations.push({
      x: 0.25 * L,
      y: -0.22 * H,
      text: `Orifice Jet V = ${fmtNum(d.orifice_v_true, 2)} m/s`,
      color: "primary",
    });
  } else {
    annotations.push({
      x: 0,
      y: -0.18 * H,
      text: `FREE FALL (dp/dz = 0) ⇒ NO LEAK!`,
      color: "coral",
    });
  }

  // Always render vertical g_eff / az vector arrow alongside horizontal ax without clipping or overlapping labels
  const gEff = Math.max(0, Number(d.g_effective) || 0);
  const azVal = Number(d.az) || 0;
  const isFreeFall = gEff < 0.05;
  const vertScale = Math.max(0.42, Math.min(1.3, gEff / GRAVITY));

  const vectorsOverlay = [];
  if (Math.abs(d.ax) > 0.05) {
    const dir = d.ax > 0 ? 1 : -1;
    vectorsOverlay.push({
      x0: dir > 0 ? -0.52 * L : -0.24 * L,
      y0: H * 1.31,
      dx: 0.28 * L * dir,
      dy: 0,
      color: "amber",
      label: `ax = ${fmtNum(d.ax, 2)} m/s²`,
    });
  }

  vectorsOverlay.push({
    x0: 0.36 * L,
    y0: H * 1.18,
    dx: 0,
    dy: -0.17 * H * vertScale,
    color: isFreeFall ? "coral" : "amber",
    label: isFreeFall
      ? `az = ${fmtNum(azVal, 2)} (g_eff=0)`
      : Math.abs(azVal) > 0.05
      ? `g_eff=${fmtNum(gEff, 2)} (az=${fmtNum(azVal, 1)})`
      : `g_eff = ${fmtNum(gEff, 2)} m/s²`,
  });

  return {
    bounds: [-L * 0.88, L * 0.88, -0.38 * H, H * 1.64],
    aspectLock: true,
    xLabel: "Tank horizontal position x (m)",
    yLabel: "Vertical elevation z (m)",
    field: null,
    fluidPoly: poly,
    naiveLine: [[d.x[0], d.h0], [d.x[d.x.length - 1], d.h0]],
    solidRects,
    dashedGuides,
    orificeJet,
    vectorsOverlay,
    hLines: [{ y: d.tank_height, color: "#475569", dashed: true, label: "Tank Top Rim" }],
    annotations,
    defaultHud: `Tilt = ${fmtNum(d.tilt_deg, 1)}° | g_eff = ${fmtNum(gEff, 2)} m/s² | Orifice V_true = ${fmtNum(d.orifice_v_true, 2)} m/s vs Naive = ${fmtNum(d.orifice_v_naive_static, 2)} m/s`,
  };
}

export function mapConservationToScene(family, d, options = {}) {
  if (family === "hydraulic_jump") {
    const plotView = options.jumpPlotView || options.plotView || "es";
    const isFs = plotView === "fs";
    const hArr = d.es_diagram?.h || [];
    const esArr = d.es_diagram?.Es || [];
    const q = Number(d.q_unit) || 0;

    const fsAt = (hVal) => (q * q) / (GRAVITY * Math.max(hVal, 1e-6)) + 0.5 * hVal * hVal;
    const fsArr = hArr.map((hv) => fsAt(hv));
    const fs1 = fsAt(d.h1);
    const fs2 = fsAt(d.h2_true);
    const fsNaive = fsAt(d.h2_naive_bernoulli);
    const fsFlat = hArr.map(() => fs1);

    const esYMax = Math.max((d.Es1 || 0) * 2.0, (d.h2_naive_bernoulli || 0) * 1.35, 1.5);
    const fsYMax = Math.max(fs1 * 2.2, fsNaive * 1.25, 0.8);

    const plot = isFs
      ? {
          probeAxis: "x",
          xLabel: "Flow depth h (m)",
          yLabel: "Specific force Fs = q²/(gh) + h²/2 (m²)",
          xShort: "h",
          shadeDiff: false,
          bounds: { ymin: 0, ymax: fsYMax },
          series: [
            { name: "Specific Force Fs(h)", x: hArr, y: fsArr, color: "primary" },
            { name: "Conserved Fs₁ = const", x: hArr, y: fsFlat, color: "amber", dashed: true },
          ],
          vMarkers: [
            { x: d.h1, label: "h₁", color: "#475569" },
            { x: d.h2_true, label: "h₂ True (Fs₁=Fs₂)", color: "primary" },
            ...(d.can_jump ? [{ x: d.h2_naive_bernoulli, label: "h₂ Naive (Violates Fs!)", color: "coral" }] : []),
          ],
          hMarkers: [{ y: fs1, label: `Fs₁ = Fs₂ = ${fmtNum(fs1, 3)} m²`, color: "amber" }],
          defaultHud: `Momentum Conserved: Fs(h₁) = ${fmtNum(fs1, 3)} m² = Fs(h₂) = ${fmtNum(fs2, 3)} m² | Naive Fs(h₂_naive) = ${fmtNum(fsNaive, 3)} m²`,
        }
      : {
          probeAxis: "x",
          xLabel: "Flow depth h (m)",
          yLabel: "Specific energy Es = h + V²/(2g) (m)",
          xShort: "h",
          bounds: { ymin: 0, ymax: esYMax },
          series: [{ name: "Specific Energy Es(h)", x: hArr, y: esArr, color: "primary" }],
          vMarkers: [
            { x: d.h1, label: "h₁", color: "#475569" },
            { x: d.h2_true, label: "h₂ True", color: "primary" },
            ...(d.can_jump ? [{ x: d.h2_naive_bernoulli, label: "h₂ Naive", color: "coral" }] : []),
          ],
          hMarkers: [
            { y: d.Es1, label: `Es₁ = ${fmtNum(d.Es1, 3)} m`, color: "#475569" },
            ...(d.can_jump ? [{ y: d.Es2, label: `Es₂ = ${fmtNum(d.Es2, 3)} m (-hj)`, color: "amber" }] : []),
          ],
          defaultHud: `Fr₁ = ${fmtNum(d.Fr1, 2)} | h₂ True = ${fmtNum(d.h2_true, 3)} m vs Naive = ${fmtNum(d.h2_naive_bernoulli, 3)} m | Loss hj = ${fmtNum(d.head_loss_hj, 3)} m`,
        };

    return {
      primaryTitle: "Hydraulic Jump Profile, EGL/HGL & Roller Eddy",
      secondaryTitle: isFs
        ? "Specific Force Fs(h): Momentum Jump Conservation (Fs₁ = Fs₂)"
        : "Specific Energy Es(h): Momentum Conjugate vs. No-Loss Trap",
      primaryLegend: [
        { label: "True HGL h(x)", color: "primary" },
        { label: "Naive No-Loss h₂", color: "coral", dashed: true },
        { label: "True EGL(x)", color: "amber", dashed: true },
      ],
      secondaryLegend: isFs
        ? [
            { label: "Specific Force Fs(h)", color: "primary" },
            { label: "Conserved Fs₁ = const", color: "amber", dashed: true },
          ]
        : [
            { label: "Specific Energy Es(h)", color: "primary" },
            { label: "Energy Drop hj", color: "amber", dashed: true },
          ],
      banner: {
        mainHtml:
          "<strong>Hydraulic Jump Momentum Balance (Ch. 12.4):</strong> Supercritical flow h₁ jumps through a turbulent surface roller to subcritical conjugate depth h₂ while conserving Specific Force Fs.",
        trapHtml:
          "Bernoulli Trap: Constant Specific Energy Es₁ = Es₂ ignores irreversible roller loss hj and overpredicts conjugate depth h₂!",
      },
      scene: buildHydraulicJumpScene(d),
      plot,
      drawerMetrics: [
        { k: "Fr₁", v: fmtNum(d.Fr1, 2), color: d.can_jump ? "var(--accent)" : "var(--coral)" },
        { k: "h₂ True", v: `${fmtNum(d.h2_true, 3)} m`, color: "var(--accent)" },
        { k: "h₂ Naive", v: `${fmtNum(d.h2_naive_bernoulli, 3)} m`, color: "var(--coral)" },
        { k: "Loss hj", v: `${fmtNum(d.head_loss_hj, 3)} m`, color: "var(--amber)" },
        { k: "Fs₁ = Fs₂", v: `${fmtNum(fs1, 3)} m²` },
      ],
      drawerCards: [
        {
          k: "Conjugate Depth h₂ (Eq. 12.46)",
          v: `${fmtNum(d.h2_true, 3)} m (Jump Δh = ${fmtNum(d.jump_height, 3)} m, Fr₂ = ${fmtNum(d.Fr2, 2)})`,
          tone: "accent",
        },
        {
          k: "Naive Alternate h₂ Trap",
          v: `${fmtNum(d.h2_naive_bernoulli, 3)} m (+${fmtNum(d.depth_overprediction, 3)} m error, Fs_naive = ${fmtNum(fsNaive, 3)} m²)`,
          tone: "coral",
        },
        {
          k: "Specific Force Conserved",
          v: `Fs₁ = ${fmtNum(fs1, 4)} m² = Fs₂ = ${fmtNum(fs2, 4)} m²`,
          tone: "ok",
        },
        {
          k: "Roller Dissipation (Eq. 12.48)",
          v: `hj = ${fmtNum(d.head_loss_hj, 3)} m | Power = ${fmtNum(d.power_loss_W / 1000, 2)} kW`,
          tone: "amber",
        },
      ],
      deepCards: [
        {
          k: "Bélanger & Specific Force Balance",
          tex: String.raw`\frac{h_2}{h_1} = \frac{1}{2}\left(\sqrt{1 + 8Fr_1^2} - 1\right), \qquad F_s = \frac{q^2}{gh} + \frac{h^2}{2}`,
        },
        {
          k: "Specific Energy & Critical Depth",
          v: `Es₁ = ${fmtNum(d.Es1, 3)} m → Es₂ = ${fmtNum(d.Es2, 3)} m | hc = ${fmtNum(d.hc, 3)} m (Es_min = ${fmtNum(d.Es_min, 3)} m)`,
        },
        {
          k: "Channel Geometry & Discharge",
          v: `Width b = ${fmtNum(d.width, 2)} m | Q = ${fmtNum(d.Q_total, 3)} m³/s | q = ${fmtNum(d.q_unit, 3)} m²/s | V₂ = ${fmtNum(d.v2_true, 2)} m/s`,
        },
      ],
    };
  }

  if (family === "sudden_expansion") {
    const plotView = options.expPlotView || options.plotView || "pressure";
    const isHead = plotView === "head";
    const gammaWater = WATER_RHO * GRAVITY;
    const xs = d.x || [];
    const hglTrue = (d.p_true_x || []).map((pv) => (pv - d.p1) / gammaWater);
    const hglNaive = (d.p_naive_x || []).map((pv) => (pv - d.p1) / gammaWater);
    const eglUpstream = (d.V1 * d.V1) / (2.0 * GRAVITY);
    const eglDownstream = eglUpstream - d.head_loss_hL;

    // Velocity profile matched to conservation.py p_true_x blend ensuring monotonic EGL decay
    const eglTrue = xs.map((xv, i) => {
      const vx = xv < 0 ? d.V1 : d.V1 - (d.V1 - d.V2) * Math.tanh(Math.max(0.0, xv) / 0.65);
      return (hglTrue[i] ?? 0) + (vx * vx) / (2.0 * GRAVITY);
    });
    const eglNaive = xs.map(() => eglUpstream);

    const plot = isHead
      ? {
          probeAxis: "x",
          xLabel: "Axial position x (m)",
          yLabel: "Head relative to inlet p₁/(ρg) (m)",
          xShort: "x",
          shadeDiff: true,
          vMarkers: [{ x: 0.0, label: "Step x = 0", color: "#475569" }],
          hMarkers: [
            { y: eglUpstream, label: `EGL₁ = ${fmtNum(eglUpstream, 3)} m`, color: "#475569" },
            { y: eglDownstream, label: `EGL₂ = ${fmtNum(eglDownstream, 3)} m (-hL)`, color: "amber" },
          ],
          series: [
            { name: "True EGL(x)", x: xs, y: eglTrue, color: "amber" },
            { name: "Lossless EGL₁", x: xs, y: eglNaive, color: "coral", dashed: true },
            { name: "True HGL(x)", x: xs, y: hglTrue, color: "primary" },
            { name: "Naive Bernoulli HGL", x: xs, y: hglNaive, color: "teal", dashed: true },
          ],
          defaultHud: `Inlet EGL₁ = ${fmtNum(eglUpstream, 3)} m → Downstream EGL₂ = ${fmtNum(eglDownstream, 3)} m | Irreversible Loss hL = ${fmtNum(d.head_loss_hL, 3)} m`,
        }
      : {
          probeAxis: "x",
          xLabel: "Axial position x (m)",
          yLabel: "Pressure recovery p - p₁ (kPa)",
          xShort: "x",
          shadeDiff: true,
          vMarkers: [{ x: 0.0, label: "Step x = 0", color: "#475569" }],
          series: [
            { name: "True Δp (kPa)", x: xs, y: (d.p_true_x || []).map((v) => (v - d.p1) / 1000), color: "primary" },
            { name: "Naive Δp (kPa)", x: xs, y: (d.p_naive_x || []).map((v) => (v - d.p1) / 1000), color: "coral", dashed: true },
          ],
          defaultHud: `True Δp = ${fmtNum(d.dp_true / 1000, 2)} kPa vs Naive = ${fmtNum(d.dp_naive / 1000, 2)} kPa | Loss hL = ${fmtNum(d.head_loss_hL, 3)} m`,
        };

    return {
      primaryTitle: "Borda–Carnot Sudden Pipe Expansion & Corner Eddies",
      secondaryTitle: isHead
        ? "Energy & Hydraulic Grade Lines: Irreversible Borda–Carnot h_L Step"
        : "Pressure Recovery Δp(x): Momentum Balance vs. Ideal Bernoulli",
      primaryLegend: [
        { label: "Expanding Pipe Jet", color: "primary" },
        { label: "Dead-Zone Eddies", color: "coral" },
        { label: "Downstream V₂", color: "teal" },
      ],
      secondaryLegend: isHead
        ? [
            { label: "True EGL(x)", color: "amber" },
            { label: "Lossless EGL₁", color: "coral", dashed: true },
            { label: "True HGL(x)", color: "primary" },
            { label: "Naive HGL", color: "teal", dashed: true },
          ]
        : [
            { label: "True Δp(x)", color: "primary" },
            { label: "Naive Bernoulli Δp(x)", color: "coral", dashed: true },
          ],
      banner: {
        mainHtml:
          "<strong>Borda–Carnot Pipe Expansion (Eq. 11.18):</strong> Fast upstream jet V₁ expands into downstream pipe V₂ while corner annular eddies hold shoulder pressure p' ≈ p₁.",
        trapHtml:
          "Ideal Bernoulli predicts ½ρ(V₁² - V₂²), missing Borda eddy loss hL = (V₁ - V₂)² / (2g)!",
      },
      scene: buildSuddenExpansionScene(d),
      plot,
      drawerMetrics: [
        { k: "Δp True", v: `${fmtNum(d.dp_true / 1000, 2)} kPa`, color: "var(--accent)" },
        { k: "Δp Naive", v: `${fmtNum(d.dp_naive / 1000, 2)} kPa`, color: "var(--coral)" },
        { k: "Loss hL", v: `${fmtNum(d.head_loss_hL, 3)} m`, color: "var(--amber)" },
        { k: "V₂", v: `${fmtNum(d.V2, 2)} m/s` },
        { k: "P_loss", v: `${fmtNum(d.power_loss_W, 1)} W` },
      ],
      drawerCards: [
        {
          k: "Momentum Pressure Recovery (Eq. 11.21)",
          v: `ρV₂(V₁ - V₂) = ${fmtNum(d.dp_true / 1000, 2)} kPa`,
          tone: "accent",
        },
        {
          k: "Naive Bernoulli Overestimate",
          v: `½ρ(V₁² - V₂²) = ${fmtNum(d.dp_naive / 1000, 2)} kPa (+${fmtNum(d.dp_overestimation / 1000, 2)} kPa trap!)`,
          tone: "coral",
        },
        {
          k: "Borda–Carnot Head Loss (Eq. 11.23)",
          v: `hL = (V₁ - V₂)²/(2g) = ${fmtNum(d.head_loss_hL, 3)} m`,
          tone: "amber",
        },
        {
          k: "Closed-Pipe Grade Step",
          v: `EGL: ${fmtNum(eglUpstream, 3)} → ${fmtNum(eglDownstream, 3)} m | HGL gain: ${fmtNum(d.dp_true / gammaWater, 3)} m`,
        },
      ],
      deepCards: [
        {
          k: "Borda–Carnot Loss & Momentum Theorem",
          tex: String.raw`\Delta p = \rho V_2(V_1 - V_2), \qquad h_L = \frac{(V_1 - V_2)^2}{2g}`,
        },
        {
          k: "Diameter & Area Continuity",
          v: `D₁ = ${fmtNum(d.D1, 3)} m, D₂ = ${fmtNum(d.D2, 3)} m | A₁/A₂ = ${fmtNum(d.area_ratio, 3)}`,
        },
        {
          k: "Absolute Static & Power Dissipation",
          v: `p₂,true = ${fmtNum(d.p2_true / 1000, 2)} kPa vs p₂,naive = ${fmtNum(d.p2_naive / 1000, 2)} kPa | P_loss = ${fmtNum(d.power_loss_W, 1)} W`,
        },
      ],
    };
  }

  if (family === "accelerating_tank") {
    const isFreeFall = Number(d.g_effective) < 0.05;
    return {
      primaryTitle: `Non-Inertial Tank & Bottom Orifice (${String(d.regime || "").replaceAll("_", " ")})`,
      secondaryTitle: "Bottom Hydrostatic Pressure: Effective Frame vs. Static Naive",
      primaryLegend: [
        { label: "Actual Surface & Jet", color: "primary" },
        { label: "Static Flat Level", color: "coral", dashed: true },
        { label: "Frame ax / g_eff", color: isFreeFall ? "coral" : "amber" },
      ],
      secondaryLegend: [
        { label: "Actual p_bot (kPa)", color: "primary" },
        { label: "Naive Static (kPa)", color: "coral", dashed: true },
      ],
      banner: {
        mainHtml: isFreeFall
          ? "<strong>Free-Fall Hydrostatic Collapse (p. 99):</strong> When tank acceleration reaches az = -g, g_eff vanishes ⇒ gauge pressure drops to zero everywhere and bottom orifice DOES NOT LEAK!"
          : "<strong>Non-Inertial Tank Hydrostatics (Eq. 2.86):</strong> Constant-pressure isobars tilt normal to g_eff = (g + az)ẑ - ax x̂, altering base pressure and orifice exit speed.",
        trapHtml:
          "Torricelli Trap: Blindly applying √(2gh₀) misses weightlessness in free fall (V_exit = 0.00 m/s) or over/underpredicts efflux under az / tilt!",
      },
      scene: buildAccelTankScene(d),
      plot: {
        probeAxis: "x",
        xLabel: "Horizontal tank coordinate x (m)",
        yLabel: "Bottom gauge pressure p (kPa)",
        xShort: "x",
        shadeDiff: true,
        series: [
          { name: "True p_bot (kPa)", x: d.x, y: d.p_bottom_true_kPa, color: "primary" },
          { name: "Static Naive (kPa)", x: d.x, y: d.p_bottom_naive_kPa, color: "coral", dashed: true },
        ],
        defaultHud: `g_eff = ${fmtNum(d.g_effective, 2)} m/s² | Tilt = ${fmtNum(d.tilt_deg, 1)}° | Orifice V_true = ${fmtNum(d.orifice_v_true, 2)} m/s vs Naive = ${fmtNum(d.orifice_v_naive_static, 2)} m/s`,
      },
      drawerMetrics: [
        { k: "g_eff", v: `${fmtNum(d.g_effective, 2)} m/s²`, color: isFreeFall ? "var(--coral)" : "var(--amber)" },
        { k: "Tilt θ", v: `${fmtNum(d.tilt_deg, 1)}°`, color: "var(--accent)" },
        { k: "True V_exit", v: `${fmtNum(d.orifice_v_true, 2)} m/s`, color: isFreeFall ? "var(--coral)" : "var(--accent)" },
        { k: "Naive √2gh", v: `${fmtNum(d.orifice_v_naive_static, 2)} m/s`, color: "var(--coral)" },
      ],
      drawerCards: [
        {
          k: "Active Regime (Eq. 2.86)",
          v: String(d.regime || "").replaceAll("_", " "),
          tone: isFreeFall ? "coral" : "amber",
        },
        {
          k: "Effective Gravity Vector g_eff",
          v: `g + az = ${fmtNum(d.g_effective, 3)} m/s² (ax = ${fmtNum(d.ax, 2)}, az = ${fmtNum(d.az, 2)} m/s²)`,
          tone: isFreeFall ? "coral" : "",
        },
        {
          k: "Free-Surface Slope (Eq. 2.87)",
          v: isFreeFall ? "Weightless surface stays flat (θ = 0.00°)" : `tan θ = -ax/(g + az) ⇒ θ = ${fmtNum(d.tilt_deg, 2)}°`,
        },
        {
          k: "Bottom Hole Orifice Comparison",
          v: isFreeFall
            ? `True: 0.00 m/s (NO LEAK!) vs. Torricelli Naive: ${fmtNum(d.orifice_v_naive_static, 2)} m/s`
            : `True: ${fmtNum(d.orifice_v_true, 2)} m/s vs. Static Naive: ${fmtNum(d.orifice_v_naive_static, 2)} m/s`,
          tone: isFreeFall ? "coral" : "accent",
        },
      ],
      deepCards: [
        {
          k: "Non-Inertial Hydrostatic Gradient",
          tex: String.raw`\nabla p = \rho(\mathbf{g} - \mathbf{a}_{\text{frame}}), \qquad V_{\text{exit}} = \sqrt{2(g + a_z)\,h_{\text{center}}}`,
        },
        {
          k: "Tank Base Gauge Pressure Span",
          v: `Min = ${fmtNum(Math.min(...(d.p_bottom_true_kPa || [0])), 3)} kPa | Max = ${fmtNum(Math.max(...(d.p_bottom_true_kPa || [0])), 3)} kPa`,
        },
        {
          k: "Tank Geometry & Rim Check",
          v: `L = ${fmtNum(d.length, 2)} m, H = ${fmtNum(d.tank_height, 2)} m, h₀ = ${fmtNum(d.h0, 2)} m | Spilled: ${d.spilled ? "YES" : "NO"}`,
        },
      ],
    };
  }

  // lbm_tunnel
  const scalarMode = options.lbmScalarMode === "speed" ? "speed" : "vorticity";
  const plotView = options.lbmPlotView || options.plotView || "wake";
  const isProfile = plotView === "profile" && d.downstream_profile?.y?.length;
  const presetLabel = String(d.preset || "custom").replaceAll("_", " ");
  const uProf = d.downstream_profile?.u_over_Uin || [];
  const uDefectMin = uProf.length ? Math.min(...uProf) : 0;

  return {
    primaryTitle:
      scalarMode === "speed"
        ? `2D D2Q9 LBM Speed |V|/Uin (${presetLabel})`
        : `2D D2Q9 LBM Vorticity Ωz (${presetLabel})`,
    secondaryTitle: isProfile
      ? "Downstream Velocity Profile u(y)/Uin at x = 0.75L"
      : "Downstream Wake Cross-Velocity uy(t)/Uin",
    primaryLegend:
      scalarMode === "speed"
        ? [
            { label: "Fast Jet |V|/Uin", color: "primary" },
            { label: "Wake Deficit |V|≈0", color: "#475569" },
          ]
        : [
            { label: "+Ωz CCW Vortex", color: "coral" },
            { label: "-Ωz CW Vortex", color: "primary" },
          ],
    secondaryLegend: isProfile
      ? [{ label: "u(y)/Uin @ 0.75L", color: "primary" }]
      : [{ label: "Wake uy(t)/Uin", color: "primary" }],
    banner: {
      mainHtml:
        "<strong>Live 2D D2Q9 Lattice–Boltzmann Wind Tunnel (Ch. 10):</strong> Solves viscous Navier–Stokes vortex shedding directly around true 1:1 bounce-back obstacle masks.",
      trapHtml:
        "Insert a wake splitter behind a bluff body — or draw your own cylinder + splitter — to see alternating Kármán shedding vanish!",
      trapTone: "insight",
    },
    scene: {
      bounds: d.field_2d.bounds,
      aspectLock: true,
      xLabel: "Tunnel length x / H",
      yLabel: "Channel height y / H",
      scalarMode,
      field: d.field_2d,
      solidRects: d.solid_rects,
      defaultHud: `Preset: ${presetLabel} | Re = ${fmtNum(d.reynolds, 0)} | Steps = ${d.n_steps ?? 450} | Field: ${scalarMode === "speed" ? "|V|" : "Ωz"}`,
    },
    plot: isProfile
      ? {
          probeAxis: "y",
          xLabel: "Axial velocity ratio u / Uin",
          yLabel: "Channel height y / H",
          xShort: "u/Uin",
          yShort: "y/H",
          vMarkers: [
            { x: 0.0, label: "u = 0", color: "#475569" },
            { x: 1.0, label: "Uin", color: "amber" },
          ],
          series: [
            {
              name: "u(y)/Uin",
              x: d.downstream_profile.u_over_Uin,
              y: d.downstream_profile.y,
              color: "primary",
            },
          ],
          defaultHud: `Downstream wake profile at 0.75L | Min u/Uin = ${fmtNum(uDefectMin, 3)} | Wake RMS = ${fmtNum(d.wake_oscillation_rms, 4)}`,
        }
      : {
          probeAxis: "x",
          xLabel: "Lattice iteration step (Re ≤ 160 BGK)",
          yLabel: "Normalized transverse velocity uy / Uin",
          xShort: "step",
          series: [
            {
              name: "Wake uy/Uin",
              x: (d.wake_uy_history || []).map((_, i) => i * 10),
              y: d.wake_uy_history || [],
              color: "primary",
            },
          ],
          defaultHud: `BGK τ = ${fmtNum(d.tau_bgk, 3)} | Ma = ${fmtNum(d.mach_inlet, 3)} | Wake RMS = ${fmtNum(d.wake_oscillation_rms, 4)}`,
        },
    drawerMetrics: [
      { k: "Re", v: fmtNum(d.reynolds, 0), color: "var(--accent)" },
      { k: "Steps", v: String(d.n_steps ?? 450) },
      { k: "Ma_in", v: fmtNum(d.mach_inlet, 3) },
      { k: "Wake RMS", v: fmtNum(d.wake_oscillation_rms, 4), color: d.wake_oscillation_rms > 0.02 ? "var(--coral)" : "var(--ok-green)" },
      { k: "Grid", v: `${d.grid_shape?.[1] ?? 160}×${d.grid_shape?.[0] ?? 52}` },
    ],
    drawerCards: [
      {
        k: "Operating Regime",
        v: `2D D2Q9 BGK · Re = ${fmtNum(d.reynolds, 0)}, τ = ${fmtNum(d.tau_bgk, 3)} (${d.n_steps ?? 450} steps)`,
        tone: "accent",
      },
      {
        k: "Vortex Shedding Metric",
        v: `RMS(uy_wake) = ${fmtNum(d.wake_oscillation_rms, 4)} (${d.wake_oscillation_rms > 0.02 ? "Active Kármán street" : "Damped wake"})`,
        tone: d.wake_oscillation_rms > 0.02 ? "coral" : "ok",
      },
      {
        k: "Lattice Stability Check",
        v: d.stable ? `Stable (Ma = ${fmtNum(d.mach_inlet, 3)} ≪ 0.3)` : "Unstable",
        tone: d.stable ? "ok" : "coral",
      },
      {
        k: "Wake Velocity Deficit @ 0.75L",
        v: `Min u/Uin = ${fmtNum(uDefectMin, 3)} | Solid blocks: ${(d.solid_rects || []).length}`,
      },
    ],
    deepCards: [
      {
        k: "D2Q9 BGK Collision & Viscosity",
        tex: String.raw`\nu_{\text{lat}} = \frac{2\tau - 1}{6}c_s^2, \qquad \Omega_z = \frac{\partial v}{\partial x} - \frac{\partial u}{\partial y}`,
      },
      {
        k: "Conserved Lattice Fluid Mass",
        v: `Σρ_fluid = ${formatSci(d.mass_fluid, 4)} | Preset: ${presetLabel}`,
      },
      {
        k: "Colormap Scalar Mode",
        v: scalarMode === "speed" ? "Sequential Speed |V|/Uin" : "Diverging Vorticity Ωz",
      },
    ],
  };
}
