/**
 * Shared mapper & schematic builders converting backend solver payloads into
 * FlowCanvasEngine + CurvePlotEngine specs.
 * Powers Stations 01 (AI Translator), 02C (Vessel), 04B-04D (Conservation), and 05 (Quiz Bank).
 */

export function computeKinematicsFraming(d) {
  const sl = d.curves?.streamline || [];
  const pl = d.curves?.pathline || [];
  const sk = d.curves?.streakline || [];
  const el0 = d.curves?.initial_element || [];
  const el1 = d.curves?.deformed_element || [];

  // Tightly frame active Lagrangian trajectories, fluid element, and Stokes loop
  const focusPts = [...pl, ...sk, ...el0, ...el1];
  if (d.point_probe) focusPts.push([d.point_probe.x, d.point_probe.y]);
  if (d.stokes_check?.center && d.stokes_check?.radius) {
    const [cx, cy] = d.stokes_check.center;
    const r = d.stokes_check.radius;
    focusPts.push([cx - r, cy - r], [cx + r, cy + r]);
  }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of focusPts) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  // Fallback to field bounds if focus points are degenerate
  const fb = d.field?.bounds || [-2, 4, -2, 3];
  if (!Number.isFinite(minX)) {
    [minX, maxX, minY, maxY] = fb;
  }

  const spanX = Math.max(1.2, maxX - minX);
  const spanY = Math.max(1.0, maxY - minY);
  const padX = Math.max(0.45, spanX * 0.28);
  const padY = Math.max(0.4, spanY * 0.28);

  const viewBounds = [
    Math.max(fb[0], minX - padX),
    Math.min(fb[1], maxX + padX),
    Math.max(fb[2], minY - padY),
    Math.min(fb[3], maxY + padY),
  ];

  // For the right-hand comparison plot, clip streamline to roughly the Y span of pathline/streakline
  const trajPts = [...pl, ...sk];
  let tyMin = Infinity, tyMax = -Infinity;
  for (const [, py] of trajPts) {
    if (!Number.isFinite(py)) continue;
    tyMin = Math.min(tyMin, py);
    tyMax = Math.max(tyMax, py);
  }
  let clippedStream = sl;
  if (Number.isFinite(tyMin) && Number.isFinite(tyMax) && sl.length > 2) {
    const tSpan = Math.max(0.4, tyMax - tyMin);
    const clipLo = tyMin - tSpan * 0.2;
    const clipHi = tyMax + tSpan * 0.25;
    const sub = sl.filter(([, py]) => py >= clipLo && py <= clipHi);
    if (sub.length >= 2) clippedStream = sub;
  }

  return { viewBounds, clippedStream };
}

export function buildRotatingVesselScene(d) {
  const R = d.radius;
  const H = d.vessel_height;
  const rNeg = d.r.slice(1).reverse().map((v) => -v);
  const zNeg = d.z_surface.slice(1).reverse();
  const rFull = [...rNeg, ...d.r];
  const zFull = [...zNeg, ...d.z_surface];

  const fluidPoly = rFull.map((rv, i) => [rv, zFull[i]]);
  fluidPoly.push([R, 0], [-R, 0]);

  const wallT = R * 0.06;
  const solidRects = [
    [-R - wallT, -wallT, wallT, H * 1.15 + wallT], // Left tank wall
    [R, -wallT, wallT, H * 1.15 + wallT], // Right tank wall
    [-R - wallT, -wallT, 2 * (R + wallT), wallT], // Tank base
  ];

  // Synthesize gentle swirling motion arrow inside filled cross-section bounds
  const annotations = [
    { x: 0, y: H * 1.21, text: `${d.rpm.toFixed(0)} RPM · ${d.regime.replaceAll("_", " ")}`, color: d.uncovered_area > 0 ? "coral" : "primary" },
  ];
  const dashedGuides = [];
  if (d.uncovered_radius > 0.005) {
    dashedGuides.push({
      pts: [[-d.uncovered_radius, 0.004], [d.uncovered_radius, 0.004]],
      color: "coral",
      width: 3.5,
      dash: [],
    });
    annotations.push({
      x: 0,
      y: 0.06 * H,
      text: `Dry Base R₁ = ${d.uncovered_radius.toFixed(3)} m`,
      color: "coral",
    });
  }
  if (d.spilled_fraction > 0.001) {
    annotations.push({
      x: R * 0.48,
      y: H * 1.06,
      text: `Spilled ${(d.spilled_fraction * 100).toFixed(1)}%`,
      color: "amber",
    });
  }

  return {
    bounds: [-R * 1.32, R * 1.32, -H * 0.14, H * 1.32],
    aspectLock: true,
    xLabel: "Radial coordinate r (m) — cross-section",
    yLabel: "Liquid elevation z (m)",
    field: null,
    fluidPoly,
    solidRects,
    dashedGuides,
    hLines: [{ y: H, color: "#475569", dashed: true, label: `Rim H = ${H.toFixed(3)} m` }],
    annotations,
    defaultHud: `Regime: ${d.regime} | Uncovered Area = ${d.uncovered_area.toFixed(4)} m² | Critical Uncover RPM = ${d.critical_full_uncover_rpm.toFixed(1)}`,
  };
}

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
        // Surface roller reversal near the jump zone x in [2.1, 3.2]
        const inRoller = d.can_jump && xv >= 2.0 && xv <= 3.3 && yv > 0.58 * hx;
        rowU.push(inRoller ? -vLocal * 0.45 : vLocal);
        rowV.push(inRoller ? -0.35 * (xv - 2.6) : 0.0);
      }
    }
    U.push(rowU);
    V.push(rowV);
  }

  const solidRects = [
    [0.0, -0.1 * yMax, 6.0, 0.1 * yMax], // Concrete channel apron bed
    [0.25, d.h1, 0.16, yMax - d.h1], // Upstream sluice gate
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
    [-1.0, r1, 1.0, yLim - r1], // Upstream upper wall block
    [-1.0, -yLim, 1.0, yLim - r1], // Upstream lower wall block
    [0.0, r2, 3.0, yLim - r2], // Downstream upper wall
    [0.0, -yLim, 3.0, yLim - r2], // Downstream lower wall
  ];

  // Live 2D jet expansion + corner recirculation eddies field
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
          // Corner dead-zone recirculation eddy
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
    [-0.5 * L - wallT, -wallT, wallT, H + wallT], // Left wall
    [0.5 * L, -wallT, wallT, H + wallT], // Right wall
    [-0.5 * L - wallT, -wallT, 0.5 * L + wallT - holeHalf, wallT], // Bottom left of orifice
    [holeHalf, -wallT, 0.5 * L + wallT - holeHalf, wallT], // Bottom right of orifice
  ];

  // Isobars parallel to free surface inside liquid
  const dashedGuides = [];
  for (const frac of [0.35, 0.68]) {
    const pts = [];
    for (let i = 0; i < d.x.length; i += 6) {
      const zIso = d.z_surface[i] * frac;
      if (zIso > 0.01) pts.push([d.x[i], zIso]);
    }
    if (pts.length >= 2) dashedGuides.push({ pts, color: "primary", width: 1.0, dash: [3, 4] });
  }

  // Orifice jet parabola if g_effective > 0
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

