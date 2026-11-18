/**
 * Station 03: Viscous Twists & Boundary-Layer Separation (Ch. 1.6, 8.3, 9.3, 9.6, 9.8).
 */
export function renderStation03(ctx) {
  const {
    state,
    apiPost,
    debouncedRun,
    flowEngine,
    plotEngine,
    setLegend,
    setConceptBanner,
    clearSecondaryControls,
    setDrawerMetrics,
    setDrawerCards,
    renderRockers,
    refreshAudit,
    openLab,
  } = ctx;

  clearSecondaryControls();

  if (!state.bay03Mode) state.bay03Mode = "separation"; // separation | couette | twolayer | slip_hb
  if (!state.s3) {
    state.s3 = {
      lambda_pg: -6.0,
      beta_fs: -0.15,
      use_falkner_skan: false,
      P_cp: -1.5,
      mu1: 0.005,
      mu2: 0.001,
      dp_dx: -1000.0,
      n_hb: 0.65,
      tau_y: 2.5,
      slip_mm: 0.25,
    };
  }

  const m = state.bay03Mode;
  const host = document.getElementById("bayControls");
  const titles = {
    separation: "3A · Boundary-Layer Separation",
    couette: "3B · Couette–Poiseuille Backflow",
    twolayer: "3C · Two-Layer Interface (Ex. 8.2)",
    slip_hb: "3D · Navier Slip + Bingham Plug",
  };

  host.innerHTML = `
    <section class="panel-bay">
      <div class="bay-header">
        <span>${titles[m] || "Viscous & Separation Lab"}</span>
        <span class="tag-mono">Ch. 1 / 8 / 9</span>
      </div>
      <div class="mode-switch-row" style="grid-template-columns: repeat(2, 1fr);">
        <button class="mode-btn ${m === "separation" ? "active" : ""}" data-s3="separation">3A · BL Separation</button>
        <button class="mode-btn ${m === "couette" ? "active" : ""}" data-s3="couette">3B · Couette–Poiseuille</button>
        <button class="mode-btn ${m === "twolayer" ? "active" : ""}" data-s3="twolayer">3C · Two-Layer Ex 8.2</button>
        <button class="mode-btn ${m === "slip_hb" ? "active" : ""}" data-s3="slip_hb">3D · Slip + Yield Plug</button>
      </div>
      <div id="s3Sub"></div>
    </section>
  `;

  host.querySelectorAll("[data-s3]").forEach((btn) => {
    btn.onclick = () => {
      if (typeof openLab === "function") openLab("03", btn.dataset.s3);
      else {
        state.bay03Mode = btn.dataset.s3;
        renderStation03(ctx);
      }
    };
  });

  const sub = document.getElementById("s3Sub");
  const p = state.s3;

  const run = async () => {
    try {
      if (state.bay03Mode === "separation") {
        Object.assign(state.assumptions, {
          steady: true,
          incompressible: true,
          inviscid: false,
          irrotational: false,
          no_slip: true,
          newtonian: true,
          inertial_frame: true,
          irreversible_jump: false,
          adverse_pressure_gradient: p.use_falkner_skan ? p.beta_fs < 0 : p.lambda_pg < 0,
        });
        renderRockers();
        refreshAudit();

        if (p.use_falkner_skan) {
          const d = await apiPost("/api/falkner_skan", { beta: p.beta_fs }, "activeLab");
          document.getElementById("primaryTitle").textContent = "Falkner–Skan Boundary-Layer Velocity Field";
          document.getElementById("secondaryTitle").textContent = "Similarity Profile u(η)/U∞ & Curvature ∂²u/∂η²";
          setLegend("primaryLegend", [{ label: "Inflection η_PI", color: "amber", dashed: true }]);
          setLegend("secondaryLegend", [
            { label: "Profile u / U∞", color: "primary" },
            { label: "Curvature d²u/dη²", color: "coral", dashed: true },
          ]);
          setConceptBanner(
            "<strong>Falkner–Skan Wedge Boundary Layer:</strong> Negative Hartree β pushes the similarity profile toward an inflectional S-shape before wall shear f''(0) hits zero at β ≈ -0.1988.",
            "Adverse dp/dx > 0 forces positive wall curvature (∂²u/∂y²|w > 0), creating an interior inflection point!"
          );

          flowEngine.setScene({
            bounds: d.field_2d.bounds,
            aspectLock: false,
            xLabel: "Streamwise coordinate x / δ",
            yLabel: "Similarity height η",
            field: d.field_2d,
            hLines: d.inflection_eta !== null
              ? [{ y: d.inflection_eta, color: "amber", dashed: true, label: `Inflection η_PI = ${d.inflection_eta.toFixed(2)}` }]
              : [],
          });
          plotEngine.setPlot({
            probeAxis: "y",
            xLabel: "Dimensionless velocity u/U∞ & curvature",
            yLabel: "Similarity coordinate η",
            xShort: "val",
            yShort: "η",
            vMarkers: [{ x: 0.0, label: "u = 0", color: "#475569" }],
            hMarkers: d.inflection_eta !== null ? [{ y: d.inflection_eta, label: "Inflection PI", color: "amber" }] : [],
            series: [
              { name: "u / U∞", x: d.u_over_U, y: d.eta, color: "primary" },
              { name: "d²u/dη²", x: d.d2u_deta2, y: d.eta, color: "coral", dashed: true },
            ],
            defaultHud: `Cf·√Rex = ${d.cf_sqrt_rex.toFixed(4)} | Wall f''(0) = ${d.wall_shear_fpp0.toFixed(4)}`,
          });
          setDrawerMetrics([
            { k: "f''(0)", v: d.wall_shear_fpp0.toFixed(4), color: d.near_separation ? "var(--coral)" : "var(--accent)" },
            { k: "H = δ*/θ", v: d.shape_factor_H.toFixed(2) },
          ]);
          setDrawerCards([
            { k: "Hartree Parameter β", v: `${d.beta.toFixed(3)} (Separation limit βc ≈ -0.1988)`, tone: d.near_separation ? "coral" : "amber" },
            { k: "Wall Curvature (Eq. 9.42)", v: `d²u/dη²(0) = ${d.wall_curvature_d2u0.toFixed(3)} (>0 ⇒ adverse dp/dx > 0)`, tone: d.adverse_gradient ? "coral" : "" },
            { k: "Inflection Point (Fig. 9.6)", v: d.inflection_eta !== null ? `Located at η = ${d.inflection_eta.toFixed(2)}` : "None (Favorable or zero gradient)" },
          ]);
        } else {
          const d = await apiPost("/api/bl_separation", { lambda_pg: p.lambda_pg }, "activeLab");
          document.getElementById("primaryTitle").textContent = "Boundary-Layer Separation & Reverse-Flow Pocket";
          document.getElementById("secondaryTitle").textContent = "Pohlhausen u(y)/U∞ vs. Zero-Pressure-Gradient Flat Plate";
          setLegend("primaryLegend", [{ label: "Inflection PI", color: "amber", dashed: true }]);
          setLegend("secondaryLegend", [
            { label: "Profile u/U (Λ)", color: "primary" },
            { label: "Zero PG (Λ = 0)", color: "coral", dashed: true },
          ]);
          setConceptBanner(
            d.has_backflow
              ? "<strong>Flow Reversal Active (Λ < -12):</strong> Adverse dp/dx > 0 reverses near-wall fluid backward (u < 0), detaching the boundary layer."
              : "<strong>Adverse Pressure Inflection (Eq. 9.41–9.42):</strong> Positive wall curvature bends the velocity profile into an S-curve with an interior inflection height.",
            "Inviscid potential flow misses separation completely and predicts zero pressure drag (D'Alembert's Paradox)!"
          );

          flowEngine.setScene({
            bounds: d.field_2d.bounds,
            aspectLock: false,
            xLabel: "Boundary layer streamwise x / δ",
            yLabel: "Wall-normal y / δ",
            field: d.field_2d,
            hLines: d.inflection_eta !== null
              ? [{ y: d.inflection_eta, color: "amber", dashed: true, label: `Inflection y/δ = ${d.inflection_eta.toFixed(2)}` }]
              : [],
          });
          plotEngine.setPlot({
            probeAxis: "y",
            xLabel: "Dimensionless velocity u / U∞",
            yLabel: "Wall-normal height y / δ",
            xShort: "u/U",
            yShort: "y/δ",
            shadeDiff: true,
            vMarkers: [{ x: 0.0, label: "u = 0 (Backflow < 0)", color: "#475569" }],
            hMarkers: d.inflection_eta !== null ? [{ y: d.inflection_eta, label: "Inflection PI", color: "amber" }] : [],
            series: [
              { name: "u(Λ)", x: d.u, y: d.eta, color: "primary" },
              { name: "Flat Plate (Λ=0)", x: d.u_zero_pg, y: d.eta, color: "coral", dashed: true },
            ],
            defaultHud: `Wall shear slope = ${d.wall_shear_dimless.toFixed(3)} (τw=0 at Λ=-12) | Backflow: ${d.has_backflow ? "ACTIVE" : "NONE"}`,
          });
          setDrawerMetrics([
            { k: "τw Slope", v: d.wall_shear_dimless.toFixed(3), color: d.separated ? "var(--coral)" : "var(--accent)" },
            { k: "Cyl Cd_p Ideal vs Real", v: `${d.cylinder_cp.cd_pressure_ideal.toFixed(2)} vs ${d.cylinder_cp.cd_pressure_separated.toFixed(2)}` },
          ]);
          setDrawerCards([
            { k: "Separation Criterion (Eq. 9.41)", v: d.separated ? "Separated (∂u/∂y|w ≤ 0)" : "Attached (∂u/∂y|w > 0)", tone: d.separated ? "coral" : "accent" },
            { k: "Wall Curvature (Eq. 9.42)", v: `∂²u/∂y²|w = ${d.wall_curvature_dimless.toFixed(2)} (${d.lambda_pg < 0 ? "dp/dx > 0 ⇒ Inflection forced" : "Favorable dp/dx"})` },
            { k: "D'Alembert Drag Trap (Fig. 9.5)", v: `Potential Cd_p = 0 vs. Separated Wake Cd_p ≈ ${d.cylinder_cp.cd_pressure_separated.toFixed(2)} (θ_sep ≈ 81°)` },
          ]);
        }
      } else if (state.bay03Mode === "couette") {
        Object.assign(state.assumptions, {
          steady: true,
          incompressible: true,
          inviscid: false,
          irrotational: false,
          no_slip: true,
          newtonian: true,
          inertial_frame: true,
          irreversible_jump: false,
          adverse_pressure_gradient: p.P_cp < 0,
        });
        renderRockers();
        refreshAudit();

        const d = await apiPost("/api/couette_poiseuille", { P: p.P_cp }, "activeLab");
        document.getElementById("primaryTitle").textContent = "Generalized Couette–Poiseuille Channel Field";
        document.getElementById("secondaryTitle").textContent = "Velocity Profile u(y)/U vs. Pure Linear Couette (P = 0)";
        setLegend("primaryLegend", [{ label: "Moving Upper Plate (+U)", color: "primary" }]);
        setLegend("secondaryLegend", [
          { label: "Actual u / U", color: "primary" },
          { label: "Linear Couette (P = 0)", color: "coral", dashed: true },
        ]);
        setConceptBanner(
          "<strong>Couette–Poiseuille Competition (Ex. 8.4):</strong> Shear drag from the top moving plate (+U) fights an opposing pressure gradient (P < 0).",
          "At P = -1 wall shear τw,0 vanishes; reverse backflow grows until net discharge vanishes completely at P = -3!"
        );

        flowEngine.setScene({
          bounds: d.field_2d.bounds,
          aspectLock: false,
          xLabel: "Channel streamwise x / H",
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
            { name: "Pure Couette (P=0)", x: d.u_pure_couette.map((u) => u / d.U), y: d.y_over_H, color: "coral", dashed: true },
          ],
          defaultHud: `Regime: ${d.regime} | Q = ${d.q_per_width.toExponential(2)} m²/s`,
        });
        setDrawerMetrics([
          { k: "Regime", v: d.regime, color: p.P_cp < -1 ? "var(--coral)" : "var(--accent)" },
          { k: "Net Q", v: `${(d.q_per_width * 1e4).toFixed(3)} cm²/s` },
        ]);
        setDrawerCards([
          { k: "Flow Regime (Eq. 8.42)", v: d.regime, tone: p.P_cp < -1 ? "coral" : "accent" },
          { k: "Lower Wall Shear τw,0", v: `${d.tau_lower_wall.toFixed(4)} Pa (Zero exactly at P = -1)` },
          { k: "Recirculation Check (Ex. 8.4)", v: d.zero_net_flux ? "P = -3: Net Q = 0 Exact Cancellation" : `Net Q = 0 occurs at P = -3 (Current u_avg = ${d.u_avg.toFixed(3)} m/s)` },
        ]);
      } else if (state.bay03Mode === "twolayer") {
        Object.assign(state.assumptions, {
          steady: true,
          incompressible: true,
          inviscid: false,
          irrotational: false,
          no_slip: true,
          newtonian: true,
          inertial_frame: true,
          adverse_pressure_gradient: false,
          irreversible_jump: false,
        });
        renderRockers();
        refreshAudit();

        const d = await apiPost("/api/two_layer", { mu1: p.mu1, mu2: p.mu2, dp_dx: p.dp_dx }, "activeLab");
        document.getElementById("primaryTitle").textContent = "Two-Layer Immiscible Channel Flow Field (Ex. 8.2)";
        document.getElementById("secondaryTitle").textContent = "Velocity Profile u(y): Shear Continuity vs. Equal-Slope Trap";
        setLegend("primaryLegend", [{ label: "Interface y = 0", color: "amber", dashed: true }]);
        setLegend("secondaryLegend", [
          { label: "True u(y)", color: "primary" },
          { label: "Equal-Slope Trap", color: "coral", dashed: true },
        ]);
        setConceptBanner(
          "<strong>Immiscible Two-Layer Channel (Ex. 8.2):</strong> At the fluid interface y = 0, both velocity u and shear stress τ = μ(du/dy) must stay continuous.",
          "Common Trap: Equating du₁/dy = du₂/dy fails when μ₁ ≠ μ₂; peak velocity shifts off-center into the lower-viscosity layer!"
        );

        flowEngine.setScene({
          bounds: d.field_2d.bounds,
          aspectLock: false,
          xLabel: "Channel length x / H",
          yLabel: "Height y / H (-1 lower μ₁, +1 upper μ₂)",
          field: d.field_2d,
          hLines: [{ y: 0.0, color: "amber", dashed: true, label: `Interface τ₁ = τ₂ = ${d.interface_shear.toFixed(3)} Pa` }],
        });
        plotEngine.setPlot({
          probeAxis: "y",
          xLabel: "Axial velocity u (m/s)",
          yLabel: "Height y / H",
          xShort: "u",
          yShort: "y/H",
          shadeDiff: true,
          hMarkers: [{ y: 0.0, label: "Interface y = 0", color: "amber" }],
          vMarkers: [{ x: 0.0, label: "u = 0", color: "#475569" }],
          series: [
            { name: "True u", x: d.u_true, y: d.y_over_H, color: "primary" },
            { name: "Slope Trap", x: d.u_naive_slope_trap, y: d.y_over_H, color: "coral", dashed: true },
          ],
          defaultHud: `Peak speed sits at y_max/H = ${(d.y_peak / d.H).toFixed(2)} (inside less viscous layer!)`,
        });
        setDrawerMetrics([
          { k: "μ₁/μ₂", v: (d.mu1 / d.mu2).toFixed(2), color: "var(--accent)" },
          { k: "y_peak/H", v: (d.y_peak / d.H).toFixed(2) },
        ]);
        setDrawerCards([
          { k: "True Interface Condition", v: `μ₁(du₁/dy) = μ₂(du₂/dy) = ${d.interface_shear.toFixed(4)} Pa`, tone: "accent" },
          { k: "Slope Kink at y = 0", v: `du₁/dy = ${d.interface_slope_1.toFixed(1)} ≠ du₂/dy = ${d.interface_slope_2.toFixed(1)} s⁻¹`, tone: "coral" },
          { k: "Peak Offset Check", v: `u_max = ${d.u_peak.toFixed(3)} m/s sits at y/H = ${(d.y_peak / d.H).toFixed(2)}, NOT y = 0` },
        ]);
      } else {
        Object.assign(state.assumptions, {
          steady: true,
          incompressible: true,
          inviscid: false,
          irrotational: false,
          no_slip: p.slip_mm === 0,
          newtonian: Math.abs(p.n_hb - 1) < 0.01 && p.tau_y === 0,
          inertial_frame: true,
          adverse_pressure_gradient: false,
          irreversible_jump: false,
        });
        renderRockers();
        refreshAudit();

        const d = await apiPost("/api/slip_hb", { n: p.n_hb, tau_y: p.tau_y, slip_length: p.slip_mm * 1e-3 }, "activeLab");
        document.getElementById("primaryTitle").textContent = "Navier Wall-Slip + Herschel–Bulkley Plug Channel";
        document.getElementById("secondaryTitle").textContent = "Velocity Profile u(y): Yield Plug + Slip vs. No-Slip Poiseuille";
        setLegend("primaryLegend", [{ label: "Unyielded Plug |y|≤yp", color: "amber", dashed: true }]);
        setLegend("secondaryLegend", [
          { label: "True u(y)", color: "primary" },
          { label: "No-Slip Newtonian", color: "coral", dashed: true },
        ]);
        setConceptBanner(
          "<strong>Non-Newtonian Yield Core & Navier Slip (Ch. 1.6):</strong> Wherever |τ| ≤ τ_y near center, fluid travels as a rigid flat plug while hydrophobic Navier slip adds nonzero wall speed uw.",
          "Standard No-Slip Poiseuille underpredicts slip enhancement OR misses complete yield-stress flow locking!"
        );

        const pf = d.plug_fraction;
        const hBands = pf > 0.02 && pf < 0.99 ? [{ yMin: -pf, yMax: pf, fill: "rgba(217, 119, 6, 0.14)" }] : [];
        const hLines = pf > 0.02 && pf < 0.99
          ? [
              { y: pf, color: "amber", dashed: true, label: `+Plug y/H = ${pf.toFixed(2)}` },
              { y: -pf, color: "amber", dashed: true, label: "-Plug" },
            ]
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
          defaultHud: d.flow_locked
            ? "Flow locked: |τ_wall| ≤ τ_y!"
            : `Wall slip uw = ${d.u_slip_wall.toFixed(3)} m/s | Flux ratio = ${d.flux_ratio.toFixed(2)}x`,
        });
        setDrawerMetrics([
          { k: "Plug %", v: `${(pf * 100).toFixed(0)}%`, color: "var(--amber)" },
          { k: "Flux Ratio", v: `${d.flux_ratio.toFixed(2)}x`, color: "var(--coral)" },
        ]);
        setDrawerCards([
          { k: "Wall Slip Speed uw", v: `${d.u_slip_wall.toFixed(3)} m/s (l_s = ${p.slip_mm.toFixed(2)} mm)`, tone: "accent" },
          { k: "Unyielded Plug Core", v: `|τ| ≤ ${p.tau_y.toFixed(1)} Pa ⇒ Rigid core |y|/H ≤ ${pf.toFixed(2)}` },
          { k: "No-Slip Newtonian Trap", v: d.flow_locked ? "Flow Locked (Zero flux vs. parabolic prediction!)" : `True flux is ${d.flux_ratio.toFixed(2)}× textbook No-Slip`, tone: "coral" },
        ]);
      }
    } catch (err) {
      if (err.name === "AbortError") return;
      document.getElementById("flowProbeHud").textContent = `Solver error: ${err.message}`;
    }
  };

  if (m === "separation") {
    sub.innerHTML = `
      <div class="preset-row" style="margin-bottom:10px;">
        <button class="btn-machined ${!p.use_falkner_skan ? "btn-primary" : ""}" id="btnPohl">Pohlhausen Λ (Post-Sep)</button>
        <button class="btn-machined ${p.use_falkner_skan ? "btn-primary" : ""}" id="btnFS">Exact Falkner–Skan β</button>
      </div>
      ${
        !p.use_falkner_skan
          ? `<div class="field-group">
               <div class="field-label-row"><span>Pressure Gradient Λ</span><span class="val-readout" id="lblS3">${p.lambda_pg.toFixed(1)}</span></div>
               <input type="range" id="rngS3" min="-17.5" max="10.0" step="0.5" value="${p.lambda_pg}" />
             </div>
             <div class="preset-row" style="margin-top:8px;">
               <button class="btn-machined" id="preSepPt">At Sep (Λ = -12)</button>
               <button class="btn-machined" id="preBackflow">Backflow (Λ = -16)</button>
             </div>`
          : `<div class="field-group">
               <div class="field-label-row"><span>Hartree β (&ge; -0.1988)</span><span class="val-readout" id="lblS3">${p.beta_fs.toFixed(3)}</span></div>
               <input type="range" id="rngS3" min="-0.198" max="1.0" step="0.01" value="${p.beta_fs}" />
             </div>`
      }
    `;
    document.getElementById("btnPohl").onclick = () => { p.use_falkner_skan = false; renderStation03(ctx); };
    document.getElementById("btnFS").onclick = () => { p.use_falkner_skan = true; renderStation03(ctx); };
    document.getElementById("rngS3").oninput = (e) => {
      const v = parseFloat(e.target.value);
      if (p.use_falkner_skan) p.beta_fs = v;
      else p.lambda_pg = v;
      document.getElementById("lblS3").textContent = p.use_falkner_skan ? v.toFixed(3) : v.toFixed(1);
      debouncedRun("bay03", run, 55);
    };
    if (!p.use_falkner_skan) {
      document.getElementById("preSepPt").onclick = () => { p.lambda_pg = -12.0; renderStation03(ctx); };
      document.getElementById("preBackflow").onclick = () => { p.lambda_pg = -16.0; renderStation03(ctx); };
    }
  } else if (m === "couette") {
    sub.innerHTML = `
      <div class="field-group">
        <div class="field-label-row"><span>Dimensionless P = (-dp/dx)H&sup2; / 2&mu;U</span><span class="val-readout" id="lblPcp">${p.P_cp.toFixed(2)}</span></div>
        <input type="range" id="rngPcp" min="-4.5" max="2.5" step="0.1" value="${p.P_cp}" />
      </div>
      <div class="preset-row" style="margin-top:8px;">
        <button class="btn-machined" id="preP1">P = -1 (Zero Shear)</button>
        <button class="btn-machined" id="preP3">P = -3 (Ex. 8.4 Q=0)</button>
      </div>
    `;
    document.getElementById("rngPcp").oninput = (e) => {
      p.P_cp = parseFloat(e.target.value);
      document.getElementById("lblPcp").textContent = p.P_cp.toFixed(2);
      debouncedRun("bay03", run, 55);
    };
    document.getElementById("preP1").onclick = () => { p.P_cp = -1.0; renderStation03(ctx); };
    document.getElementById("preP3").onclick = () => { p.P_cp = -3.0; renderStation03(ctx); };
  } else if (m === "twolayer") {
    sub.innerHTML = `
      <div class="grid-2">
        <div class="field-group">
          <div class="field-label-row"><span>Lower &mu;&#8321; (mPa&middot;s)</span><span class="val-readout" id="lblM1">${(p.mu1 * 1000).toFixed(1)}</span></div>
          <input type="range" id="rngM1" min="0.5" max="12.0" step="0.5" value="${p.mu1 * 1000}" />
        </div>
        <div class="field-group">
          <div class="field-label-row"><span>Upper &mu;&#8322; (mPa&middot;s)</span><span class="val-readout" id="lblM2">${(p.mu2 * 1000).toFixed(1)}</span></div>
          <input type="range" id="rngM2" min="0.5" max="12.0" step="0.5" value="${p.mu2 * 1000}" />
        </div>
      </div>
    `;
    document.getElementById("rngM1").oninput = (e) => {
      p.mu1 = parseFloat(e.target.value) * 1e-3;
      document.getElementById("lblM1").textContent = parseFloat(e.target.value).toFixed(1);
      debouncedRun("bay03", run, 55);
    };
    document.getElementById("rngM2").oninput = (e) => {
      p.mu2 = parseFloat(e.target.value) * 1e-3;
      document.getElementById("lblM2").textContent = parseFloat(e.target.value).toFixed(1);
      debouncedRun("bay03", run, 55);
    };
  } else {
    sub.innerHTML = `
      <div class="grid-2">
        <div class="field-group">
          <div class="field-label-row"><span>Power Index n</span><span class="val-readout" id="lblNhb">${p.n_hb.toFixed(2)}</span></div>
          <input type="range" id="rngNhb" min="0.35" max="1.6" step="0.05" value="${p.n_hb}" />
        </div>
        <div class="field-group">
          <div class="field-label-row"><span>Yield &tau;_y (Pa)</span><span class="val-readout" id="lblTy">${p.tau_y.toFixed(1)}</span></div>
          <input type="range" id="rngTy" min="0.0" max="13.5" step="0.5" value="${p.tau_y}" />
        </div>
        <div class="field-group" style="grid-column: 1 / -1;">
          <div class="field-label-row"><span>Navier Slip Length l_s (mm)</span><span class="val-readout" id="lblLs">${p.slip_mm.toFixed(2)}</span></div>
          <input type="range" id="rngLs" min="0.0" max="0.8" step="0.05" value="${p.slip_mm}" />
        </div>
      </div>
    `;
    document.getElementById("rngNhb").oninput = (e) => {
      p.n_hb = parseFloat(e.target.value);
      document.getElementById("lblNhb").textContent = p.n_hb.toFixed(2);
      debouncedRun("bay03", run, 55);
    };
    document.getElementById("rngTy").oninput = (e) => {
      p.tau_y = parseFloat(e.target.value);
      document.getElementById("lblTy").textContent = p.tau_y.toFixed(1);
      debouncedRun("bay03", run, 55);
    };
    document.getElementById("rngLs").oninput = (e) => {
      p.slip_mm = parseFloat(e.target.value);
      document.getElementById("lblLs").textContent = p.slip_mm.toFixed(2);
      debouncedRun("bay03", run, 55);
    };
  }

  run();
}
