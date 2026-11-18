/**
 * Kinematics, Vortex, Rotating Vessel, and Potential Superposition Scene Mappers.
 * Wave 0 split from scene_mapper.js (owned by Agent C in Wave 1).
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
    [-R - wallT, -wallT, wallT, H * 1.15 + wallT],
    [R, -wallT, wallT, H * 1.15 + wallT],
    [-R - wallT, -wallT, 2 * (R + wallT), wallT],
  ];

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

export function mapKinematicsToScene(family, d, options = {}) {
  if (family === "potential_superposition") {
    return {
      primaryTitle: "Magnus Rotating Cylinder & Cp Contours",
      secondaryTitle: "Surface Pressure Profile Cp(x) Along y = 1.2 m",
      primaryLegend: [{ label: "Stagnation Point", color: "coral" }],
      secondaryLegend: [{ label: "Cp(x, y = 1.2)", color: "primary" }],
      banner: {
        mainHtml: "<strong>Magnus Lift & Kutta–Joukowski:</strong> Adding clockwise circulation shifts top-surface streamlines closer (higher speed, lower pressure) and moves both stagnation points downward.",
        trapHtml: "When |Γ| > 4πU∞a, stagnation points detach off the cylinder surface completely!",
      },
      scene: {
        bounds: d.bounds,
        aspectLock: true,
        xLabel: "Streamwise x (m)",
        yLabel: "Cross-stream y (m)",
        field: { xs: d.xs, ys: d.ys, U: d.U, V: d.V, cp: d.cp },
        cylinderRadius: d.equivalent_cylinder_radius,
        stagnationPoints: d.stagnation_points,
      },
      plot: {
        xLabel: "Streamwise x (m)",
        yLabel: "Pressure coeff Cp",
        xShort: "x",
        series: [{ name: "Cp(y=1.2)", x: d.xs, y: d.cp[Math.floor(d.cp.length * 0.72)], color: "primary" }],
        defaultHud: `Lift L' = ${d.lift_per_unit_span.toFixed(2)} N/m | Γ = ${d.total_circulation.toFixed(2)} m²/s`,
      },
      drawerMetrics: [{ k: "L' Lift", v: `${d.lift_per_unit_span.toFixed(2)} N/m`, color: "var(--accent)" }],
      drawerCards: [
        { k: "Circulation Γ", v: `${d.total_circulation.toFixed(2)} m²/s`, tone: "accent" },
        { k: "Kutta–Joukowski Lift", v: `${d.lift_per_unit_span.toFixed(2)} N/m` },
        { k: "Stagnation Points", v: d.stagnation_points.length ? `${d.stagnation_points.length} on surface` : "Detached off body", tone: d.stagnation_points.length ? "" : "coral" },
      ],
    };
  }

  if (family === "kinematics_equation") {
    const { viewBounds, clippedStream } = computeKinematicsFraming(d);
    const div = !d.classification.curves_coincide;
    const yVals = d.curves.pathline.map((p) => p[1]);
    const ySpan = yVals.length > 1 ? Math.max(...yVals) - Math.min(...yVals) : 0;
    const pr = d.point_probe;
    const st = d.stokes_check;

    return {
      primaryTitle: "Eulerian Field vs. Streamline, Pathline & Streakline",
      secondaryTitle: "Trajectory Comparison x(y) Aligned Vertically",
      primaryLegend: [
        { label: "Streamline", color: "primary" },
        { label: "Pathline", color: "amber" },
        { label: "Streakline", color: "coral", dashed: true },
      ],
      secondaryLegend: [
        { label: "Streamline", color: "primary" },
        { label: "Pathline", color: "amber" },
        { label: "Streakline", color: "coral", dashed: true },
      ],
      banner: {
        mainHtml: div
          ? "<strong>Unsteady Kinematics (Ex. 3.10):</strong> Compare the dark blue instantaneous streamline, orange particle pathline, green Stokes circulation loop, and deforming orange fluid box."
          : "<strong>Steady Flow Equivalence:</strong> Because ∂V/∂t = 0, streamline, pathline, and streakline collapse onto the same geometric path.",
        trapHtml: div
          ? "Exam Trap: Even with constant v = v₀, time-varying u(x,t) splits all three curves!"
          : "Inspect the green Stokes loop and deforming square to test Ωz rotation vs. shear strain.",
        trapTone: div ? "trap" : "insight",
      },
      scene: {
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
      },
      plot: {
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
      },
      drawerMetrics: [
        { k: "Curves Coincide", v: d.classification.curves_coincide ? "YES" : "NO (Diverge)", color: d.classification.curves_coincide ? "var(--ok-green)" : "var(--coral)" },
        { k: "Ωz Probe", v: pr.vorticity_z !== null ? `${pr.vorticity_z.toFixed(3)} s⁻¹` : "-" },
      ],
      drawerCards: [
        { k: "Vorticity Ωz (Symbolic)", tex: `\\Omega_z = ${d.expressions.vorticity_tex}` },
        { k: "Classification", v: `${d.classification.steady ? "Steady" : "Unsteady"} · ${d.classification.irrotational ? "Irrotational" : "Rotational"}`, tone: d.classification.steady ? "" : "amber" },
        { k: "Stokes Theorem Γ = ∬Ωz dA", v: `Line: ${st.circulation_line?.toFixed(3) ?? "-"} vs. Area: ${st.circulation_area_vorticity.toFixed(3)}` },
        { k: "Acceleration at Seed", v: `ax = ${pr.ax?.toFixed(2) ?? "-"}, ay = ${pr.ay?.toFixed(2) ?? "-"} m/s²` },
      ],
    };
  }

  if (family === "vortex_flow") {
    return {
      primaryTitle: `${d.mode.toUpperCase()} Vortex Swirl Plane`,
      secondaryTitle: "Radial Pressure: Exact Euler vs. Naive Bernoulli",
      primaryLegend: d.mode === "rankine" ? [{ label: "Core Rc", color: "amber", dashed: true }] : [],
      secondaryLegend: [
        { label: "Exact Euler p(r)", color: "primary" },
        { label: "Naive Bernoulli p(r)", color: "coral", dashed: true },
      ],
      banner: {
        mainHtml: d.bernoulli_globally_valid
          ? `<strong>Irrotational ${d.mode.toUpperCase()} Vortex:</strong> Outside r = 0, vorticity Ωz = 0 so mechanical head H stays constant radially and Bernoulli matches Euler.`
          : `<strong>Rotational Vortex Core (${d.mode.toUpperCase()}):</strong> Solid-body vorticity Ωz = 2ω makes total head rise radially (∂H/∂n = VΩz/g), driving true pressure outward.`,
        trapHtml: d.bernoulli_globally_valid
          ? "Watch Ωz = 0 and the vanishing discrepancy band on the radial pressure plot."
          : "Bernoulli Trap: Constant-head Bernoulli predicts the OPPOSITE sign (shaded red error band)!",
        trapTone: d.bernoulli_globally_valid ? "insight" : "trap",
      },
      scene: {
        bounds: d.field_2d.bounds,
        aspectLock: true,
        xLabel: "x (m)",
        yLabel: "y (m)",
        field: { ...d.field_2d, vorticity: null },
        vortexCoreRadius: options.coreRadius ?? d.core_radius ?? null,
        spiralCurve: d.spiral_curve,
      },
      plot: {
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
      },
      drawerMetrics: [
        { k: "Δp True", v: `${(d.probes.dp_true / 1000).toFixed(2)} kPa`, color: "var(--accent)" },
        { k: "Δp Naive", v: `${(d.probes.dp_naive / 1000).toFixed(2)} kPa`, color: "var(--coral)" },
      ],
      drawerCards: [
        { k: "Exact Radial Euler Δp", v: `${(d.probes.dp_true / 1000).toFixed(3)} kPa`, tone: "accent" },
        { k: "Naive Bernoulli Δp", v: `${(d.probes.dp_naive / 1000).toFixed(3)} kPa`, tone: Math.abs(d.probes.dp_discrepancy) > 1 ? "coral" : "" },
        { k: "Head Gain ΔH(r₁→r₂)", v: `${d.probes.head_gain_r1_to_r2.toFixed(3)} m`, tone: "amber" },
        { k: "Vorticity Verdict", v: d.bernoulli_globally_valid ? "Irrotational: Global Bernoulli holds." : "Rotational (Ωz ≠ 0): Total head changes across streamlines." },
      ],
    };
  }

  // rotating_vessel
  return {
    primaryTitle: `Open Rotating Cylinder Cross-Section @ ${d.rpm.toFixed(0)} RPM`,
    secondaryTitle: "Free Surface Paraboloid z(r) & Base Uncovering (Ex. 4.8)",
    primaryLegend: [
      { label: "Liquid Paraboloid", color: "primary" },
      ...(d.uncovered_radius > 0 ? [{ label: "Uncovered Dry R₁", color: "coral" }] : []),
    ],
    secondaryLegend: [
      { label: "Free Surface z(r)", color: "primary" },
      { label: "Cylinder Rim H", color: "#475569", dashed: true },
    ],
    banner: {
      mainHtml: "<strong>Rotating Open Vessel (Ex. 4.8):</strong> Solid-body swirl forces a parabolic free surface z(r) = z₀ + ω²r²/(2g) inside the open tank.",
      trapHtml: "Above the rim-touching speed, excess liquid spills overboard first — you cannot conserve full initial volume!",
    },
    scene: buildRotatingVesselScene(d),
    plot: {
      xLabel: "Radius r (m)",
      yLabel: "Surface height z (m)",
      xShort: "r",
      series: [
        { name: "z_surf (m)", x: d.r, y: d.z_surface, color: "primary" },
        { name: "Rim H", x: [0, d.radius], y: [d.vessel_height, d.vessel_height], color: "#475569", dashed: true },
      ],
      vMarkers: d.uncovered_radius > 0 ? [{ x: d.uncovered_radius, label: "Dry R₁", color: "coral" }] : [],
      defaultHud: `Regime: ${d.regime} | Uncovered Area = ${d.uncovered_area.toFixed(4)} m²`,
    },
    drawerMetrics: [
      { k: "Dry Base Area", v: `${d.uncovered_area.toFixed(4)} m²`, color: d.uncovered_area > 0 ? "var(--coral)" : "var(--ok-green)" },
    ],
    drawerCards: [
      { k: "Regime", v: d.regime, tone: "accent" },
      { k: "Paraboloid Depth ω²R²/2g", v: `${d.paraboloid_height.toFixed(3)} m`, tone: "amber" },
      { k: "Uncovered Base πR₁²", v: `${d.uncovered_area.toFixed(4)} m² (Ex 4.8: 0.116 @ 130 rpm)`, tone: d.uncovered_area > 0 ? "coral" : "" },
    ],
  };
}
