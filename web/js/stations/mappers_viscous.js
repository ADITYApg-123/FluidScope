/**
 * Viscous & Boundary-Layer Scene Mappers
 * (Two-Layer Ex. 8.2, Couette-Poiseuille Ex. 8.4, Slip + Herschel-Bulkley, Falkner-Skan, Pohlhausen BL Separation).
 * Wave 1 — Agent D implementation grounded in Som, Biswas & Chakraborty (3rd Ed.).
 */
import { fmtNum } from "../core/color_scales.js";

function formatSci(val, digits = 2) {
  const n = Number(val);
  if (!Number.isFinite(n)) return "-";
  if (Math.abs(n) < 1e-12) return (0).toFixed(digits);
  return n.toExponential(digits);
}

export function mapViscousToScene(family, d, options = {}) {
  const plotView = options.plotView || "velocity";

  if (family === "two_layer_poiseuille") {
    const isShear = plotView === "shear";
    const yPeakFrac = d.H ? d.y_peak / d.H : 0;
    const muRatio = d.mu2 ? d.mu1 / d.mu2 : 1;

    // Equal-slope student trap shear stress τ_trap = dp/dx * y + μ_i * c1_trap (discontinuous at y = 0 whenever μ1 ≠ μ2)
    const a1 = d.dp_dx / (2.0 * Math.max(d.mu1, 1e-12));
    const a2 = d.dp_dx / (2.0 * Math.max(d.mu2, 1e-12));
    const c1Trap = 0.5 * (a1 - a2) * d.H;
    const muDiffers = Math.abs(d.mu1 - d.mu2) > 1e-9;
    const tauTrap = (d.y || []).map((yv, idx) => {
      const yh = d.y_over_H?.[idx] ?? 0;
      if (Math.abs(yh) < 1e-9 && muDiffers) return NaN;
      return yh < 0 ? d.dp_dx * yv + d.mu1 * c1Trap : d.dp_dx * yv + d.mu2 * c1Trap;
    });

    const plot = isShear
      ? {
          probeAxis: "y",
          xLabel: "Shear stress τ(y) (Pa)",
          yLabel: "Normalized height y / H",
          xShort: "τ (Pa)",
          yShort: "y/H",
          shadeDiff: false,
          hMarkers: [{ y: 0.0, label: "Interface y=0 (τ₁ = τ₂ continuous)", color: "amber" }],
          vMarkers: [
            { x: 0.0, label: "τ = 0 (u_max)", color: "#475569" },
            { x: d.interface_shear, label: `τ_int = ${fmtNum(d.interface_shear, 3)} Pa`, color: "amber" },
          ],
          series: [
            { name: "True τ(y) (Continuous)", x: d.tau, y: d.y_over_H, color: "primary" },
            { name: "Equal-Slope Trap τ (Jumps!)", x: tauTrap, y: d.y_over_H, color: "coral", dashed: true },
          ],
          defaultHud: `Interface y=0: τ₁ = τ₂ = ${fmtNum(d.interface_shear, 4)} Pa (Continuous) | du₁/dy = ${fmtNum(d.interface_slope_1, 1)} vs du₂/dy = ${fmtNum(d.interface_slope_2, 1)} s⁻¹`,
        }
      : {
          probeAxis: "y",
          xLabel: "Axial velocity u (m/s)",
          yLabel: "Normalized height y / H",
          xShort: "u (m/s)",
          yShort: "y/H",
          shadeDiff: true,
          hMarkers: [
            { y: 0.0, label: "Interface y=0 (Slope Kink)", color: "amber" },
            ...(Math.abs(yPeakFrac) > 0.03 ? [{ y: yPeakFrac, label: `u_max @ y/H=${fmtNum(yPeakFrac, 2)}`, color: "primary" }] : []),
          ],
          vMarkers: [{ x: 0.0, label: "u = 0", color: "#475569" }],
          series: [
            { name: "True u(y)", x: d.u_true, y: d.y_over_H, color: "primary" },
            { name: "Equal-Slope Trap", x: d.u_naive_slope_trap, y: d.y_over_H, color: "coral", dashed: true },
          ],
          defaultHud: `Peak speed u_max = ${fmtNum(d.u_peak, 3)} m/s sits at y/H = ${fmtNum(yPeakFrac, 2)} (inside less viscous layer!)`,
        };

    return {
      primaryTitle: "Two-Layer Immiscible Channel Flow Field (Ex. 8.2)",
      secondaryTitle: isShear
        ? "Shear Stress τ(y): Interface Continuity vs. Equal-Slope Jump"
        : "Velocity Profile u(y): Shear Continuity vs. Equal-Slope Trap",
      primaryLegend: [
        { label: "Interface y = 0", color: "amber", dashed: true },
        { label: `Lower μ₁ (${fmtNum(d.mu1 * 1000, 1)} mPa·s)`, color: "primary" },
      ],
      secondaryLegend: isShear
        ? [
            { label: "True τ(y) Continuous", color: "primary" },
            { label: "Equal-Slope Trap τ", color: "coral", dashed: true },
          ]
        : [
            { label: "True u(y)", color: "primary" },
            { label: "Equal-Slope Trap", color: "coral", dashed: true },
          ],
      banner: {
        mainHtml:
          "<strong>Two-Layer Immiscible Channel (Ex. 8.2):</strong> At liquid interface y = 0, both velocity u and shear stress τ = μ(du/dy) stay continuous across layers.",
        trapHtml:
          "Interface Trap: Matching du₁/dy = du₂/dy creates an unphysical shear jump whenever μ₁ ≠ μ₂; peak speed shifts into the lower-viscosity layer!",
      },
      scene: {
        bounds: d.field_2d.bounds,
        aspectLock: false,
        xLabel: "Channel length x / H",
        yLabel: "Normalized height y / H (-1 lower μ₁, +1 upper μ₂)",
        field: d.field_2d,
        hLines: [
          {
            y: 0.0,
            color: "amber",
            dashed: true,
            label: `Interface y=0: τ₁ = τ₂ = ${fmtNum(d.interface_shear, 3)} Pa (slope kink)`,
          },
        ],
      },
      plot,
      drawerMetrics: [
        { k: "μ₁/μ₂", v: fmtNum(muRatio, 2), color: "var(--accent)" },
        { k: "τ_int", v: `${fmtNum(d.interface_shear, 4)} Pa`, color: "var(--amber)" },
        { k: "y_peak/H", v: fmtNum(yPeakFrac, 2), color: "var(--accent)" },
        { k: "u_peak", v: `${fmtNum(d.u_peak, 3)} m/s` },
        { k: "Q_total", v: `${fmtNum(d.q_total * 1e4, 3)} cm²/s` },
      ],
      drawerCards: [
        {
          k: "True Interface Condition",
          v: `u₁(0) = u₂(0) = ${fmtNum(d.interface_velocity, 3)} m/s | τ_int = ${fmtNum(d.interface_shear, 4)} Pa`,
          tone: "accent",
        },
        {
          k: "Slope Kink at y = 0",
          v: `du₁/dy = ${fmtNum(d.interface_slope_1, 1)} s⁻¹ ≠ du₂/dy = ${fmtNum(d.interface_slope_2, 1)} s⁻¹`,
          tone: "coral",
        },
        {
          k: "Peak Offset Check",
          v: `u_max = ${fmtNum(d.u_peak, 3)} m/s at y/H = ${fmtNum(yPeakFrac, 2)} (NOT 0.00)`,
        },
        {
          k: "Layer Flux Split",
          v: `q₁ = ${fmtNum(d.q_layer1 * 1e4, 3)} cm²/s | q₂ = ${fmtNum(d.q_layer2 * 1e4, 3)} cm²/s`,
        },
      ],
      deepCards: [
        {
          k: "Stress Continuity Balance",
          tex: String.raw`\left.\mu_1 \frac{du_1}{dy}\right|_{0^-} = \left.\mu_2 \frac{du_2}{dy}\right|_{0^+} = \tau_{\text{int}}`,
        },
        {
          k: "Layer Viscosities & Gradient",
          v: `μ₁ = ${fmtNum(d.mu1 * 1000, 1)} mPa·s | μ₂ = ${fmtNum(d.mu2 * 1000, 1)} mPa·s | dp/dx = ${fmtNum(d.dp_dx, 0)} Pa/m`,
        },
        {
          k: "Total Channel Discharge",
          v: `Q_total = ${formatSci(d.q_total, 3)} m²/s (Half-height H = ${fmtNum(d.H * 1000, 2)} mm)`,
        },
      ],
    };
  }

  if (family === "couette_poiseuille") {
    const isShear = plotView === "shear";
    const tauCouetteConst = (d.mu * d.U) / Math.max(d.H, 1e-12);
    const tauTrue = (d.y_over_H || []).map((yh) => tauCouetteConst * (1.0 + d.P * (1.0 - 2.0 * yh)));
    const tauCouette = (d.y_over_H || []).map(() => tauCouetteConst);
    const zeroShearPlane = Math.abs(d.P) > 1e-6 ? (1.0 + d.P) / (2.0 * d.P) : null;
    const hasInteriorZeroShear = zeroShearPlane !== null && zeroShearPlane > 0.02 && zeroShearPlane < 0.98;

    const plot = isShear
      ? {
          probeAxis: "y",
          xLabel: "Shear stress τ(y) (Pa)",
          yLabel: "Normalized gap y / H",
          xShort: "τ (Pa)",
          yShort: "y/H",
          shadeDiff: true,
          vMarkers: [{ x: 0.0, label: "τ = 0 (u extremum)", color: "#475569" }],
          hMarkers: hasInteriorZeroShear
            ? [{ y: zeroShearPlane, label: `τ=0 @ y/H=${fmtNum(zeroShearPlane, 2)}`, color: "amber" }]
            : [],
          series: [
            { name: "Actual τ(y) (Pa)", x: tauTrue, y: d.y_over_H, color: "primary" },
            { name: "Pure Couette μU/H", x: tauCouette, y: d.y_over_H, color: "coral", dashed: true },
          ],
          defaultHud: `τw,0 = ${fmtNum(d.tau_lower_wall, 4)} Pa | τw,H = ${fmtNum(d.tau_upper_wall, 4)} Pa | Pure Couette = ${fmtNum(tauCouetteConst, 4)} Pa`,
        }
      : {
          probeAxis: "y",
          xLabel: "Normalized velocity u / U",
          yLabel: "Normalized gap y / H",
          xShort: "u/U",
          yShort: "y/H",
          shadeDiff: true,
          vMarkers: [{ x: 0.0, label: "u = 0 (Backflow < 0)", color: "#475569" }],
          series: [
            { name: "Actual u/U", x: d.u_over_U, y: d.y_over_H, color: "primary" },
            {
              name: "Pure Couette (P=0)",
              x: d.u_pure_couette.map((u) => u / d.U),
              y: d.y_over_H,
              color: "coral",
              dashed: true,
            },
          ],
          defaultHud: `Regime: ${d.regime} | P = ${fmtNum(d.P, 2)} | Q = ${fmtNum(d.q_per_width * 1e4, 3)} cm²/s`,
        };

    return {
      primaryTitle: "Generalized Couette–Poiseuille Channel Field",
      secondaryTitle: isShear
        ? "Linear Shear Stress τ(y) vs. Pure Couette Constant (μU/H)"
        : "Velocity Profile u(y)/U vs. Pure Linear Couette (P = 0)",
      primaryLegend: [{ label: "Moving Upper Plate (+U)", color: "primary" }],
      secondaryLegend: isShear
        ? [
            { label: "Actual τ(y) (Pa)", color: "primary" },
            { label: "Pure Couette μU/H", color: "coral", dashed: true },
          ]
        : [
            { label: "Actual u/U", color: "primary" },
            { label: "Pure Couette (P=0)", color: "coral", dashed: true },
          ],
      banner: {
        mainHtml:
          "<strong>Couette–Poiseuille Competition (Ex. 8.4):</strong> Shear drag from the upper plate (+U) competes with axial pressure gradient P = (-dp/dx)H² / (2μU).",
        trapHtml:
          "At P = -1 lower-wall shear τw,0 vanishes; reverse backflow grows until net discharge vanishes completely at P = -3!",
      },
      scene: {
        bounds: d.field_2d.bounds,
        aspectLock: false,
        xLabel: "Channel length x / H",
        yLabel: "Normalized gap y / H",
        field: d.field_2d,
        hLines: hasInteriorZeroShear
          ? [{ y: zeroShearPlane, color: "amber", dashed: true, label: `Zero Shear τ=0 (y/H = ${fmtNum(zeroShearPlane, 2)})` }]
          : [],
      },
      plot,
      drawerMetrics: [
        { k: "P", v: fmtNum(d.P, 2), color: d.P < -1 ? "var(--coral)" : "var(--accent)" },
        { k: "τw,0", v: `${fmtNum(d.tau_lower_wall, 4)} Pa`, color: d.tau_lower_wall <= 0 ? "var(--coral)" : "var(--accent)" },
        { k: "τw,H", v: `${fmtNum(d.tau_upper_wall, 4)} Pa` },
        { k: "Net Q", v: `${fmtNum(d.q_per_width * 1e4, 3)} cm²/s` },
        { k: "Regime", v: d.regime },
      ],
      drawerCards: [
        { k: "Flow Regime (Eq. 8.42)", v: d.regime, tone: d.P < -1 ? "coral" : "accent" },
        {
          k: "Lower Wall Shear τw,0",
          v: `${fmtNum(d.tau_lower_wall, 4)} Pa (Reverses for P < -1)`,
          tone: d.tau_lower_wall < 0 ? "coral" : "",
        },
        {
          k: "Upper Wall Shear τw,H",
          v: `${fmtNum(d.tau_upper_wall, 4)} Pa (Couette ref = ${fmtNum(tauCouetteConst, 4)} Pa)`,
        },
        {
          k: "Recirculation Check (Ex. 8.4)",
          v: d.zero_net_flux
            ? "P = -3: Net Q = 0.000 Exact Cancellation"
            : `Net Q = 0 at P = -3 (u_avg = ${fmtNum(d.u_avg, 3)} m/s)`,
          tone: d.zero_net_flux ? "amber" : "",
        },
      ],
      deepCards: [
        {
          k: "Exact Analytical Shear τ(y)",
          tex: String.raw`\tau(y) = \frac{\mu U}{H}\left[1 + P\left(1 - 2\frac{y}{H}\right)\right]`,
        },
        {
          k: "Channel Scale & Pressure Gradient",
          v: `H = ${fmtNum(d.H * 1000, 2)} mm | U = ${fmtNum(d.U, 2)} m/s | dp/dx = ${fmtNum(d.dp_dx, 2)} Pa/m`,
        },
        {
          k: "Volume Flux per Unit Width",
          v: `q = ${formatSci(d.q_per_width, 3)} m²/s (μ = ${fmtNum(d.mu * 1000, 3)} mPa·s)`,
        },
      ],
    };
  }

  if (family === "slip_herschel_bulkley") {
    const isShear = plotView === "shear";
    const pf = Number(d.plug_fraction) || 0;
    const clampedPf = Math.min(1.0, Math.max(0.0, pf));
    const hasPlugBand = pf > 0.02;
    const hBands = hasPlugBand
      ? [{ yMin: -clampedPf, yMax: clampedPf, fill: "rgba(217, 119, 6, 0.16)" }]
      : [];
    const plotHBands = hasPlugBand
      ? [
          {
            yMin: -clampedPf,
            yMax: clampedPf,
            fill: "rgba(217, 119, 6, 0.16)",
            ...(pf >= 0.99 ? { label: "100% Unyielded Solid Plug (|τ| ≤ τ_y)", color: "amber" } : {}),
          },
        ]
      : [];
    const hLines =
      pf > 0.02 && pf < 0.99
        ? [
            { y: pf, color: "amber", dashed: true, label: `+Plug y/H = ${fmtNum(pf, 2)}` },
            { y: -pf, color: "amber", dashed: true, label: `-Plug y/H = -${fmtNum(pf, 2)}` },
          ]
        : [];

    const shearMarkersV = [{ x: 0.0, label: "τ = 0", color: "#475569" }];
    if (d.tau_y > 0.05) {
      shearMarkersV.push(
        { x: -d.tau_y, label: `-τ_y (${fmtNum(-d.tau_y, 1)} Pa)`, color: "amber" },
        { x: d.tau_y, label: `+τ_y (${fmtNum(d.tau_y, 1)} Pa)`, color: "amber" }
      );
    }

    const plot = isShear
      ? {
          probeAxis: "y",
          xLabel: "Shear stress τ(y) (Pa)",
          yLabel: "Normalized gap y / H",
          xShort: "τ (Pa)",
          yShort: "y/H",
          shadeDiff: false,
          hBands: plotHBands,
          hMarkers:
            pf > 0.02 && pf < 0.99
              ? [
                  { y: -pf, label: `-y_p (|τ| ≤ τ_y)`, color: "amber" },
                  { y: pf, label: `+y_p (Solid Plug)`, color: "amber" },
                ]
              : [],
          vMarkers: shearMarkersV,
          series: [{ name: "Shear Stress τ(y) (Pa)", x: d.tau, y: d.y_over_H, color: "primary" }],
          defaultHud: d.flow_locked
            ? `Flow locked: |τ_w| = ${fmtNum(d.tau_wall, 2)} Pa ≤ τ_y = ${fmtNum(d.tau_y, 2)} Pa (100% solid plug)`
            : `|τ_w| = ${fmtNum(d.tau_wall, 2)} Pa vs τ_y = ${fmtNum(d.tau_y, 2)} Pa | Unyielded solid plug |τ| ≤ τ_y (${fmtNum(pf * 100, 0)}%)`,
        }
      : {
          probeAxis: "y",
          xLabel: "Axial velocity u (m/s)",
          yLabel: "Normalized gap y / H",
          xShort: "u (m/s)",
          yShort: "y/H",
          shadeDiff: true,
          hBands: plotHBands,
          hMarkers:
            pf > 0.02 && pf < 0.99
              ? [
                  { y: -pf, label: "-y_p", color: "amber" },
                  { y: pf, label: "+y_p", color: "amber" },
                ]
              : [],
          vMarkers: [{ x: 0.0, label: "u = 0", color: "#475569" }],
          series: [
            { name: "True u(y)", x: d.u_true, y: d.y_over_H, color: "primary" },
            { name: "No-Slip Newtonian", x: d.u_newton_noslip, y: d.y_over_H, color: "coral", dashed: true },
          ],
          defaultHud: d.flow_locked
            ? `Flow locked: |τ_wall| = ${fmtNum(d.tau_wall, 2)} Pa ≤ τ_y = ${fmtNum(d.tau_y, 2)} Pa!`
            : `Wall slip uw = ${fmtNum(d.u_slip_wall, 3)} m/s | Plug = ${fmtNum(pf * 100, 0)}% | Flux ratio = ${fmtNum(d.flux_ratio, 2)}x`,
        };

    return {
      primaryTitle: "Navier Wall-Slip + Herschel–Bulkley Plug Channel",
      secondaryTitle: isShear
        ? "Shear Stress τ(y) & Unyielded Solid Plug Zone (|τ| ≤ τ_y)"
        : "Velocity Profile u(y): Yield Plug + Slip vs. No-Slip Poiseuille",
      primaryLegend: [
        { label: "Unyielded Plug |y|≤y_p", color: "amber", dashed: true },
        { label: "Slip Profile u(y)", color: "primary" },
      ],
      secondaryLegend: isShear
        ? [
            { label: "Linear τ(y) (Pa)", color: "primary" },
            { label: "Plug Threshold ±τ_y", color: "amber", dashed: true },
          ]
        : [
            { label: "True u(y)", color: "primary" },
            { label: "No-Slip Newtonian", color: "coral", dashed: true },
          ],
      banner: {
        mainHtml:
          "<strong>Non-Newtonian Yield Core &amp; Navier Slip (Ch. 1.6):</strong> Wherever |τ| ≤ τ_y near center, fluid travels as a rigid solid plug while Navier wall slip adds nonzero wall speed u_w.",
        trapHtml:
          "Standard No-Slip Newtonian Poiseuille underpredicts slip enhancement OR misses complete yield-stress flow locking!",
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
      plot,
      drawerMetrics: [
        { k: "Plug %", v: `${fmtNum(pf * 100, 0)}%`, color: "var(--amber)" },
        { k: "u_slip", v: `${fmtNum(d.u_slip_wall, 3)} m/s`, color: "var(--accent)" },
        { k: "Flux Ratio", v: `${fmtNum(d.flux_ratio, 2)}x`, color: "var(--coral)" },
        { k: "|τ_w|", v: `${fmtNum(d.tau_wall, 2)} Pa` },
        { k: "Status", v: d.flow_locked ? "LOCKED" : "YIELDED", color: d.flow_locked ? "var(--coral)" : "var(--ok-green)" },
      ],
      drawerCards: [
        {
          k: "Wall Slip Speed u_w",
          v: `${fmtNum(d.u_slip_wall, 3)} m/s (l_s = ${fmtNum(d.slip_length * 1000, 2)} mm)`,
          tone: "accent",
        },
        {
          k: "Unyielded Solid Plug Zone",
          v: `|τ| ≤ ${fmtNum(d.tau_y, 2)} Pa ⇒ Rigid core |y|/H ≤ ${fmtNum(pf, 2)} (${fmtNum(pf * 100, 0)}%)`,
          tone: "amber",
        },
        {
          k: "No-Slip Newtonian Trap",
          v: d.flow_locked
            ? "Flow Locked (Zero flux vs. parabolic prediction!)"
            : `True flux is ${fmtNum(d.flux_ratio, 2)}× textbook No-Slip`,
          tone: "coral",
        },
        {
          k: "Peak Core Velocity",
          v: `u_max = ${fmtNum(d.u_max_true, 3)} m/s (Newtonian ref: ${fmtNum(d.u_max_newton_noslip, 3)} m/s)`,
        },
      ],
      deepCards: [
        {
          k: "Herschel–Bulkley + Navier Slip Law",
          tex: String.raw`|\tau| = \tau_y + K\left|\frac{du}{dy}\right|^n, \qquad u_w = l_s\left|\frac{du}{dy}\right|_w`,
        },
        {
          k: "Rheology & Wall Stress",
          v: `n = ${fmtNum(d.n, 2)} | K = ${fmtNum(d.K, 3)} Pa·sⁿ | τ_w = ${fmtNum(d.tau_wall, 2)} Pa | dp/dx = ${fmtNum(d.dp_dx, 0)} Pa/m`,
        },
        {
          k: "Channel Discharge Comparison",
          v: `q_true = ${formatSci(d.q_true, 3)} m²/s vs q_Newton = ${formatSci(d.q_newton_noslip, 3)} m²/s`,
        },
      ],
    };
  }

  // Lab 3A: bl_separation or falkner_skan
  const isFS = family === "falkner_skan" || d.u_over_U !== undefined;
  const sepPlotView = options.sepPlotView || (plotView === "cp" ? "cp" : "profile");
  const isCpView = sepPlotView === "cp";
  const cylCp = d.cylinder_cp || options.cylinderCp || null;

  const yCoord = d.eta;
  const uMain = isFS ? d.u_over_U : d.u;
  const uRef = isFS ? d.d2u_deta2 : d.u_zero_pg;
  const tw = isFS ? d.wall_shear_fpp0 : d.wall_shear_dimless;
  const curv0 = isFS ? d.wall_curvature_d2u0 : d.wall_curvature_dimless;
  const hasInflection = d.inflection_eta !== null && d.inflection_eta !== undefined;

  let plot;
  let secondaryTitle;
  let secondaryLegend;

  if (isCpView) {
    secondaryTitle = isFS
      ? "Cylinder Cp(θ) Trap (Fig. 9.5 · Pohlhausen Reference)"
      : "Cylinder Pressure Cp(θ): Separated Wake vs. Potential D'Alembert (Fig. 9.5)";
    secondaryLegend = [
      { label: "Separated Wake Cp(θ)", color: "primary" },
      { label: "Potential Cp = 1 - 4sin²θ", color: "coral", dashed: true },
    ];
    if (cylCp && Array.isArray(cylCp.theta_deg) && cylCp.theta_deg.length > 1) {
      plot = {
        probeAxis: "x",
        xLabel: "Cylinder azimuth θ from front stagnation (deg)",
        yLabel: "Pressure coefficient Cp = (p - p∞) / ½ρU∞²",
        xShort: "θ°",
        shadeDiff: true,
        vMarkers: [
          {
            x: cylCp.sep_angle_deg,
            label: `Laminar Sep θ ≈ ${fmtNum(cylCp.sep_angle_deg, 0)}°`,
            color: "amber",
          },
        ],
        hMarkers: [{ y: 0.0, label: "Cp = 0", color: "#475569" }],
        series: [
          { name: "Separated Wake Cp", x: cylCp.theta_deg, y: cylCp.cp_separated, color: "primary" },
          { name: "Ideal Potential Cp", x: cylCp.theta_deg, y: cylCp.cp_potential, color: "coral", dashed: true },
        ],
        defaultHud: `Separated Wake Cd_p = ${fmtNum(cylCp.cd_pressure_separated, 2)} vs Potential Cd_p = ${fmtNum(cylCp.cd_pressure_ideal, 2)} (θ_sep ≈ ${fmtNum(cylCp.sep_angle_deg, 0)}°)`,
      };
    } else {
      plot = {
        xLabel: "Cylinder azimuth θ (deg)",
        yLabel: "Pressure coefficient Cp",
        series: [],
        emptyMessage: "Fetching Cylinder Cp(θ) Reference (Fig. 9.5)...",
        emptySub: "Loading Pohlhausen / Fig. 9.5 separated vs. potential Cp(θ) dataset from /api/bl_separation.",
        emptyTone: "primary",
        defaultHud: "Loading Fig. 9.5 Cylinder Cp(θ) dataset...",
      };
    }
  } else {
    secondaryTitle = isFS
      ? "Similarity Profile u(η)/U∞ & Curvature ∂²u/∂η²"
      : "Pohlhausen u(y)/U∞ vs. Zero-Pressure-Gradient Flat Plate";
    secondaryLegend = isFS
      ? [
          { label: "Profile u / U∞", color: "primary" },
          { label: "Curvature d²u/dη²", color: "coral", dashed: true },
        ]
      : [
          { label: "Profile u/U (Λ)", color: "primary" },
          { label: "Zero PG (Λ = 0)", color: "coral", dashed: true },
        ];
    plot = {
      probeAxis: "y",
      xLabel: isFS ? "Dimensionless velocity u/U∞ & curvature" : "Dimensionless velocity u / U∞",
      yLabel: isFS ? "Similarity coordinate η" : "Wall-normal height y / δ",
      xShort: isFS ? "val" : "u/U",
      yShort: isFS ? "η" : "y/δ",
      shadeDiff: !isFS,
      vMarkers: [{ x: 0.0, label: "u = 0 (Backflow < 0)", color: "#475569" }],
      hMarkers: hasInflection ? [{ y: d.inflection_eta, label: "Inflection PI", color: "amber" }] : [],
      series: [
        { name: isFS ? "u / U∞" : "u(Λ)", x: uMain, y: yCoord, color: "primary" },
        { name: isFS ? "d²u/dη²" : "Flat Plate (Λ=0)", x: uRef, y: yCoord, color: "coral", dashed: true },
      ],
      defaultHud: isFS
        ? `Cf·√Rex = ${fmtNum(d.cf_sqrt_rex, 4)} | Wall f''(0) = ${fmtNum(d.wall_shear_fpp0, 4)} | Inflection η_PI = ${hasInflection ? fmtNum(d.inflection_eta, 2) : "None"}`
        : `Wall shear slope = ${fmtNum(d.wall_shear_dimless, 3)} (τw=0 at Λ=-12) | Backflow: ${d.has_backflow ? "ACTIVE" : "NONE"}`,
    };
  }

  const primaryTitle = isFS
    ? "Falkner–Skan Boundary-Layer Velocity Field"
    : "Boundary-Layer Separation & Reverse-Flow Pocket";
  const banner = isFS
    ? {
        mainHtml:
          "<strong>Falkner–Skan Wedge Boundary Layer:</strong> Negative Hartree β pushes the similarity profile toward an inflectional S-shape before wall shear f''(0) hits zero at β ≈ -0.1988.",
        trapHtml:
          "Adverse dp/dx > 0 forces positive wall curvature (∂²u/∂y²|w > 0), creating an interior inflection point ahead of separation!",
      }
    : {
        mainHtml: d.has_backflow
          ? "<strong>Flow Reversal Active (Λ < -12):</strong> Adverse dp/dx > 0 reverses near-wall fluid backward (u < 0), detaching the boundary layer."
          : "<strong>Adverse Pressure Inflection (Eq. 9.41–9.42):</strong> Positive wall curvature bends the velocity profile into an S-curve with an interior inflection height.",
        trapHtml:
          "Inviscid potential flow misses separation completely and predicts zero pressure drag (D'Alembert's Paradox — see Cylinder Cp(θ) toggle)!",
      };

  const drawerMetrics = isFS
    ? [
        { k: "β", v: fmtNum(d.beta, 3), color: d.adverse_gradient ? "var(--amber)" : "var(--accent)" },
        { k: "f''(0)", v: fmtNum(d.wall_shear_fpp0, 4), color: d.near_separation ? "var(--coral)" : "var(--accent)" },
        { k: "Cf√Rex", v: fmtNum(d.cf_sqrt_rex, 4) },
        { k: "H = δ*/θ", v: fmtNum(d.shape_factor_H, 2) },
        { k: "η_PI", v: hasInflection ? fmtNum(d.inflection_eta, 2) : "None", color: hasInflection ? "var(--amber)" : "" },
      ]
    : [
        { k: "Λ", v: fmtNum(d.lambda_pg, 1), color: d.lambda_pg < 0 ? "var(--amber)" : "var(--accent)" },
        { k: "τw Slope", v: fmtNum(d.wall_shear_dimless, 3), color: d.separated ? "var(--coral)" : "var(--accent)" },
        { k: "Curv |w", v: fmtNum(d.wall_curvature_dimless, 2), color: d.wall_curvature_dimless > 0 ? "var(--coral)" : "" },
        { k: "y_PI/δ", v: hasInflection ? fmtNum(d.inflection_eta, 2) : "None", color: hasInflection ? "var(--amber)" : "" },
        ...(cylCp ? [{ k: "Cyl Cd_p", v: `${fmtNum(cylCp.cd_pressure_ideal, 2)} vs ${fmtNum(cylCp.cd_pressure_separated, 2)}` }] : []),
      ];

  const drawerCards = isFS
    ? [
        {
          k: "Hartree Parameter β",
          v: `${fmtNum(d.beta, 3)} (m = ${fmtNum(d.hartree_m, 3)}, separation limit βc ≈ -0.1988)`,
          tone: d.near_separation ? "coral" : "amber",
        },
        {
          k: "Wall Shear f''(0)",
          v: `${fmtNum(d.wall_shear_fpp0, 4)} | Cf·√Rex = ${fmtNum(d.cf_sqrt_rex, 4)}`,
          tone: d.near_separation ? "coral" : "accent",
        },
        {
          k: "Wall Curvature (Eq. 9.42)",
          v: `d²u/dη²(0) = ${fmtNum(curv0, 3)} (${d.adverse_gradient ? "> 0 ⇒ adverse dp/dx > 0" : "≤ 0 ⇒ favorable/zero"})`,
          tone: d.adverse_gradient ? "coral" : "",
        },
        {
          k: "Inflection Point (Fig. 9.6)",
          v: hasInflection ? `Located at η_PI = ${fmtNum(d.inflection_eta, 2)}` : "None (Favorable or zero gradient)",
          tone: hasInflection ? "amber" : "",
        },
      ]
    : [
        {
          k: "Separation Criterion (Eq. 9.41)",
          v: d.separated ? "Separated (∂u/∂y|w ≤ 0)" : "Attached (∂u/∂y|w > 0)",
          tone: d.separated ? "coral" : "accent",
        },
        {
          k: "Wall Curvature (Eq. 9.42)",
          v: `∂²u/∂y²|w = ${fmtNum(d.wall_curvature_dimless, 2)} (${d.lambda_pg < 0 ? "dp/dx > 0 ⇒ Inflection forced" : "Favorable dp/dx"})`,
          tone: d.lambda_pg < 0 ? "amber" : "",
        },
        {
          k: "Inflection Point Height",
          v: hasInflection ? `y_PI / δ = ${fmtNum(d.inflection_eta, 2)}` : "None (Λ ≥ 0)",
        },
        {
          k: "D'Alembert Drag Trap (Fig. 9.5)",
          v: cylCp
            ? `Potential Cd_p = ${fmtNum(cylCp.cd_pressure_ideal, 2)} vs. Separated Wake Cd_p ≈ ${fmtNum(cylCp.cd_pressure_separated, 2)} (θ_sep ≈ ${fmtNum(cylCp.sep_angle_deg, 0)}°)`
            : "Switch to Cylinder Cp(θ) view to compare ideal vs. separated pressure recovery",
          tone: "coral",
        },
      ];

  const deepCards = isFS
    ? [
        {
          k: "Falkner–Skan Similarity ODE",
          tex: String.raw`f''' + f\,f'' + \beta\left(1 - (f')^2\right) = 0, \qquad m = \frac{\beta}{2 - \beta}`,
        },
        {
          k: "Boundary-Layer Integral Thicknesses",
          v: `δ*_η = ${fmtNum(d.delta_star_eta, 3)} | θ_η = ${fmtNum(d.theta_eta, 3)} | Shape Factor H = ${fmtNum(d.shape_factor_H, 3)}`,
        },
        {
          k: "Blasius Flat-Plate Equivalent",
          v: `f''_Blasius = ${fmtNum(d.wall_shear_blasius_equiv, 4)} (Blasius flat plate = 0.3321)`,
        },
        ...(cylCp
          ? [
              {
                k: "Cylinder Fig. 9.5 Reference",
                v: `Separated Cd_p = ${fmtNum(cylCp.cd_pressure_separated, 2)} vs Potential Cd_p = ${fmtNum(cylCp.cd_pressure_ideal, 2)} at θ_sep = ${fmtNum(cylCp.sep_angle_deg, 0)}°`,
              },
            ]
          : []),
      ]
    : [
        {
          k: "Wall Compatibility Condition (Eq. 9.42)",
          tex: String.raw`\left.\mu\frac{\partial^2 u}{\partial y^2}\right|_w = \frac{dp}{dx}, \qquad \Lambda = -\frac{\delta^2}{\mu U}\frac{dp}{dx}`,
        },
        {
          k: "Pohlhausen Quartic Wall Shear",
          v: `du/dη|w = 2 + Λ/6 = ${fmtNum(tw, 3)} | Backflow active: ${d.has_backflow ? "Yes (u < 0)" : "No"}`,
        },
        {
          k: "Fig. 9.5 Pressure Drag Integral",
          tex: String.raw`C_{d,p} = \int_0^\pi C_p(\theta)\cos\theta\,d\theta`,
        },
      ];

  return {
    primaryTitle,
    secondaryTitle,
    primaryLegend: [
      { label: isFS ? "Inflection η_PI" : "Inflection PI", color: "amber", dashed: true },
    ],
    secondaryLegend,
    banner,
    scene: {
      bounds: d.field_2d.bounds,
      aspectLock: false,
      xLabel: isFS ? "Streamwise coordinate x / δ" : "Boundary layer streamwise x / δ",
      yLabel: isFS ? "Similarity height η" : "Wall-normal y / δ",
      field: d.field_2d,
      hLines: hasInflection
        ? [
            {
              y: d.inflection_eta,
              color: "amber",
              dashed: true,
              label: isFS
                ? `Inflection η_PI = ${fmtNum(d.inflection_eta, 2)}`
                : `Inflection y/δ = ${fmtNum(d.inflection_eta, 2)}`,
            },
          ]
        : [],
    },
    plot,
    drawerMetrics,
    drawerCards,
    deepCards,
  };
}
