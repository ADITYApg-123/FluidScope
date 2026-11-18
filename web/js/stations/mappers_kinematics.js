/**
 * Kinematics, Vortex, Rotating Vessel, and Potential Superposition Scene Mappers.
 * Wave 1 Agent C upgrade: Okabe-Ito legend alignment, -0.000 clamping via fmtNum,
 * 2A local/convective + div cards, 2B Head vs Pressure toggle, and exact 2D y-slice label.
 */
import { fmtNum, OKABE_ITO } from "../core/color_scales.js";

function fmt(v, d = 3) {
  if (v === null || v === undefined || v === "") return "-";
  return fmtNum(v, d);
}

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

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
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

  // Clip streamline to roughly the Y span of pathline/streakline for the comparison plot
  const trajPts = [...pl, ...sk];
  let tyMin = Infinity;
  let tyMax = -Infinity;
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
    {
      x: 0,
      y: H * 1.21,
      text: `${fmt(d.rpm, 0)} RPM · ${String(d.regime || "").replaceAll("_", " ")}`,
      color: d.uncovered_area > 0 ? "coral" : "primary",
    },
  ];
  const dashedGuides = [];
  if (d.uncovered_radius > 0.005) {
    dashedGuides.push({
      pts: [
        [-d.uncovered_radius, 0.004],
        [d.uncovered_radius, 0.004],
      ],
      color: "coral",
      width: 3.5,
      dash: [],
    });
    annotations.push({
      x: 0,
      y: 0.06 * H,
      text: `Dry Base R₁ = ${fmt(d.uncovered_radius, 3)} m`,
      color: "coral",
    });
  }
  if (d.spilled_fraction > 0.001) {
    annotations.push({
      x: R * 0.48,
      y: H * 1.06,
      text: `Spilled ${fmt(d.spilled_fraction * 100, 1)}%`,
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
    hLines: [{ y: H, color: "#475569", dashed: true, label: `Rim H = ${fmt(H, 3)} m` }],
    annotations,
    defaultHud: `Regime: ${d.regime} | Uncovered Area = ${fmt(d.uncovered_area, 4)} m² | Critical Uncover RPM = ${fmt(d.critical_full_uncover_rpm, 1)}`,
  };
}

export function mapKinematicsToScene(family, d, options = {}) {
  if (family === "potential_superposition") {
    const cpRows = Array.isArray(d.cp) ? d.cp : [];
    const yIdx = cpRows.length ? Math.min(cpRows.length - 1, Math.floor(cpRows.length * 0.72)) : 0;
    const ySliceVal = d.ys?.[yIdx] ?? 1.11;
    const yLabel = fmt(ySliceVal, 2);
    const hasCylinder = d.equivalent_cylinder_radius !== null && d.equivalent_cylinder_radius !== undefined;
    const gamma = Number(d.total_circulation || 0);
    const detached = hasCylinder && (!d.stagnation_points || d.stagnation_points.length === 0);
    const zeroSpin = hasCylinder && Math.abs(gamma) < 1e-6;
    const isTrap = detached || zeroSpin;

    const stagText = !hasCylinder
      ? "Rankine Half-Body / Source Stream"
      : d.stagnation_points?.length
      ? `${d.stagnation_points.length} on cylinder surface`
      : "Detached off body (|Γ| > 4πU∞a)";

    return {
      primaryTitle: hasCylinder
        ? "Magnus Rotating Cylinder & Cp Contours"
        : "Rankine Half-Body / Potential Superposition",
      secondaryTitle: `Pressure Profile Cp(x) Along y = ${yLabel} m`,
      primaryLegend: hasCylinder ? [{ label: "Stagnation Point", color: OKABE_ITO.red }] : [],
      secondaryLegend: [{ label: `Cp(x, y = ${yLabel} m)`, color: OKABE_ITO.blue }],
      banner: {
        mainHtml: hasCylinder
          ? "<strong>Magnus Lift &amp; Kutta–Joukowski:</strong> Superposing uniform stream, doublet, and circulation Γ generates transverse lift L' = -ρU∞Γ with zero inviscid drag."
          : "<strong>Rankine Half-Body Superposition:</strong> Combining a uniform freestream with a point source models flow past a semi-infinite bluff nose.",
        trapHtml: detached
          ? "Stagnation Trap: Because |Γ| > 4πU∞a, stagnation points lift off the cylinder wall into the surrounding fluid!"
          : zeroSpin
          ? "D'Alembert Paradox: Ideal zero-spin potential flow predicts perfectly symmetric fore/aft Cp and zero drag (CD = 0)!"
          : "Observe stagnation points along the surface; increasing |Γ| beyond 4πU∞a detaches them into the flow.",
        trapTone: isTrap ? "trap" : "insight",
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
        series: [
          {
            name: `Cp(y=${yLabel} m)`,
            x: d.xs || [],
            y: cpRows[yIdx] || [],
            color: OKABE_ITO.blue,
          },
        ],
        defaultHud: `Slice y = ${yLabel} m | Lift L' = ${fmt(d.lift_per_unit_span, 2)} N/m | Γ = ${fmt(gamma, 2)} m²/s`,
      },
      drawerMetrics: [
        { k: "L' Lift", v: `${fmt(d.lift_per_unit_span, 2)} N/m`, color: "var(--accent)" },
        { k: "Γ", v: `${fmt(gamma, 2)} m²/s` },
      ],
      drawerCards: [
        { k: "Circulation Γ", v: `${fmt(gamma, 2)} m²/s`, tone: "accent" },
        { k: "Kutta–Joukowski Lift L'", v: `${fmt(d.lift_per_unit_span, 2)} N/m` },
        { k: "Stagnation Points", v: stagText, tone: detached ? "coral" : "" },
        { k: "Cp Slice Coordinate", v: `y = ${yLabel} m` },
      ],
    };
  }

  if (family === "kinematics_equation") {
    const { viewBounds, clippedStream } = computeKinematicsFraming(d);
    const diverges = !d.classification.curves_coincide;
    const yVals = (d.curves?.pathline || []).map((p) => p[1]);
    const ySpan = yVals.length > 1 ? Math.max(...yVals) - Math.min(...yVals) : 0;
    const pr = d.point_probe || {};
    const st = d.stokes_check || {};
    const expr = d.expressions || {};

    return {
      primaryTitle: "Eulerian Field vs. Streamline, Pathline & Streakline + Fluid Element",
      secondaryTitle: "Trajectory Comparison x(y) & Stokes Check",
      primaryLegend: [
        { label: "Streamline", color: OKABE_ITO.blue },
        { label: "Pathline", color: OKABE_ITO.vermilion },
        { label: "Streakline", color: OKABE_ITO.red, dashed: true },
        { label: "Stokes Loop", color: OKABE_ITO.green, dashed: true },
        { label: "Fluid Element", color: OKABE_ITO.orange },
      ],
      secondaryLegend: [
        { label: "Streamline", color: OKABE_ITO.blue },
        { label: "Pathline", color: OKABE_ITO.vermilion },
        { label: "Streakline", color: OKABE_ITO.red, dashed: true },
      ],
      banner: {
        mainHtml: diverges
          ? "<strong>Unsteady Kinematics (Ex. 3.10):</strong> Because ∂V/∂t ≠ 0, the instantaneous streamline, particle pathline, and dye streakline diverge into distinct curves."
          : "<strong>Steady Flow Equivalence:</strong> Because ∂V/∂t = 0, streamline, pathline, and streakline collapse onto the same geometric path.",
        trapHtml: diverges
          ? "Exam Trap: Even with constant v = v₀, time-varying u(x, t) splits all three curves!"
          : "Green dashed Stokes loop verifies Γ = ∬Ωz dA; amber square tracks element translation, shear, and rotation.",
        trapTone: diverges ? "trap" : "insight",
      },
      scene: {
        bounds: viewBounds,
        aspectLock: true,
        xLabel: "x (m)",
        yLabel: "y (m)",
        field: d.field,
        streamline: d.curves?.streamline || [],
        pathline: d.curves?.pathline || [],
        streakline: d.curves?.streakline || [],
        streamlineColor: OKABE_ITO.blue,
        pathlineColor: OKABE_ITO.vermilion,
        streaklineColor: OKABE_ITO.red,
        initialElement: d.curves?.initial_element,
        deformedElement: d.curves?.deformed_element,
        stokesLoop: st.center ? { center: st.center, radius: st.radius } : null,
        seedPoint: Number.isFinite(pr.x) && Number.isFinite(pr.y) ? [pr.x, pr.y] : null,
      },
      plot: {
        probeAxis: ySpan > 0.05 ? "y" : "x",
        xLabel: "Horizontal coordinate x (m)",
        yLabel: "Vertical coordinate y (m)",
        xShort: "x",
        yShort: "y",
        series: [
          { name: "Streamline", x: clippedStream.map((p) => p[0]), y: clippedStream.map((p) => p[1]), color: OKABE_ITO.blue },
          { name: "Pathline", x: (d.curves?.pathline || []).map((p) => p[0]), y: (d.curves?.pathline || []).map((p) => p[1]), color: OKABE_ITO.vermilion },
          { name: "Streakline", x: (d.curves?.streakline || []).map((p) => p[0]), y: (d.curves?.streakline || []).map((p) => p[1]), color: OKABE_ITO.red, dashed: true },
        ],
        defaultHud: d.classification.curves_coincide
          ? "Steady flow: Streamline, Pathline, and Streakline coincide"
          : "Hover along trajectories to compare Streamline vs. Pathline vs. Streakline",
      },
      drawerMetrics: [
        { k: "Curves", v: d.classification.curves_coincide ? "Coincide" : "Diverge", color: d.classification.curves_coincide ? "var(--ok-green)" : "var(--coral)" },
        { k: "div", v: `${fmt(pr.divergence, 3)} s⁻¹`, color: d.classification.incompressible ? "var(--ok-green)" : "var(--amber)" },
        { k: "Ωz", v: `${fmt(pr.vorticity_z, 3)} s⁻¹` },
        { k: "ax", v: `${fmt(pr.ax, 3)} m/s²` },
      ],
      drawerCards: [
        {
          k: "Flow Classification",
          v: `${d.classification.steady ? "Steady" : "Unsteady"} · ${d.classification.incompressible ? "Incompressible" : `div = ${fmt(pr.divergence, 3)} s⁻¹`} · ${d.classification.irrotational ? "Irrotational" : "Rotational"}`,
          tone: d.classification.steady && d.classification.incompressible ? "ok" : "amber",
        },
        {
          k: "Local vs. Convective Accel (x)",
          v: `ax_local = ${fmt(pr.ax_local, 3)}, ax_convective = ${fmt(pr.ax_convective, 3)} ⇒ ax = ${fmt(pr.ax, 3)} m/s²`,
          tone: Math.abs(Number(pr.ax_local || 0)) > 1e-6 && Math.abs(Number(pr.ax || 0)) < 1e-6 ? "accent" : "",
        },
        {
          k: "Local vs. Convective Accel (y)",
          v: `ay_local = ${fmt(pr.ay_local, 3)}, ay_convective = ${fmt(pr.ay_convective, 3)} ⇒ ay = ${fmt(pr.ay, 3)} m/s²`,
        },
        {
          k: "Symbolic Accel Split (ax)",
          tex: `a_{x,\\text{loc}} = ${expr.ax_local_tex || "0"}, \\quad a_{x,\\text{conv}} = ${expr.ax_conv_tex || "0"}`,
        },
        {
          k: "Divergence & Vorticity Ωz",
          tex: `\\nabla\\cdot\\mathbf{V} = ${expr.div_tex || "0"}, \\quad \\Omega_z = ${expr.vorticity_tex || "0"}`,
        },
        {
          k: "Stokes Check Γ = ∬Ωz dA",
          v: `Line: ${fmt(st.circulation_line, 3)} vs. Area: ${fmt(st.circulation_area_vorticity, 3)}`,
        },
      ],
    };
  }

  if (family === "vortex_flow") {
    const isHead = options.vortexPlotView === "head";
    const coreRadius =
      d.mode === "rankine"
        ? options.vortexCoreRadius ?? options.coreRadius ?? d.core_radius ?? null
        : null;
    const pr = d.probes || {};
    const validBern = Boolean(d.bernoulli_globally_valid);

    return {
      primaryTitle: `${String(d.mode || "").toUpperCase()} Vortex Swirl Plane`,
      secondaryTitle: isHead
        ? "Total Head H(r) - H₁ vs. Constant-Head Bernoulli"
        : "Radial Pressure: Exact Euler vs. Naive Bernoulli",
      primaryLegend: d.mode === "rankine" ? [{ label: "Core Rc", color: OKABE_ITO.vermilion, dashed: true }] : [],
      secondaryLegend: isHead
        ? [
            { label: "True H(r) - H₁ (m)", color: OKABE_ITO.blue },
            { label: "Naive Constant H (0 m)", color: OKABE_ITO.red, dashed: true },
          ]
        : [
            { label: "Exact Euler p(r)", color: OKABE_ITO.blue },
            { label: "Naive Bernoulli p(r)", color: OKABE_ITO.red, dashed: true },
          ],
      banner: {
        mainHtml: validBern
          ? `<strong>Irrotational ${String(d.mode || "").toUpperCase()} Vortex:</strong> Outside r = 0, vorticity Ωz = 0 so mechanical head H stays constant radially and Bernoulli matches Euler.`
          : `<strong>Rotational Vortex Core (${String(d.mode || "").toUpperCase()}):</strong> Solid-body vorticity Ωz = 2ω makes total head rise radially (∂H/∂n = VΩz/g), driving true pressure outward.`,
        trapHtml: validBern
          ? "Ωz = 0 across streamlines: shaded discrepancy band vanishes on the radial plot."
          : "Bernoulli Trap: Constant-head Bernoulli predicts the OPPOSITE sign (shaded crimson error band)!",
        trapTone: validBern ? "insight" : "trap",
      },
      scene: {
        bounds: d.field_2d.bounds,
        aspectLock: true,
        xLabel: "x (m)",
        yLabel: "y (m)",
        field: { ...d.field_2d, vorticity: null },
        vortexCoreRadius: coreRadius,
        spiralCurve: d.spiral_curve,
      },
      plot: isHead
        ? {
            xLabel: "Radius r (m)",
            yLabel: "Total head gain H(r) - H₁ (m)",
            xShort: "r",
            shadeDiff: true,
            series: [
              { name: "True H - H₁ (m)", x: d.r, y: d.head_diff || d.r.map(() => 0), color: OKABE_ITO.blue },
              { name: "Naive Bernoulli (0 m)", x: d.r, y: d.r.map(() => 0), color: OKABE_ITO.red, dashed: true },
            ],
            vMarkers: [
              { x: pr.r1, label: "r₁", color: "#475569" },
              { x: pr.r2, label: "r₂", color: OKABE_ITO.vermilion },
            ],
            defaultHud: `Head gain ΔH(r₁→r₂) = ${fmt(pr.head_gain_r1_to_r2, 3)} m | ${validBern ? "Constant H (Ωz = 0)" : "Cross-stream head rises outward"}`,
          }
        : {
            xLabel: "Radius r (m)",
            yLabel: "Pressure difference p - p₁ (kPa)",
            xShort: "r",
            shadeDiff: true,
            series: [
              { name: "Exact p (kPa)", x: d.r, y: d.p_true.map((p) => p / 1000), color: OKABE_ITO.blue },
              { name: "Naive Bernoulli (kPa)", x: d.r, y: d.p_naive.map((p) => p / 1000), color: OKABE_ITO.red, dashed: true },
            ],
            vMarkers: [
              { x: pr.r1, label: "r₁", color: "#475569" },
              { x: pr.r2, label: "r₂", color: OKABE_ITO.vermilion },
            ],
            defaultHud: `True Δp = ${fmt(pr.dp_true / 1000, 2)} kPa vs Naive = ${fmt(pr.dp_naive / 1000, 2)} kPa`,
          },
      drawerMetrics: [
        { k: "Δp True", v: `${fmt(pr.dp_true / 1000, 2)} kPa`, color: "var(--accent)" },
        { k: "Δp Naive", v: `${fmt(pr.dp_naive / 1000, 2)} kPa`, color: Math.abs(pr.dp_discrepancy || 0) > 1 ? "var(--coral)" : "var(--ink-primary)" },
        { k: "ΔH(r₁→r₂)", v: `${fmt(pr.head_gain_r1_to_r2, 3)} m` },
      ],
      drawerCards: [
        { k: "Exact Radial Euler Δp", v: `${fmt(pr.dp_true / 1000, 3)} kPa`, tone: "accent" },
        { k: "Naive Bernoulli Δp", v: `${fmt(pr.dp_naive / 1000, 3)} kPa`, tone: Math.abs(pr.dp_discrepancy || 0) > 1 ? "coral" : "" },
        { k: "Cross-Stream Head ΔH(r₁→r₂)", v: `${fmt(pr.head_gain_r1_to_r2, 3)} m (Eq. 4.44 / 4.57)`, tone: "amber" },
        {
          k: "Vorticity Verdict",
          v: validBern
            ? "Irrotational (Ωz = 0): Global Bernoulli matches radial Euler."
            : `Rotational core (Ωz = ${fmt(pr.vorticity_r1, 2)} s⁻¹): Total head changes across streamlines.`,
        },
      ],
    };
  }

  // rotating_vessel
  const hasSpillOrUncover = d.spilled_fraction > 0.001 || d.uncovered_area > 0;
  return {
    primaryTitle: `Open Rotating Cylinder Cross-Section @ ${fmt(d.rpm, 0)} RPM`,
    secondaryTitle: "Free Surface Paraboloid z(r) & Base Uncovering (Ex. 4.8)",
    primaryLegend: [
      { label: "Liquid Paraboloid", color: OKABE_ITO.blue },
      ...(d.uncovered_radius > 0 ? [{ label: "Uncovered Dry R₁", color: OKABE_ITO.red }] : []),
    ],
    secondaryLegend: [
      { label: "Free Surface z(r)", color: OKABE_ITO.blue },
      { label: "Cylinder Rim H", color: "#475569", dashed: true },
    ],
    banner: {
      mainHtml: "<strong>Rotating Open Vessel (Ex. 4.8):</strong> Solid-body swirl forces a parabolic free surface z(r) = z₀ + ω²r²/(2g) inside the open tank.",
      trapHtml: hasSpillOrUncover
        ? "Overflow Trap: Above rim-touching speed, excess liquid spills overboard first — you cannot conserve full initial volume!"
        : "Below the rim-touching speed, full liquid volume remains trapped inside the vessel.",
      trapTone: hasSpillOrUncover ? "trap" : "insight",
    },
    scene: buildRotatingVesselScene(d),
    plot: {
      xLabel: "Radius r (m)",
      yLabel: "Surface height z (m)",
      xShort: "r",
      series: [
        { name: "z_surf (m)", x: d.r, y: d.z_surface, color: OKABE_ITO.blue },
        { name: "Rim H", x: [0, d.radius], y: [d.vessel_height, d.vessel_height], color: "#475569", dashed: true },
      ],
      vMarkers: d.uncovered_radius > 0 ? [{ x: d.uncovered_radius, label: "Dry R₁", color: OKABE_ITO.red }] : [],
      defaultHud: `Regime: ${d.regime} | Uncovered Area = ${fmt(d.uncovered_area, 4)} m²`,
    },
    drawerMetrics: [
      { k: "Regime", v: String(d.regime || "").replaceAll("_", " "), color: "var(--accent)" },
      { k: "Dry Base Area", v: `${fmt(d.uncovered_area, 4)} m²`, color: d.uncovered_area > 0 ? "var(--coral)" : "var(--ok-green)" },
      { k: "Spilled", v: `${fmt(d.spilled_fraction * 100, 1)}%` },
    ],
    drawerCards: [
      { k: "Regime", v: d.regime, tone: "accent" },
      { k: "Paraboloid Depth ω²R²/2g", v: `${fmt(d.paraboloid_height, 3)} m`, tone: "amber" },
      { k: "Critical Touch RPM", v: `${fmt(d.critical_full_uncover_rpm, 1)} RPM` },
      { k: "Uncovered Base πR₁²", v: `${fmt(d.uncovered_area, 4)} m² (Ex 4.8: 0.116 @ 130 RPM)`, tone: d.uncovered_area > 0 ? "coral" : "" },
      { k: "Spilled Liquid Fraction", v: `${fmt(d.spilled_fraction * 100, 1)}% overboard` },
    ],
  };
}