export function displaySolvedFamily(family, d, ctx) {
  const { flowEngine, plotEngine, setLegend, setDrawerMetrics, setDrawerCards, setConceptBanner } = ctx;

  if (!d || family === "unsupported_3d") {
    flowEngine.setScene({
      bounds: [0, 1, 0, 1],
      field: null,
      xLabel: "Unsupported Domain",
      yLabel: "Unsupported Axis",
      defaultHud: "Outside 2D/1D exact solver scope — no fabricated diagram drawn",
      emptyMessage: "Honest Solver Boundary // Outside 2D/1D Scope",
      emptySub: "SymPy equation auditor remains active; refine prompt to a 2D problem.",
    });
    plotEngine.setPlot({
      xLabel: "Unsupported Solver Domain",
      yLabel: "",
      series: [],
      defaultHud: "Outside built 2D/1D exact solvers",
      emptyMessage: "No Fabricated Curve // 3D Compressible Regime",
      emptySub: "FluidScope AI refuses to guess unverified 3D shock/turbomachinery plots.",
    });
    document.getElementById("primaryTitle").textContent = "Honest Solver Boundary (No Fabricated Diagram)";
    document.getElementById("secondaryTitle").textContent = "Scope Guardrail Active";
    setLegend("primaryLegend", []);
    setLegend("secondaryLegend", []);
    if (setConceptBanner) {
      setConceptBanner(
        "<strong>Honest Solver Boundary:</strong> This query requires 3D compressible or turbomachinery equations beyond our verified 2D/1D kernels.",
        "Instead of fabricating a fake diagram, SymPy audits assumptions cleanly."
      );
    }
    setDrawerMetrics([{ k: "SCOPE", v: "OUTSIDE 2D/1D", color: "var(--coral)" }]);
    return;
  }

  if (family === "potential_superposition") {
    document.getElementById("primaryTitle").textContent = "Magnus Rotating Cylinder & Cp Contours";
    document.getElementById("secondaryTitle").textContent = "Surface Pressure Profile Cp(x) Along y = 1.2 m";
    setLegend("primaryLegend", [{ label: "Stagnation Point", color: "coral" }]);
    setLegend("secondaryLegend", [{ label: "Cp(x, y = 1.2)", color: "primary" }]);
    if (setConceptBanner) {
      setConceptBanner(
        "<strong>Magnus Lift & Kutta–Joukowski:</strong> Adding clockwise circulation shifts top-surface streamlines closer (higher speed, lower pressure) and moves both stagnation points downward.",
        "When |Γ| > 4πU∞a, stagnation points detach off the cylinder surface completely!"
      );
    }
    flowEngine.setScene({
      bounds: d.bounds,
      aspectLock: true,
      xLabel: "Streamwise x (m)",
      yLabel: "Cross-stream y (m)",
      field: { xs: d.xs, ys: d.ys, U: d.U, V: d.V, cp: d.cp },
      cylinderRadius: d.equivalent_cylinder_radius,
      stagnationPoints: d.stagnation_points,
    });
    plotEngine.setPlot({
      xLabel: "Streamwise x (m)",
      yLabel: "Pressure coeff Cp",
      xShort: "x",
      series: [{ name: "Cp(y=1.2)", x: d.xs, y: d.cp[Math.floor(d.cp.length * 0.72)], color: "primary" }],
      defaultHud: `Lift L' = ${d.lift_per_unit_span.toFixed(2)} N/m | Γ = ${d.total_circulation.toFixed(2)} m²/s`,
    });
    setDrawerMetrics([{ k: "L' Lift", v: `${d.lift_per_unit_span.toFixed(2)} N/m`, color: "var(--accent)" }]);
    setDrawerCards([
      { k: "Circulation Γ", v: `${d.total_circulation.toFixed(2)} m²/s`, tone: "accent" },
      { k: "Kutta–Joukowski Lift", v: `${d.lift_per_unit_span.toFixed(2)} N/m` },
      { k: "Stagnation Points", v: d.stagnation_points.length ? `${d.stagnation_points.length} on surface` : "Detached off body", tone: d.stagnation_points.length ? "" : "coral" },
    ]);
    return;
  }

  if (family === "kinematics_equation") {
    const { viewBounds, clippedStream } = computeKinematicsFraming(d);
    document.getElementById("primaryTitle").textContent = "Eulerian Field vs. Streamline, Pathline & Streakline";
    document.getElementById("secondaryTitle").textContent = "Trajectory Comparison x(y) Aligned Vertically";
    setLegend("primaryLegend", [
      { label: "Streamline", color: "primary" },
      { label: "Pathline", color: "amber" },
      { label: "Streakline", color: "coral", dashed: true },
    ]);
    setLegend("secondaryLegend", [
      { label: "Streamline", color: "primary" },
      { label: "Pathline", color: "amber" },
      { label: "Streakline", color: "coral", dashed: true },
    ]);
    if (setConceptBanner) {
      const div = !d.classification.curves_coincide;
      setConceptBanner(
        div
          ? "<strong>Unsteady Kinematics (Ex. 3.10):</strong> Compare the dark blue instantaneous streamline, orange particle pathline, green Stokes circulation loop, and deforming orange fluid box."
          : "<strong>Steady Flow Equivalence:</strong> Because ∂V/∂t = 0, streamline, pathline, and streakline collapse onto the same geometric path.",
        div
          ? "Exam Trap: Even with constant v = v₀, time-varying u(x,t) splits all three curves!"
          : "Inspect the green Stokes loop and deforming square to test Ωz rotation vs. shear strain."
      );
    }
    flowEngine.setScene({
      bounds: viewBounds,
      aspectLock: true,
      xLabel: "x (m)",
      yLabel: "y (m)",
      field: d.field,
      streamline: d.curves.streamline,
      pathline: d.curves.pathline,
      streakline: d.curves.streakline,
      initialElement: d.curves.initial_element,
      deformedElement: d.curves.deformed_element,
      stokesLoop: { center: d.stokes_check.center, radius: d.stokes_check.radius },
      seedPoint: [d.point_probe.x, d.point_probe.y],
    });
    const yVals = d.curves.pathline.map((p) => p[1]);
    const ySpan = yVals.length > 1 ? Math.max(...yVals) - Math.min(...yVals) : 0;
    plotEngine.setPlot({
      probeAxis: ySpan > 0.05 ? "y" : "x",
      xLabel: "Horizontal coordinate x (m)",
      yLabel: "Vertical coordinate y (m)",
      xShort: "x",
      yShort: "y",
      series: [
        { name: "Streamline", x: clippedStream.map((p) => p[0]), y: clippedStream.map((p) => p[1]), color: "primary" },
        { name: "Pathline", x: d.curves.pathline.map((p) => p[0]), y: d.curves.pathline.map((p) => p[1]), color: "amber" },
        { name: "Streakline", x: d.curves.streakline.map((p) => p[0]), y: d.curves.streakline.map((p) => p[1]), color: "coral", dashed: true },
      ],
      defaultHud: d.classification.curves_coincide
        ? "Steady flow: Streamline, Pathline, and Streakline coincide"
        : "Hover along trajectories to compare Streamline vs. Pathline vs. Streakline",
    });
    const pr = d.point_probe;
    const st = d.stokes_check;
    setDrawerMetrics([
      { k: "Curves Coincide", v: d.classification.curves_coincide ? "YES" : "NO (Diverge)", color: d.classification.curves_coincide ? "var(--ok-green)" : "var(--coral)" },
      { k: "Ωz Probe", v: pr.vorticity_z !== null ? `${pr.vorticity_z.toFixed(3)} s⁻¹` : "-" },
    ]);
    setDrawerCards([
      { k: "Vorticity Ωz (Symbolic)", tex: `\\Omega_z = ${d.expressions.vorticity_tex}` },
      { k: "Classification", v: `${d.classification.steady ? "Steady" : "Unsteady"} · ${d.classification.irrotational ? "Irrotational" : "Rotational"}`, tone: d.classification.steady ? "" : "amber" },
      { k: "Stokes Theorem Γ = ∬Ωz dA", v: `Line: ${st.circulation_line?.toFixed(3) ?? "-"} vs. Area: ${st.circulation_area_vorticity.toFixed(3)}` },
      { k: "Acceleration at Seed", v: `ax = ${pr.ax?.toFixed(2) ?? "-"}, ay = ${pr.ay?.toFixed(2) ?? "-"} m/s²` },
    ]);
    return;
  }

  if (family === "vortex_flow") {
    document.getElementById("primaryTitle").textContent = `${d.mode.toUpperCase()} Vortex Swirl Plane`;
    document.getElementById("secondaryTitle").textContent = "Radial Pressure: Exact Euler vs. Naive Bernoulli";
    setLegend("primaryLegend", d.mode === "rankine" ? [{ label: "Core Rc", color: "amber", dashed: true }] : []);
    setLegend("secondaryLegend", [
      { label: "Exact Euler p(r)", color: "primary" },
      { label: "Naive Bernoulli p(r)", color: "coral", dashed: true },
    ]);
    if (setConceptBanner) {
      setConceptBanner(
        d.bernoulli_globally_valid
          ? `<strong>Irrotational ${d.mode.toUpperCase()} Vortex:</strong> Outside r = 0, vorticity Ωz = 0 so mechanical head H stays constant radially and Bernoulli matches Euler.`
          : `<strong>Rotational Vortex Core (${d.mode.toUpperCase()}):</strong> Solid-body vorticity Ωz = 2ω makes total head rise radially (∂H/∂n = VΩz/g), driving true pressure outward.`,
        d.bernoulli_globally_valid
          ? "Watch Ωz = 0 and the vanishing discrepancy band on the radial pressure plot."
          : "Bernoulli Trap: Constant-head Bernoulli predicts the OPPOSITE sign (shaded red error band)!"
      );
    }
    flowEngine.setScene({
      bounds: d.field_2d.bounds,
      aspectLock: true,
      xLabel: "x (m)",
      yLabel: "y (m)",
      field: { ...d.field_2d, vorticity: null },
      spiralCurve: d.spiral_curve,
    });
    plotEngine.setPlot({
      xLabel: "Radius r (m)",
      yLabel: "Pressure difference p - p₁ (kPa)",
      xShort: "r",
      shadeDiff: true,
      series: [
        { name: "Exact p (kPa)", x: d.r, y: d.p_true.map((p) => p / 1000), color: "primary" },
        { name: "Naive Bernoulli (kPa)", x: d.r, y: d.p_naive.map((p) => p / 1000), color: "coral", dashed: true },
      ],
      vMarkers: [
        { x: d.probes.r1, label: "r₁", color: "#475569" },
        { x: d.probes.r2, label: "r₂", color: "amber" },
      ],
      defaultHud: `True Δp = ${(d.probes.dp_true / 1000).toFixed(2)} kPa vs Naive = ${(d.probes.dp_naive / 1000).toFixed(2)} kPa`,
    });
    setDrawerMetrics([
      { k: "Δp True", v: `${(d.probes.dp_true / 1000).toFixed(2)} kPa`, color: "var(--accent)" },
      { k: "Δp Naive", v: `${(d.probes.dp_naive / 1000).toFixed(2)} kPa`, color: "var(--coral)" },
    ]);
    setDrawerCards([
      { k: "Exact Radial Euler Δp", v: `${(d.probes.dp_true / 1000).toFixed(3)} kPa`, tone: "accent" },
      { k: "Naive Bernoulli Δp", v: `${(d.probes.dp_naive / 1000).toFixed(3)} kPa`, tone: Math.abs(d.probes.dp_discrepancy) > 1 ? "coral" : "" },
      { k: "Head Gain ΔH(r₁→r₂)", v: `${d.probes.head_gain_r1_to_r2.toFixed(3)} m`, tone: "amber" },
      { k: "Vorticity Verdict", v: d.bernoulli_globally_valid ? "Irrotational: Global Bernoulli holds." : "Rotational (Ωz ≠ 0): Total head changes across streamlines." },
    ]);
    return;
  }

  if (family === "rotating_vessel") {
    document.getElementById("primaryTitle").textContent = `Open Rotating Cylinder Cross-Section @ ${d.rpm.toFixed(0)} RPM`;
    document.getElementById("secondaryTitle").textContent = "Free Surface Paraboloid z(r) & Base Uncovering (Ex. 4.8)";
    setLegend("primaryLegend", [
      { label: "Liquid Paraboloid", color: "primary" },
      ...(d.uncovered_radius > 0 ? [{ label: "Uncovered Dry R₁", color: "coral" }] : []),
    ]);
    setLegend("secondaryLegend", [
      { label: "Free Surface z(r)", color: "primary" },
      { label: "Cylinder Rim H", color: "#475569", dashed: true },
    ]);
    if (setConceptBanner) {
      setConceptBanner(
        "<strong>Rotating Open Vessel (Ex. 4.8):</strong> Solid-body swirl forces a parabolic free surface z(r) = z₀ + ω²r²/(2g) inside the open tank.",
        "Above the rim-touching speed, excess liquid spills overboard first — you cannot conserve full initial volume!"
      );
    }
    flowEngine.setScene(buildRotatingVesselScene(d));
    plotEngine.setPlot({
      xLabel: "Radius r (m)",
      yLabel: "Surface height z (m)",
      xShort: "r",
      series: [
        { name: "z_surf (m)", x: d.r, y: d.z_surface, color: "primary" },
        { name: "Rim H", x: [0, d.radius], y: [d.vessel_height, d.vessel_height], color: "#475569", dashed: true },
      ],
      vMarkers: d.uncovered_radius > 0 ? [{ x: d.uncovered_radius, label: "Dry R₁", color: "coral" }] : [],
      defaultHud: `Regime: ${d.regime} | Uncovered Area = ${d.uncovered_area.toFixed(4)} m²`,
    });
    setDrawerMetrics([{ k: "Dry Base Area", v: `${d.uncovered_area.toFixed(4)} m²`, color: d.uncovered_area > 0 ? "var(--coral)" : "var(--ok-green)" }]);
    setDrawerCards([
      { k: "Regime", v: d.regime, tone: "accent" },
      { k: "Paraboloid Depth ω²R²/2g", v: `${d.paraboloid_height.toFixed(3)} m`, tone: "amber" },
      { k: "Uncovered Base πR₁²", v: `${d.uncovered_area.toFixed(4)} m² (Ex 4.8: 0.116 @ 130 rpm)`, tone: d.uncovered_area > 0 ? "coral" : "" },
    ]);
    return;
  }

  if (family === "hydraulic_jump") {
    document.getElementById("primaryTitle").textContent = "Hydraulic Jump Profile, Roller Eddy & Sluice Gate";
    document.getElementById("secondaryTitle").textContent = "Specific Energy Es(h): Momentum Jump vs. No-Loss Trap";
    setLegend("primaryLegend", [
      { label: "True Depth h(x)", color: "primary" },
      { label: "Naive No-Loss h₂", color: "coral", dashed: true },
    ]);
    setLegend("secondaryLegend", [{ label: "Specific Energy Es(h)", color: "primary" }]);
    if (setConceptBanner) {
      setConceptBanner(
        "<strong>Hydraulic Jump Momentum Balance (Ch. 12.4):</strong> Supercritical flow h₁ jumps through a turbulent surface roller to subcritical conjugate depth h₂.",
        "Bernoulli Trap: Constant Specific Energy Es(h) = const ignores eddy dissipation and overpredicts h₂!"
      );
    }
    flowEngine.setScene(buildHydraulicJumpScene(d));
    plotEngine.setPlot({
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
    });
    setDrawerMetrics([
      { k: "h₂ True", v: `${d.h2_true.toFixed(3)} m`, color: "var(--accent)" },
      { k: "Head Loss hj", v: `${d.head_loss_hj.toFixed(3)} m`, color: "var(--coral)" },
    ]);
    setDrawerCards([
      { k: "Conjugate Depth h₂", v: `${d.h2_true.toFixed(3)} m (Jump Δh = ${d.jump_height.toFixed(3)} m)`, tone: "accent" },
      { k: "Naive Alternate h₂", v: `${d.h2_naive_bernoulli.toFixed(3)} m (+${d.depth_overprediction.toFixed(3)} m error)`, tone: "coral" },
      { k: "Roller Power Dissipated", v: `${(d.power_loss_W / 1000).toFixed(2)} kW`, tone: "coral" },
    ]);
    return;
  }

  if (family === "sudden_expansion") {
    document.getElementById("primaryTitle").textContent = "Borda–Carnot Sudden Pipe Expansion & Corner Eddies";
    document.getElementById("secondaryTitle").textContent = "Pressure Recovery: Momentum Balance vs. Ideal Bernoulli";
    setLegend("primaryLegend", [
      { label: "Main Pipe Jet", color: "primary" },
      { label: "Recirculation Eddies", color: "coral" },
    ]);
    setLegend("secondaryLegend", [
      { label: "True Δp(x)", color: "primary" },
      { label: "Naive Bernoulli Δp(x)", color: "coral", dashed: true },
    ]);
    if (setConceptBanner) {
      setConceptBanner(
        "<strong>Borda–Carnot Pipe Expansion (Eq. 11.18):</strong> Fast upstream jet V₁ expands into downstream pipe V₂ while corner annular eddies trap uniform pressure p' ≈ p₁.",
        "Ideal Bernoulli predicts ½ρ(V₁² - V₂²), missing Borda eddy loss hL = (V₁ - V₂)²/2g!"
      );
    }
    flowEngine.setScene(buildSuddenExpansionScene(d));
    plotEngine.setPlot({
      xLabel: "Axial position x (m)",
      yLabel: "Pressure recovery p - p₁ (kPa)",
      xShort: "x",
      shadeDiff: true,
      series: [
        { name: "True Δp (kPa)", x: d.x, y: d.p_true_x.map((v) => (v - d.p1) / 1000), color: "primary" },
        { name: "Naive Δp (kPa)", x: d.x, y: d.p_naive_x.map((v) => (v - d.p1) / 1000), color: "coral", dashed: true },
      ],
      defaultHud: `True Δp = ${(d.dp_true / 1000).toFixed(2)} kPa vs Naive = ${(d.dp_naive / 1000).toFixed(2)} kPa`,
    });
    setDrawerMetrics([
      { k: "Δp True", v: `${(d.dp_true / 1000).toFixed(2)} kPa`, color: "var(--accent)" },
      { k: "Δp Naive", v: `${(d.dp_naive / 1000).toFixed(2)} kPa`, color: "var(--coral)" },
    ]);
    setDrawerCards([
      { k: "Momentum Recovery", v: `${(d.dp_true / 1000).toFixed(2)} kPa`, tone: "accent" },
      { k: "Naive Bernoulli Trap", v: `${(d.dp_naive / 1000).toFixed(2)} kPa`, tone: "coral" },
      { k: "Borda–Carnot Head Loss", v: `hL = ${d.head_loss_hL.toFixed(3)} m` },
    ]);
    return;
  }

  if (family === "accelerating_tank") {
    document.getElementById("primaryTitle").textContent = `Non-Inertial Tank & Bottom Orifice (${d.regime.replaceAll("_", " ")})`;
    document.getElementById("secondaryTitle").textContent = "Bottom Hydrostatic Pressure: True Frame vs. Static Naive";
    setLegend("primaryLegend", [
      { label: "Actual Surface & Jet", color: "primary" },
      { label: "Static Flat Level", color: "coral", dashed: true },
    ]);
    setLegend("secondaryLegend", [
      { label: "Actual p_bot (kPa)", color: "primary" },
      { label: "Naive Static (kPa)", color: "coral", dashed: true },
    ]);
    if (setConceptBanner) {
      setConceptBanner(
        "<strong>Non-Inertial Tank Hydrostatics (Eq. 2.86):</strong> Effective body force g_eff = (g + az) acts along the tilted surface normal, shifting both free surface tilt and base pressure.",
        "Free-Fall Trap: At az = -g, g_eff vanishes ⇒ pressure equals patm everywhere and bottom hole DOES NOT LEAK!"
      );
    }
    flowEngine.setScene(buildAccelTankScene(d));
    plotEngine.setPlot({
      xLabel: "Horizontal tank coordinate x (m)",
      yLabel: "Bottom gauge pressure p (kPa)",
      xShort: "x",
      shadeDiff: true,
      series: [
        { name: "True p_bot (kPa)", x: d.x, y: d.p_bottom_true_kPa, color: "primary" },
        { name: "Static Naive (kPa)", x: d.x, y: d.p_bottom_naive_kPa, color: "coral", dashed: true },
      ],
      defaultHud: `Orifice Exit V_true = ${d.orifice_v_true.toFixed(2)} m/s vs Naive = ${d.orifice_v_naive_static.toFixed(2)} m/s`,
    });
    setDrawerMetrics([{ k: "Orifice Exit V", v: `${d.orifice_v_true.toFixed(2)} m/s`, color: d.orifice_v_true < 0.01 ? "var(--coral)" : "var(--accent)" }]);
    setDrawerCards([
      { k: "Regime", v: d.regime, tone: "amber" },
      { k: "Surface Tilt θ", v: `${d.tilt_deg.toFixed(2)}°` },
      { k: "Orifice Speed Check", v: d.g_effective < 0.01 ? "Weightless: V_exit = 0 (No leak!)" : `True ${d.orifice_v_true.toFixed(2)} m/s vs Static ${d.orifice_v_naive_static.toFixed(2)} m/s`, tone: d.g_effective < 0.01 ? "coral" : "accent" },
    ]);
    return;
  }

  if (family === "lbm_tunnel") {
    document.getElementById("primaryTitle").textContent = `Live 2D D2Q9 LBM Wind Tunnel (${d.preset.toUpperCase()})`;
    document.getElementById("secondaryTitle").textContent = "Downstream Wake Velocity & Vortex Shedding";
    setLegend("primaryLegend", [
      { label: "+Ωz Vortex", color: "amber" },
      { label: "-Ωz Vortex", color: "primary" },
    ]);
    setLegend("secondaryLegend", [{ label: "Wake uy(t)/Uin", color: "primary" }]);
    if (setConceptBanner) {
      setConceptBanner(
        "<strong>Live 2D D2Q9 Lattice-Boltzmann Tunnel:</strong> Real viscous vortex street simulated around 2D cylinders, splitter plates, or steps.",
        "Watch how inserting a wake splitter plate damps downstream Kármán oscillations dramatically!"
      );
    }
    flowEngine.setScene({
      bounds: d.field_2d.bounds,
      aspectLock: true,
      xLabel: "Tunnel length x / H",
      yLabel: "Channel height y / H",
      field: d.field_2d,
      solidRects: d.solid_rects,
    });
    plotEngine.setPlot({
      xLabel: "Lattice iteration step",
      yLabel: "Normalized cross-wake uy / Uin",
      xShort: "step",
      series: [{ name: "Wake uy/Uin", x: d.wake_uy_history.map((_, i) => i * 10), y: d.wake_uy_history, color: "primary" }],
      defaultHud: `Re = ${d.reynolds.toFixed(0)} | Wake RMS = ${d.wake_oscillation_rms.toFixed(4)}`,
    });
    setDrawerMetrics([
      { k: "Re", v: d.reynolds.toFixed(0), color: "var(--accent)" },
      { k: "Wake RMS", v: d.wake_oscillation_rms.toFixed(4) },
    ]);
    setDrawerCards([
      { k: "Operating Regime", v: `Re = ${d.reynolds.toFixed(0)}, BGK τ = ${d.tau_bgk.toFixed(3)}` },
      { k: "Wake Oscillation RMS", v: d.wake_oscillation_rms.toFixed(4), tone: d.wake_oscillation_rms > 0.02 ? "coral" : "ok" },
    ]);
    return;
  }

  // Channel & Boundary-Layer families (Text-book vertical y/H orientation!)
  if (family === "two_layer_poiseuille") {
    document.getElementById("primaryTitle").textContent = "Two-Layer Immiscible Channel Flow Field (Ex. 8.2)";
    document.getElementById("secondaryTitle").textContent = "Velocity Profile u(y): Shear Continuity vs. Equal-Slope Trap";
    setLegend("primaryLegend", [{ label: "Interface y = 0", color: "amber", dashed: true }]);
    setLegend("secondaryLegend", [
      { label: "True u(y)", color: "primary" },
      { label: "Equal-Slope Trap", color: "coral", dashed: true },
    ]);
    if (setConceptBanner) {
      setConceptBanner(
        "<strong>Two-Layer Immiscible Channel (Ex. 8.2):</strong> At fluid interface y = 0, velocities match AND shear stress τ = μ(du/dy) must be continuous.",
        "Interface Trap: Matching du₁/dy = du₂/dy is wrong whenever μ₁ ≠ μ₂; peak speed shifts into the less viscous fluid!"
      );
    }
    flowEngine.setScene({
      bounds: d.field_2d.bounds,
      aspectLock: false,
      xLabel: "Channel length x / H",
      yLabel: "Normalized height y / H",
      field: d.field_2d,
      hLines: [{ y: 0, color: "amber", dashed: true, label: "INTERFACE y = 0" }],
    });
    plotEngine.setPlot({
      probeAxis: "y",
      xLabel: "Axial velocity u (m/s)",
      yLabel: "Normalized height y / H",
      xShort: "u",
      yShort: "y/H",
      shadeDiff: true,
      hMarkers: [{ y: 0.0, label: "Interface y=0", color: "amber" }],
      vMarkers: [{ x: 0.0, label: "u = 0", color: "#475569" }],
      series: [
        { name: "True u", x: d.u_true, y: d.y_over_H, color: "primary" },
        { name: "Slope Trap", x: d.u_naive_slope_trap, y: d.y_over_H, color: "coral", dashed: true },
      ],
      defaultHud: `Peak shifted to y_max/H = ${(d.y_peak / d.H).toFixed(2)} into lower-viscosity layer`,
    });
    setDrawerMetrics([
      { k: "μ₁/μ₂", v: (d.mu1 / d.mu2).toFixed(2), color: "var(--accent)" },
      { k: "y_peak/H", v: (d.y_peak / d.H).toFixed(2) },
    ]);
    setDrawerCards([
      { k: "Interface Shear", v: `${d.interface_shear.toFixed(4)} Pa`, tone: "accent" },
      { k: "Slope Ratio Kink", v: `du₁/dy = ${d.interface_slope_1.toFixed(1)} vs du₂/dy = ${d.interface_slope_2.toFixed(1)} s⁻¹`, tone: "coral" },
      { k: "Offset Velocity Peak", v: `u_max at y/H = ${(d.y_peak / d.H).toFixed(2)} (NOT 0.0)` },
    ]);
  } else if (family === "couette_poiseuille") {
    document.getElementById("primaryTitle").textContent = "Generalized Couette–Poiseuille Channel Field";
    document.getElementById("secondaryTitle").textContent = "Velocity Profile u(y)/U vs. Pure Couette (P = 0)";
    setLegend("primaryLegend", []);
    setLegend("secondaryLegend", [
      { label: "Actual u/U", color: "primary" },
      { label: "Pure Couette (P=0)", color: "coral", dashed: true },
    ]);
    if (setConceptBanner) {
      setConceptBanner(
        "<strong>Couette–Poiseuille Backflow (Ex. 8.4):</strong> Moving upper plate (+U) drags fluid forward while adverse P < 0 pushes fluid backward near the fixed wall.",
        "At P = -1 wall shear vanishes; net flux Q reaches zero only at P = -3 (pure recirculation)!"
      );
    }
    flowEngine.setScene({
      bounds: d.field_2d.bounds,
      aspectLock: false,
      xLabel: "Channel length x / H",
      yLabel: "Normalized gap y / H",
      field: d.field_2d,
    });
    plotEngine.setPlot({
      probeAxis: "y",
      xLabel: "Normalized velocity u / U",
      yLabel: "Normalized gap y / H",
      xShort: "u/U",
      yShort: "y/H",
      shadeDiff: true,
      vMarkers: [{ x: 0.0, label: "u = 0 (Backflow < 0)", color: "#475569" }],
      series: [
        { name: "Actual u/U", x: d.u_over_U, y: d.y_over_H, color: "primary" },
        { name: "Pure Couette", x: d.u_pure_couette.map((u) => u / d.U), y: d.y_over_H, color: "coral", dashed: true },
      ],
      defaultHud: `Regime: ${d.regime} | P = ${d.P.toFixed(2)}`,
    });
    setDrawerMetrics([
      { k: "P", v: d.P.toFixed(2), color: d.P < -1 ? "var(--coral)" : "var(--accent)" },
      { k: "Regime", v: d.regime },
    ]);
    setDrawerCards([
      { k: "Regime", v: d.regime, tone: d.P < -1 ? "coral" : "accent" },
      { k: "Lower Wall Shear", v: `${d.tau_lower_wall.toFixed(4)} Pa` },
      { k: "Zero-Flux Check", v: d.zero_net_flux ? "P = -3: Net Q = 0 Exact" : `u_avg = ${d.u_avg.toFixed(3)} m/s` },
    ]);
  } else if (family === "slip_herschel_bulkley") {
    const pf = d.plug_fraction;
    document.getElementById("primaryTitle").textContent = "Navier Wall-Slip + Herschel–Bulkley Plug Channel";
    document.getElementById("secondaryTitle").textContent = "Velocity Profile u(y): Plug + Slip vs. No-Slip Poiseuille";
    setLegend("primaryLegend", [{ label: "Unyielded Plug |y|≤yp", color: "amber", dashed: true }]);
    setLegend("secondaryLegend", [
      { label: "True u(y)", color: "primary" },
      { label: "No-Slip Newtonian", color: "coral", dashed: true },
    ]);
    if (setConceptBanner) {
      setConceptBanner(
        "<strong>Wall Slip + Yield-Stress Plug (Ch. 1.6):</strong> Unyielded fluid where |τ| ≤ τ_y moves as a rigid flat plug while hydrophobic Navier slip shifts wall velocity upward.",
        "Using standard No-Slip Newtonian Poiseuille vastly underpredicts slip flux (or misses complete yield locking)!"
      );
    }
    const hBands = pf > 0.02 && pf < 0.99 ? [{ yMin: -pf, yMax: pf, fill: "rgba(217, 119, 6, 0.14)" }] : [];
    const hLines = pf > 0.02 && pf < 0.99
      ? [{ y: pf, color: "amber", dashed: true, label: `+PLUG y/H=${pf.toFixed(2)}` }, { y: -pf, color: "amber", dashed: true, label: `-PLUG` }]
      : [];
    flowEngine.setScene({
      bounds: d.field_2d.bounds,
      aspectLock: false,
      xLabel: "Channel length x / H",
      yLabel: "Normalized gap y / H",
      field: d.field_2d,
      hLines,
      hBands,
    });
    plotEngine.setPlot({
      probeAxis: "y",
      xLabel: "Axial velocity u (m/s)",
      yLabel: "Normalized gap y / H",
      xShort: "u",
      yShort: "y/H",
      shadeDiff: true,
      hBands,
      hMarkers: pf > 0.02 && pf < 0.99 ? [{ y: -pf, label: "-yp", color: "amber" }, { y: pf, label: "+yp", color: "amber" }] : [],
      vMarkers: [{ x: 0.0, label: "u = 0", color: "#475569" }],
      series: [
        { name: "True u", x: d.u_true, y: d.y_over_H, color: "primary" },
        { name: "No-Slip Newt", x: d.u_newton_noslip, y: d.y_over_H, color: "coral", dashed: true },
      ],
      defaultHud: `Flux Ratio = ${d.flux_ratio.toFixed(2)}x | Plug Core = ${(pf * 100).toFixed(0)}%`,
    });
    setDrawerMetrics([
      { k: "Plug %", v: `${(pf * 100).toFixed(0)}%`, color: "var(--amber)" },
      { k: "Flux Ratio", v: `${d.flux_ratio.toFixed(2)}x`, color: "var(--coral)" },
    ]);
    setDrawerCards([
      { k: "Wall Slip Speed uw", v: `${d.u_slip_wall.toFixed(3)} m/s`, tone: "accent" },
      { k: "Unyielded Plug Core", v: `|y|/H ≤ ${pf.toFixed(2)} (${(pf * 100).toFixed(0)}%)` },
      { k: "Flow Lock Check", v: d.flow_locked ? "Flow Locked (|τ_w| ≤ τ_y)" : `${d.flux_ratio.toFixed(2)}× Newtonian Poiseuille flux`, tone: d.flow_locked ? "coral" : "" },
    ]);
  } else {
    document.getElementById("primaryTitle").textContent = "Boundary-Layer Separation & Inflection Point";
    document.getElementById("secondaryTitle").textContent = "Boundary-Layer Profile u(η)/U∞ vs. Reference";
    const yCoord = d.eta;
    const uMain = d.u || d.u_over_U;
    const uRef = d.u_zero_pg || d.d2u_deta2;
    setLegend("primaryLegend", [{ label: "Inflection PI", color: "amber", dashed: true }]);
    setLegend("secondaryLegend", [
      { label: "Profile u / U∞", color: "primary" },
      { label: d.u_zero_pg ? "Zero PG (Λ=0)" : "Curvature d²u/dη²", color: "coral", dashed: true },
    ]);
    if (setConceptBanner) {
      setConceptBanner(
        "<strong>Boundary-Layer Separation Criterion (Eq. 9.41–9.42):</strong> Adverse dp/dx > 0 creates positive wall curvature (∂²u/∂y²|w > 0), forcing an interior inflection point before wall shear reverses.",
        "Potential D'Alembert theory predicts zero drag (Cd = 0) because it ignores viscous separation."
      );
    }
    flowEngine.setScene({
      bounds: d.field_2d.bounds,
      aspectLock: false,
      xLabel: "Boundary layer x / δ",
      yLabel: "Wall-normal height (η or y/δ)",
      field: d.field_2d,
      hLines: d.inflection_eta !== null && d.inflection_eta !== undefined
        ? [{ y: d.inflection_eta, color: "amber", dashed: true, label: `Inflection η_PI = ${d.inflection_eta.toFixed(2)}` }]
        : [],
    });
    plotEngine.setPlot({
      probeAxis: "y",
      xLabel: "Dimensionless velocity u / U∞",
      yLabel: d.u_zero_pg ? "Wall-normal height y / δ" : "Similarity coordinate η",
      xShort: "u/U",
      yShort: d.u_zero_pg ? "y/δ" : "η",
      vMarkers: [{ x: 0.0, label: "u = 0 (Backflow < 0)", color: "#475569" }],
      hMarkers: d.inflection_eta !== null && d.inflection_eta !== undefined
        ? [{ y: d.inflection_eta, label: "Inflection PI", color: "amber" }]
        : [],
      series: [
        { name: "u / U∞", x: uMain, y: yCoord, color: "primary" },
        { name: d.u_zero_pg ? "Zero PG (Λ=0)" : "d²u/dη²", x: uRef, y: yCoord, color: "coral", dashed: true },
      ],
      defaultHud: `Inflection η_PI = ${d.inflection_eta !== null ? d.inflection_eta.toFixed(2) : "None"}`,
    });
    const tw = d.wall_shear_dimless !== undefined ? d.wall_shear_dimless : d.wall_shear_fpp0;
    setDrawerMetrics([{ k: "Wall Shear", v: tw !== undefined ? tw.toFixed(4) : "-", color: tw !== undefined && tw <= 0 ? "var(--coral)" : "var(--accent)" }]);
    setDrawerCards([
      { k: "Wall Shear Slope", v: tw !== undefined ? tw.toFixed(4) : "-", tone: tw !== undefined && tw <= 0 ? "coral" : "accent" },
      { k: "Inflection Height", v: d.inflection_eta !== null ? `${d.inflection_eta.toFixed(2)}` : "None (dp/dx ≤ 0)" },
    ]);
  }
}
