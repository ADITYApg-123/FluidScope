/**
 * Conservation Traps & LBM Scene Mappers (Hydraulic Jump, Sudden Expansion, Accelerating Tank, 2D LBM Tunnel).
 * Wave 0 split from scene_mapper.js (owned by Agent D in Wave 1).
 */

export function buildHydraulicJumpScene(d) {
  const cp = d.channel_profile;
  const poly = cp.x.map((xv, i) => [xv, cp.h_true[i]]);
  poly.push([cp.x[cp.x.length - 1], 0.0], [cp.x[0], 0.0]);
  const naiveCurve = cp.x.map((xv, i) => [xv, cp.h_naive[i]]);

  const yMax = Math.max(d.h2_naive_bernoulli, d.h2_true, d.hc * 1.4) * 1.28;
  const nx = 26, ny = 18;
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

  const U = [], V = [];
  for (let j = 0; j < ny; j++) {
    const rowU = [], rowV = [];
    for (let i = 0; i < nx; i++) {
      const xv = xs[i], yv = ys[j];
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

  const annotations = [
    {
      x: 1.32,
      y: Math.max(d.h1 + 0.16 * yMax, d.hc + 0.11 * yMax),
      text: `Supercritical Fr₁ = ${d.Fr1.toFixed(2)}`,
      color: "primary",
    },
    { x: 4.7, y: d.h2_true + 0.12 * yMax, text: `True h₂ = ${d.h2_true.toFixed(3)} m`, color: "primary" },
  ];
  if (d.can_jump) {
    annotations.push({
      x: 4.7,
      y: d.h2_naive_bernoulli + 0.08 * yMax,
      text: `Naive h₂=${d.h2_naive_bernoulli.toFixed(3)} m`,
      color: "coral",
    });
  }

  return {
    bounds: [0, 6.0, -0.1 * yMax, yMax],
    aspectLock: false,
    xLabel: "Apron distance x (m)",
    yLabel: "Water depth h (m)",
    field: { bounds: [0, 6.0, 0, yMax], xs, ys, U, V },
    fluidPoly: poly,
    naiveLine: naiveCurve,
    solidRects,
    eddies,
    hLines: [{ y: d.hc, color: "#475569", dashed: true, label: `Critical hc = ${d.hc.toFixed(2)} m` }],
    annotations,
    defaultHud: `Fr₁ = ${d.Fr1.toFixed(2)} | True h₂ = ${d.h2_true.toFixed(3)} m | Head loss hj = ${d.head_loss_hj.toFixed(3)} m`,
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

  const nx = 24, ny = 21;
  const xs = Array.from({ length: nx }, (_, i) => -1.0 + (i / (nx - 1)) * 4.0);
  const ys = Array.from({ length: ny }, (_, j) => -r2 + (j / (ny - 1)) * (2 * r2));
  const U = [], V = [];
  for (let j = 0; j < ny; j++) {
    const rowU = [], rowV = [];
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
    { x: -0.5, y: 0, text: `V₁ = ${d.V1.toFixed(1)} m/s`, color: "primary" },
    { x: 0.55, y: 0.56 * (r1 + r2), text: `Dead-zone eddies (p' ≈ p₁)`, color: "coral" },
    { x: 2.35, y: 0, text: `V₂ = ${d.V2.toFixed(2)} m/s`, color: "teal" },
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
    defaultHud: `True Δp = ${(d.dp_true / 1000).toFixed(2)} kPa vs Naive = ${(d.dp_naive / 1000).toFixed(2)} kPa | Loss hL = ${d.head_loss_hL.toFixed(3)} m`,
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
      text: `Orifice Jet V = ${d.orifice_v_true.toFixed(2)} m/s`,
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

  const vectorsOverlay = [];
  if (Math.abs(d.ax) > 0.15) {
    const dir = d.ax > 0 ? 1 : -1;
    vectorsOverlay.push({
      x0: -0.18 * L * dir,
      y0: H * 1.15,
      dx: 0.36 * L * dir,
      dy: 0,
      color: "amber",
      label: `ax = ${d.ax.toFixed(1)} m/s²`,
    });
  } else {
    vectorsOverlay.push({
      x0: 0.38 * L,
      y0: H * 1.12,
      dx: 0,
      dy: -0.24 * H,
      color: d.g_effective < 0.05 ? "coral" : "amber",
      label: d.g_effective < 0.05 ? `az = -g (weightless)` : `g_eff = ${d.g_effective.toFixed(2)} m/s²`,
    });
  }

  return {
    bounds: [-L * 0.72, L * 0.72, -0.36 * H, H * 1.32],
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
    defaultHud: `Tilt = ${d.tilt_deg.toFixed(1)}° | Orifice Exit V_true = ${d.orifice_v_true.toFixed(2)} m/s vs Naive = ${d.orifice_v_naive_static.toFixed(2)} m/s`,
  };
}

export function mapConservationToScene(family, d, options = {}) {
  if (family === "hydraulic_jump") {
    return {
      primaryTitle: "Hydraulic Jump Profile, Roller Eddy & Sluice Gate",
      secondaryTitle: "Specific Energy Es(h): Momentum Jump vs. No-Loss Trap",
      primaryLegend: [
        { label: "True Depth h(x)", color: "primary" },
        { label: "Naive No-Loss h₂", color: "coral", dashed: true },
      ],
      secondaryLegend: [{ label: "Specific Energy Es(h)", color: "primary" }],
      banner: {
        mainHtml: "<strong>Hydraulic Jump Momentum Balance (Ch. 12.4):</strong> Supercritical flow h₁ jumps through a turbulent surface roller to subcritical conjugate depth h₂.",
        trapHtml: "Bernoulli Trap: Constant Specific Energy Es(h) = const ignores eddy dissipation and overpredicts h₂!",
      },
      scene: buildHydraulicJumpScene(d),
      plot: {
        xLabel: "Flow depth h (m)",
        yLabel: "Specific energy Es = h + V²/2g (m)",
        xShort: "h",
        series: [{ name: "Es(h)", x: d.es_diagram.h, y: d.es_diagram.Es, color: "primary" }],
        vMarkers: [
          { x: d.h1, label: "h₁", color: "#475569" },
          { x: d.h2_true, label: "h₂ True", color: "primary" },
          { x: d.h2_naive_bernoulli, label: "h₂ Naive", color: "coral" },
        ],
        defaultHud: `Fr₁ = ${d.Fr1.toFixed(2)} | h₂ True = ${d.h2_true.toFixed(3)} m vs Naive = ${d.h2_naive_bernoulli.toFixed(3)} m`,
      },
      drawerMetrics: [
        { k: "h₂ True", v: `${d.h2_true.toFixed(3)} m`, color: "var(--accent)" },
        { k: "Head Loss hj", v: `${d.head_loss_hj.toFixed(3)} m`, color: "var(--coral)" },
      ],
      drawerCards: [
        { k: "Conjugate Depth h₂", v: `${d.h2_true.toFixed(3)} m (Jump Δh = ${d.jump_height.toFixed(3)} m)`, tone: "accent" },
        { k: "Naive Alternate h₂", v: `${d.h2_naive_bernoulli.toFixed(3)} m (+${d.depth_overprediction.toFixed(3)} m error)`, tone: "coral" },
        { k: "Roller Power Dissipated", v: `${(d.power_loss_W / 1000).toFixed(2)} kW`, tone: "coral" },
      ],
    };
  }

  if (family === "sudden_expansion") {
    return {
      primaryTitle: "Borda–Carnot Sudden Pipe Expansion & Corner Eddies",
      secondaryTitle: "Pressure Recovery: Momentum Balance vs. Ideal Bernoulli",
      primaryLegend: [
        { label: "Main Pipe Jet", color: "primary" },
        { label: "Recirculation Eddies", color: "coral" },
      ],
      secondaryLegend: [
        { label: "True Δp(x)", color: "primary" },
        { label: "Naive Bernoulli Δp(x)", color: "coral", dashed: true },
      ],
      banner: {
        mainHtml: "<strong>Borda–Carnot Pipe Expansion (Eq. 11.18):</strong> Fast upstream jet V₁ expands into downstream pipe V₂ while corner annular eddies trap uniform pressure p' ≈ p₁.",
        trapHtml: "Ideal Bernoulli predicts ½ρ(V₁² - V₂²), missing Borda eddy loss hL = (V₁ - V₂)²/2g!",
      },
      scene: buildSuddenExpansionScene(d),
      plot: {
        xLabel: "Axial position x (m)",
        yLabel: "Pressure recovery p - p₁ (kPa)",
        xShort: "x",
        shadeDiff: true,
        series: [
          { name: "True Δp (kPa)", x: d.x, y: d.p_true_x.map((v) => (v - d.p1) / 1000), color: "primary" },
          { name: "Naive Δp (kPa)", x: d.x, y: d.p_naive_x.map((v) => (v - d.p1) / 1000), color: "coral", dashed: true },
        ],
        defaultHud: `True Δp = ${(d.dp_true / 1000).toFixed(2)} kPa vs Naive = ${(d.dp_naive / 1000).toFixed(2)} kPa`,
      },
      drawerMetrics: [
        { k: "Δp True", v: `${(d.dp_true / 1000).toFixed(2)} kPa`, color: "var(--accent)" },
        { k: "Δp Naive", v: `${(d.dp_naive / 1000).toFixed(2)} kPa`, color: "var(--coral)" },
      ],
      drawerCards: [
        { k: "Momentum Recovery", v: `${(d.dp_true / 1000).toFixed(2)} kPa`, tone: "accent" },
        { k: "Naive Bernoulli Trap", v: `${(d.dp_naive / 1000).toFixed(2)} kPa`, tone: "coral" },
        { k: "Borda–Carnot Head Loss", v: `hL = ${d.head_loss_hL.toFixed(3)} m` },
      ],
    };
  }

  if (family === "accelerating_tank") {
    return {
      primaryTitle: `Non-Inertial Tank & Bottom Orifice (${d.regime.replaceAll("_", " ")})`,
      secondaryTitle: "Bottom Hydrostatic Pressure: True Frame vs. Static Naive",
      primaryLegend: [
        { label: "Actual Surface & Jet", color: "primary" },
        { label: "Static Flat Level", color: "coral", dashed: true },
      ],
      secondaryLegend: [
        { label: "Actual p_bot (kPa)", color: "primary" },
        { label: "Naive Static (kPa)", color: "coral", dashed: true },
      ],
      banner: {
        mainHtml: "<strong>Non-Inertial Tank Hydrostatics (Eq. 2.86):</strong> Effective body force g_eff = (g + az) acts along the tilted surface normal, shifting both free surface tilt and base pressure.",
        trapHtml: "Free-Fall Trap: At az = -g, g_eff vanishes ⇒ pressure equals patm everywhere and bottom hole DOES NOT LEAK!",
      },
      scene: buildAccelTankScene(d),
      plot: {
        xLabel: "Horizontal tank coordinate x (m)",
        yLabel: "Bottom gauge pressure p (kPa)",
        xShort: "x",
        shadeDiff: true,
        series: [
          { name: "True p_bot (kPa)", x: d.x, y: d.p_bottom_true_kPa, color: "primary" },
          { name: "Static Naive (kPa)", x: d.x, y: d.p_bottom_naive_kPa, color: "coral", dashed: true },
        ],
        defaultHud: `Orifice Exit V_true = ${d.orifice_v_true.toFixed(2)} m/s vs Naive = ${d.orifice_v_naive_static.toFixed(2)} m/s`,
      },
      drawerMetrics: [
        { k: "Orifice Exit V", v: `${d.orifice_v_true.toFixed(2)} m/s`, color: d.orifice_v_true < 0.01 ? "var(--coral)" : "var(--accent)" },
      ],
      drawerCards: [
        { k: "Regime", v: d.regime, tone: "amber" },
        { k: "Surface Tilt θ", v: `${d.tilt_deg.toFixed(2)}°` },
        { k: "Orifice Speed Check", v: d.g_effective < 0.01 ? "Weightless: V_exit = 0 (No leak!)" : `True ${d.orifice_v_true.toFixed(2)} m/s vs Static ${d.orifice_v_naive_static.toFixed(2)} m/s`, tone: d.g_effective < 0.01 ? "coral" : "accent" },
      ],
    };
  }

  // lbm_tunnel
  return {
    primaryTitle: `Live 2D D2Q9 LBM Wind Tunnel (${d.preset.toUpperCase()})`,
    secondaryTitle: "Downstream Wake Velocity & Vortex Shedding",
    primaryLegend: [
      { label: "+Ωz Vortex", color: "amber" },
      { label: "-Ωz Vortex", color: "primary" },
    ],
    secondaryLegend: [{ label: "Wake uy(t)/Uin", color: "primary" }],
    banner: {
      mainHtml: "<strong>Live 2D D2Q9 Lattice-Boltzmann Tunnel:</strong> Real viscous vortex street simulated around 2D cylinders, splitter plates, or steps.",
      trapHtml: "Watch how inserting a wake splitter plate damps downstream Kármán oscillations dramatically!",
      trapTone: "insight",
    },
    scene: {
      bounds: d.field_2d.bounds,
      aspectLock: true,
      xLabel: "Tunnel length x / H",
      yLabel: "Channel height y / H",
      scalarMode: options.lbmScalarMode || "vorticity",
      field: d.field_2d,
      solidRects: d.solid_rects,
    },
    plot: {
      xLabel: "Lattice iteration step",
      yLabel: "Normalized cross-wake uy / Uin",
      xShort: "step",
      series: [{ name: "Wake uy/Uin", x: d.wake_uy_history.map((_, i) => i * 10), y: d.wake_uy_history, color: "primary" }],
      defaultHud: `Re = ${d.reynolds.toFixed(0)} | Wake RMS = ${d.wake_oscillation_rms.toFixed(4)}`,
    },
    drawerMetrics: [
      { k: "Re", v: d.reynolds.toFixed(0), color: "var(--accent)" },
      { k: "Wake RMS", v: d.wake_oscillation_rms.toFixed(4) },
    ],
    drawerCards: [
      { k: "Operating Regime", v: `Re = ${d.reynolds.toFixed(0)}, BGK τ = ${d.tau_bgk.toFixed(3)}` },
      { k: "Wake Oscillation RMS", v: d.wake_oscillation_rms.toFixed(4), tone: d.wake_oscillation_rms > 0.02 ? "coral" : "ok" },
    ],
  };
}
