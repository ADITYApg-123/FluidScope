/**
 * Viscous & Boundary-Layer Scene Mappers (Two-Layer, Couette-Poiseuille, Slip HB, Falkner-Skan, BL Separation).
 * Wave 0 split from scene_mapper.js (owned by Agent D in Wave 1).
 */

export function mapViscousToScene(family, d, options = {}) {
  if (family === "two_layer_poiseuille") {
    return {
      primaryTitle: "Two-Layer Immiscible Channel Flow Field (Ex. 8.2)",
      secondaryTitle: "Velocity Profile u(y): Shear Continuity vs. Equal-Slope Trap",
      primaryLegend: [{ label: "Interface y = 0", color: "amber", dashed: true }],
      secondaryLegend: [
        { label: "True u(y)", color: "primary" },
        { label: "Equal-Slope Trap", color: "coral", dashed: true },
      ],
      banner: {
        mainHtml: "<strong>Two-Layer Immiscible Channel (Ex. 8.2):</strong> At fluid interface y = 0, velocities match AND shear stress τ = μ(du/dy) must be continuous.",
        trapHtml: "Interface Trap: Matching du₁/dy = du₂/dy is wrong whenever μ₁ ≠ μ₂; peak speed shifts into the less viscous fluid!",
      },
      scene: {
        bounds: d.field_2d.bounds,
        aspectLock: false,
        xLabel: "Channel length x / H",
        yLabel: "Normalized height y / H",
        field: d.field_2d,
        hLines: [{ y: 0, color: "amber", dashed: true, label: "INTERFACE y = 0" }],
      },
      plot: {
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
      },
      drawerMetrics: [
        { k: "μ₁/μ₂", v: (d.mu1 / d.mu2).toFixed(2), color: "var(--accent)" },
        { k: "y_peak/H", v: (d.y_peak / d.H).toFixed(2) },
      ],
      drawerCards: [
        { k: "Interface Shear", v: `${d.interface_shear.toFixed(4)} Pa`, tone: "accent" },
        { k: "Slope Ratio Kink", v: `du₁/dy = ${d.interface_slope_1.toFixed(1)} vs du₂/dy = ${d.interface_slope_2.toFixed(1)} s⁻¹`, tone: "coral" },
        { k: "Offset Velocity Peak", v: `u_max at y/H = ${(d.y_peak / d.H).toFixed(2)} (NOT 0.0)` },
      ],
    };
  }

  if (family === "couette_poiseuille") {
    return {
      primaryTitle: "Generalized Couette–Poiseuille Channel Field",
      secondaryTitle: "Velocity Profile u(y)/U vs. Pure Couette (P = 0)",
      primaryLegend: [],
      secondaryLegend: [
        { label: "Actual u/U", color: "primary" },
        { label: "Pure Couette (P=0)", color: "coral", dashed: true },
      ],
      banner: {
        mainHtml: "<strong>Couette–Poiseuille Backflow (Ex. 8.4):</strong> Moving upper plate (+U) drags fluid forward while adverse P < 0 pushes fluid backward near the fixed wall.",
        trapHtml: "At P = -1 wall shear vanishes; net flux Q reaches zero only at P = -3 (pure recirculation)!",
      },
      scene: {
        bounds: d.field_2d.bounds,
        aspectLock: false,
        xLabel: "Channel length x / H",
        yLabel: "Normalized gap y / H",
        field: d.field_2d,
      },
      plot: {
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
      },
      drawerMetrics: [
        { k: "P", v: d.P.toFixed(2), color: d.P < -1 ? "var(--coral)" : "var(--accent)" },
        { k: "Regime", v: d.regime },
      ],
      drawerCards: [
        { k: "Regime", v: d.regime, tone: d.P < -1 ? "coral" : "accent" },
        { k: "Lower Wall Shear", v: `${d.tau_lower_wall.toFixed(4)} Pa` },
        { k: "Zero-Flux Check", v: d.zero_net_flux ? "P = -3: Net Q = 0 Exact" : `u_avg = ${d.u_avg.toFixed(3)} m/s` },
      ],
    };
  }

  if (family === "slip_herschel_bulkley") {
    const pf = d.plug_fraction;
    const hBands = pf > 0.02 && pf < 0.99 ? [{ yMin: -pf, yMax: pf, fill: "rgba(217, 119, 6, 0.14)" }] : [];
    const hLines = pf > 0.02 && pf < 0.99
      ? [
          { y: pf, color: "amber", dashed: true, label: `+PLUG y/H=${pf.toFixed(2)}` },
          { y: -pf, color: "amber", dashed: true, label: `-PLUG` },
        ]
      : [];

    return {
      primaryTitle: "Navier Wall-Slip + Herschel–Bulkley Plug Channel",
      secondaryTitle: "Velocity Profile u(y): Plug + Slip vs. No-Slip Poiseuille",
      primaryLegend: [{ label: "Unyielded Plug |y|≤yp", color: "amber", dashed: true }],
      secondaryLegend: [
        { label: "True u(y)", color: "primary" },
        { label: "No-Slip Newtonian", color: "coral", dashed: true },
      ],
      banner: {
        mainHtml: "<strong>Wall Slip + Yield-Stress Plug (Ch. 1.6):</strong> Unyielded fluid where |τ| ≤ τ_y moves as a rigid flat plug while hydrophobic Navier slip shifts wall velocity upward.",
        trapHtml: "Using standard No-Slip Newtonian Poiseuille vastly underpredicts slip flux (or misses complete yield locking)!",
      },
      scene: {
        bounds: d.field_2d.bounds,
        aspectLock: false,
        xLabel: "Channel length x / H",
        yLabel: "Normalized gap y / H",
        field: d.field_2d,
        hLines,
        hBands,
      },
      plot: {
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
      },
      drawerMetrics: [
        { k: "Plug %", v: `${(pf * 100).toFixed(0)}%`, color: "var(--amber)" },
        { k: "Flux Ratio", v: `${d.flux_ratio.toFixed(2)}x`, color: "var(--coral)" },
      ],
      drawerCards: [
        { k: "Wall Slip Speed uw", v: `${d.u_slip_wall.toFixed(3)} m/s`, tone: "accent" },
        { k: "Unyielded Plug Core", v: `|y|/H ≤ ${pf.toFixed(2)} (${(pf * 100).toFixed(0)}%)` },
        { k: "Flow Lock Check", v: d.flow_locked ? "Flow Locked (|τ_w| ≤ τ_y)" : `${d.flux_ratio.toFixed(2)}× Newtonian Poiseuille flux`, tone: d.flow_locked ? "coral" : "" },
      ],
    };
  }

  // bl_separation or falkner_skan
  const yCoord = d.eta;
  const uMain = d.u || d.u_over_U;
  const uRef = d.u_zero_pg || d.d2u_deta2;
  const tw = d.wall_shear_dimless !== undefined ? d.wall_shear_dimless : d.wall_shear_fpp0;

  return {
    primaryTitle: "Boundary-Layer Separation & Inflection Point",
    secondaryTitle: "Boundary-Layer Profile u(η)/U∞ vs. Reference",
    primaryLegend: [{ label: "Inflection PI", color: "amber", dashed: true }],
    secondaryLegend: [
      { label: "Profile u / U∞", color: "primary" },
      { label: d.u_zero_pg ? "Zero PG (Λ=0)" : "Curvature d²u/dη²", color: "coral", dashed: true },
    ],
    banner: {
      mainHtml: "<strong>Boundary-Layer Separation Criterion (Eq. 9.41–9.42):</strong> Adverse dp/dx > 0 creates positive wall curvature (∂²u/∂y²|w > 0), forcing an interior inflection point before wall shear reverses.",
      trapHtml: "Potential D'Alembert theory predicts zero drag (Cd = 0) because it ignores viscous separation.",
    },
    scene: {
      bounds: d.field_2d.bounds,
      aspectLock: false,
      xLabel: "Boundary layer x / δ",
      yLabel: "Wall-normal height (η or y/δ)",
      field: d.field_2d,
      hLines: d.inflection_eta !== null && d.inflection_eta !== undefined
        ? [{ y: d.inflection_eta, color: "amber", dashed: true, label: `Inflection η_PI = ${d.inflection_eta.toFixed(2)}` }]
        : [],
    },
    plot: {
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
    },
    drawerMetrics: [
      { k: "Wall Shear", v: tw !== undefined ? tw.toFixed(4) : "-", color: tw !== undefined && tw <= 0 ? "var(--coral)" : "var(--accent)" },
    ],
    drawerCards: [
      { k: "Wall Shear Slope", v: tw !== undefined ? tw.toFixed(4) : "-", tone: tw !== undefined && tw <= 0 ? "coral" : "accent" },
      { k: "Inflection Height", v: d.inflection_eta !== null ? `${d.inflection_eta.toFixed(2)}` : "None (dp/dx ≤ 0)" },
    ],
  };
}
