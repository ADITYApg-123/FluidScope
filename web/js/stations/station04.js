/**
 * Station 04: Conservation Traps (Ch. 2.9, 11.5, 12.4) & Live Numba 2D D2Q9 LBM Tunnel.
 */
import {
  buildHydraulicJumpScene,
  buildSuddenExpansionScene,
  buildAccelTankScene,
} from "./scene_mapper.js";

export function renderStation04(ctx) {
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

  if (!state.bay04Mode) state.bay04Mode = "lbm"; // lbm | jump | expansion | tank
  if (!state.s4) {
    state.s4 = {
      lbmPreset: "cylinder",
      reynolds: 105.0,
      customObstacles: null,
      lbmPlotView: "wake", // wake | profile
      lastLbmData: null,
      jumpV1: 6.1,
      jumpH1: 0.305,
      jumpWidth: 6.1,
      expD1: 0.10,
      expD2: 0.20,
      expV1: 4.0,
      tankAx: 3.0,
      tankAz: 0.0,
    };
  }

  const m = state.bay04Mode;
  const p = state.s4;
  const host = document.getElementById("bayControls");
  const titles = {
    lbm: "4A · Live 2D LBM Wind Tunnel",
    jump: "4B · Hydraulic Jump Dissipation",
    expansion: "4C · Borda–Carnot Pipe Expansion",
    tank: "4D · Accelerating Tank & Free Fall",
  };

  host.innerHTML = `
    <section class="panel-bay">
      <div class="bay-header">
        <span>${titles[m] || "Conservation Traps & LBM"}</span>
        <span class="tag-mono">Ch. 2 / 10 / 11 / 12</span>
      </div>
      <div class="mode-switch-row" style="grid-template-columns: repeat(2, 1fr);">
        <button class="mode-btn ${m === "lbm" ? "active" : ""}" data-s4="lbm">4A · 2D LBM Tunnel</button>
        <button class="mode-btn ${m === "jump" ? "active" : ""}" data-s4="jump">4B · Hydraulic Jump</button>
        <button class="mode-btn ${m === "expansion" ? "active" : ""}" data-s4="expansion">4C · Pipe Expansion</button>
        <button class="mode-btn ${m === "tank" ? "active" : ""}" data-s4="tank">4D · Accel / Free Fall</button>
      </div>
      <div id="s4Sub"></div>
    </section>
  `;

  host.querySelectorAll("[data-s4]").forEach((btn) => {
    btn.onclick = () => {
      if (typeof openLab === "function") openLab("04", btn.dataset.s4);
      else {
        state.bay04Mode = btn.dataset.s4;
        renderStation04(ctx);
      }
    };
  });

  const renderLbmSecondaryPlot = (d) => {
    if (!d) return;
    const slot = document.getElementById("secondaryPlotControls");
    if (slot) {
      slot.innerHTML = `
        <div class="seg-toggle" role="tablist" aria-label="LBM Plot View">
          <button class="seg-btn ${p.lbmPlotView === "wake" ? "active" : ""}" id="btnLbmWake">Wake uy(t)</button>
          <button class="seg-btn ${p.lbmPlotView === "profile" ? "active" : ""}" id="btnLbmProf">Profile u(y) @ 0.75L</button>
        </div>
      `;
      document.getElementById("btnLbmWake").onclick = () => {
        p.lbmPlotView = "wake";
        renderLbmSecondaryPlot(p.lastLbmData);
      };
      document.getElementById("btnLbmProf").onclick = () => {
        p.lbmPlotView = "profile";
        renderLbmSecondaryPlot(p.lastLbmData);
      };
    }

    if (p.lbmPlotView === "profile" && d.downstream_profile?.y?.length) {
      document.getElementById("secondaryTitle").textContent = "Downstream Velocity Profile u(y)/Uin at x = 0.75L";
      setLegend("secondaryLegend", [{ label: "u(y)/Uin @ 0.75L", color: "primary" }]);
      plotEngine.setPlot({
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
        defaultHud: `Downstream wake velocity defect at 0.75L | Wake RMS = ${d.wake_oscillation_rms.toFixed(4)}`,
      });
    } else {
      document.getElementById("secondaryTitle").textContent = "Downstream Wake Cross-Velocity uy(t)/Uin";
      setLegend("secondaryLegend", [{ label: "Wake uy(t)/Uin", color: "primary" }]);
      const ts = d.wake_uy_history.map((_, idx) => idx * 10);
      plotEngine.setPlot({
        xLabel: "Lattice iteration step (Re ≤ 160 BGK)",
        yLabel: "Normalized transverse velocity uy / Uin",
        xShort: "step",
        series: [{ name: "Wake uy/Uin", x: ts, y: d.wake_uy_history, color: "primary" }],
        defaultHud: `BGK τ = ${d.tau_bgk.toFixed(3)} | Ma = ${d.mach_inlet.toFixed(3)} | Wake RMS = ${d.wake_oscillation_rms.toFixed(4)}`,
      });
    }
  };

  const run = async () => {
    try {
      if (state.bay04Mode === "lbm") {
        document.getElementById("flowProbeHud").textContent = "Numba D2Q9 LBM kernel simulating...";
        Object.assign(state.assumptions, {
          steady: false,
          incompressible: true,
          inviscid: false,
          irrotational: false,
          no_slip: true,
          newtonian: true,
          inertial_frame: true,
          adverse_pressure_gradient: true,
          irreversible_jump: false,
        });
        renderRockers();
        refreshAudit();

        const d = await apiPost(
          "/api/lbm_tunnel",
          {
            preset: p.lbmPreset,
            reynolds: p.reynolds,
            n_steps: 450,
            obstacles: p.customObstacles,
          },
          "activeLab"
        );
        p.lastLbmData = d;

        document.getElementById("primaryTitle").textContent = `2D D2Q9 LBM Vorticity & Wake (${p.lbmPreset.replaceAll("_", " ")})`;
        setLegend("primaryLegend", [
          { label: "+Ωz Vortex", color: "amber" },
          { label: "-Ωz Vortex", color: "primary" },
        ]);
        setConceptBanner(
          "<strong>Live 2D D2Q9 Lattice–Boltzmann Wind Tunnel:</strong> Solves real viscous Navier–Stokes vortex shedding behind true 1:1 scaled obstacles.",
          "Switch geometry to 'Cylinder + Splitter Plate' to watch the rigid splitter plate suppress oscillating Kármán vortices!"
        );

        flowEngine.setScene({
          bounds: d.field_2d.bounds,
          aspectLock: true,
          xLabel: "Tunnel length x / H",
          yLabel: "Channel height y / H",
          field: d.field_2d,
          solidRects: d.solid_rects,
        });
        renderLbmSecondaryPlot(d);

        setDrawerMetrics([
          { k: "Re", v: d.reynolds.toFixed(0), color: "var(--accent)" },
          { k: "Ma_in", v: d.mach_inlet.toFixed(3) },
          { k: "Wake RMS", v: d.wake_oscillation_rms.toFixed(4), color: d.wake_oscillation_rms > 0.02 ? "var(--coral)" : "var(--ok-green)" },
        ]);
        setDrawerCards([
          { k: "Operating Regime", v: `2D Incompressible BGK LBM · Re = ${d.reynolds.toFixed(0)}, τ = ${d.tau_bgk.toFixed(3)}`, tone: "accent" },
          { k: "Vortex Shedding Metric", v: `RMS(uy_wake) = ${d.wake_oscillation_rms.toFixed(4)} (${d.wake_oscillation_rms > 0.02 ? "Active Kármán street" : "Damped wake"})`, tone: d.wake_oscillation_rms > 0.02 ? "coral" : "ok" },
          { k: "Lattice Stability", v: d.stable ? `Stable (${d.grid_shape[1]}×${d.grid_shape[0]} grid)` : "Unstable" },
        ]);
      } else if (state.bay04Mode === "jump") {
        clearSecondaryControls();
        Object.assign(state.assumptions, {
          steady: true,
          incompressible: true,
          inviscid: false,
          irrotational: false,
          no_slip: true,
          newtonian: true,
          inertial_frame: true,
          adverse_pressure_gradient: true,
          irreversible_jump: true,
        });
        renderRockers();
        refreshAudit();

        const d = await apiPost("/api/hydraulic_jump", { width: p.jumpWidth, v1: p.jumpV1, h1: p.jumpH1 }, "activeLab");
        document.getElementById("primaryTitle").textContent = "Hydraulic Jump Profile, Sluice Gate & Roller Eddy";
        document.getElementById("secondaryTitle").textContent = "Specific Energy Es(h): Momentum Conjugate vs. No-Loss Trap";
        setLegend("primaryLegend", [
          { label: "True Depth h(x)", color: "primary" },
          { label: "Naive No-Loss h₂", color: "coral", dashed: true },
        ]);
        setLegend("secondaryLegend", [{ label: "Specific Energy Es(h)", color: "primary" }]);
        setConceptBanner(
          "<strong>Hydraulic Jump Momentum Balance (Ch. 12.4):</strong> Supercritical flow h₁ decelerates through an irreversible turbulent surface roller to conjugate depth h₂.",
          "Energy Conservation Trap: Setting Es₁ = Es₂ ignores eddy dissipation hj and drastically overpredicts h₂!"
        );

        flowEngine.setScene(buildHydraulicJumpScene(d));
        plotEngine.setPlot({
          xLabel: "Flow depth h (m)",
          yLabel: "Specific energy Es = h + V²/2g (m)",
          xShort: "h",
          series: [{ name: "Specific Energy Es", x: d.es_diagram.h, y: d.es_diagram.Es, color: "primary" }],
          vMarkers: [
            { x: d.h1, label: "h₁", color: "#475569" },
            { x: d.h2_true, label: "h₂ True", color: "primary" },
            { x: d.h2_naive_bernoulli, label: "h₂ Naive", color: "coral" },
          ],
          defaultHud: `Fr₁ = ${d.Fr1.toFixed(2)} | Loss hj = ${d.head_loss_hj.toFixed(3)} m | P_loss = ${(d.power_loss_W / 1000).toFixed(2)} kW`,
        });
        setDrawerMetrics([
          { k: "Fr₁", v: d.Fr1.toFixed(2), color: d.can_jump ? "var(--accent)" : "var(--coral)" },
          { k: "h₂ True", v: `${d.h2_true.toFixed(3)} m`, color: "var(--accent)" },
          { k: "h₂ Naive", v: `${d.h2_naive_bernoulli.toFixed(3)} m`, color: "var(--coral)" },
        ]);
        setDrawerCards([
          { k: "Momentum Conjugate Depth h₂", v: `${d.h2_true.toFixed(3)} m (Jump Δh = ${d.jump_height.toFixed(3)} m)`, tone: "accent" },
          { k: "Naive No-Loss Depth", v: `${d.h2_naive_bernoulli.toFixed(3)} m (Overpredicts by +${d.depth_overprediction.toFixed(3)} m!)`, tone: "coral" },
          { k: "Eddy Dissipation (Eq. 12.48)", v: `hj = ${d.head_loss_hj.toFixed(3)} m | Power dissipated = ${(d.power_loss_W / 1000).toFixed(2)} kW`, tone: "amber" },
        ]);
      } else if (state.bay04Mode === "expansion") {
        clearSecondaryControls();
        Object.assign(state.assumptions, {
          steady: true,
          incompressible: true,
          inviscid: false,
          irrotational: false,
          no_slip: true,
          newtonian: true,
          inertial_frame: true,
          adverse_pressure_gradient: true,
          irreversible_jump: true,
        });
        renderRockers();
        refreshAudit();

        const d = await apiPost("/api/sudden_expansion", { D1: p.expD1, D2: p.expD2, V1: p.expV1 }, "activeLab");
        document.getElementById("primaryTitle").textContent = "Borda–Carnot Sudden Pipe Expansion & Annular Eddies";
        document.getElementById("secondaryTitle").textContent = "Pressure Recovery: Momentum Balance vs. Naive Bernoulli";
        setLegend("primaryLegend", [
          { label: "Expanding Pipe Jet", color: "primary" },
          { label: "Dead-Zone Eddies", color: "coral" },
        ]);
        setLegend("secondaryLegend", [
          { label: "True Δp(x)", color: "primary" },
          { label: "Naive Bernoulli Δp(x)", color: "coral", dashed: true },
        ]);
        setConceptBanner(
          "<strong>Borda–Carnot Expansion (Eq. 11.18):</strong> Annular corner eddies trap uniform shoulder pressure p' ≈ p₁ across the step face, conserving momentum rather than head.",
          "Ideal Bernoulli predicts ½ρ(V₁² - V₂²), ignoring Borda head loss hL = (V₁ - V₂)²/2g!"
        );

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
          defaultHud: `True Δp = ${(d.dp_true / 1000).toFixed(2)} kPa | Naive = ${(d.dp_naive / 1000).toFixed(2)} kPa | hL = ${d.head_loss_hL.toFixed(3)} m`,
        });
        setDrawerMetrics([
          { k: "Δp True", v: `${(d.dp_true / 1000).toFixed(2)} kPa`, color: "var(--accent)" },
          { k: "Δp Naive", v: `${(d.dp_naive / 1000).toFixed(2)} kPa`, color: "var(--coral)" },
        ]);
        setDrawerCards([
          { k: "Momentum Recovery (Eq. 11.21)", v: `ρV₂(V₁ - V₂) = ${(d.dp_true / 1000).toFixed(2)} kPa`, tone: "accent" },
          { k: "Naive Bernoulli Trap", v: `½ρ(V₁² - V₂²) = ${(d.dp_naive / 1000).toFixed(2)} kPa (Overestimates by ${(d.dp_overestimation / 1000).toFixed(2)} kPa!)`, tone: "coral" },
          { k: "Borda–Carnot Loss (Eq. 11.23)", v: `hL = (V₁ - V₂)²/2g = ${d.head_loss_hL.toFixed(3)} m` },
        ]);
      } else {
        clearSecondaryControls();
        const isInertial = Math.abs(p.tankAx) < 0.05 && Math.abs(p.tankAz) < 0.05;
        Object.assign(state.assumptions, {
          steady: true,
          incompressible: true,
          inviscid: true,
          irrotational: true,
          no_slip: true,
          newtonian: true,
          inertial_frame: isInertial,
          adverse_pressure_gradient: false,
          irreversible_jump: false,
        });
        renderRockers();
        refreshAudit();

        const d = await apiPost("/api/accel_tank", { ax: p.tankAx, az: p.tankAz }, "activeLab");
        document.getElementById("primaryTitle").textContent = `Non-Inertial Tank & Bottom Orifice (${d.regime.replaceAll("_", " ")})`;
        document.getElementById("secondaryTitle").textContent = "Base Hydrostatic Pressure: Effective Frame vs. Static Naive";
        setLegend("primaryLegend", [
          { label: "Actual Surface & Jet", color: "primary" },
          { label: "Static Flat Level", color: "coral", dashed: true },
        ]);
        setLegend("secondaryLegend", [
          { label: "Actual p_bot (kPa)", color: "primary" },
          { label: "Naive Static (kPa)", color: "coral", dashed: true },
        ]);
        setConceptBanner(
          d.g_effective < 0.05
            ? "<strong>Free-Fall Hydrostatic Collapse (p. 99):</strong> When tank acceleration matches az = -g, effective body force g_eff = 0 ⇒ gauge pressure vanishes everywhere and bottom orifice DOES NOT LEAK!"
            : "<strong>Accelerating Tank Hydrostatics (Eq. 2.86):</strong> Constant-pressure isobars tilt perpendicular to g_eff with angle tan θ = -ax / (g + az).",
          "Inertial Trap: Computing bottom efflux from √(2gh₀) fails under vertical acceleration az or horizontal tilt!"
        );

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
          defaultHud: `Tilt = ${d.tilt_deg.toFixed(1)}° | Orifice exit V_true = ${d.orifice_v_true.toFixed(2)} m/s vs Naive = ${d.orifice_v_naive_static.toFixed(2)} m/s`,
        });
        setDrawerMetrics([
          { k: "Tilt", v: `${d.tilt_deg.toFixed(1)}°`, color: "var(--accent)" },
          { k: "Orifice V", v: `${d.orifice_v_true.toFixed(2)} m/s`, color: d.orifice_v_true < 0.01 ? "var(--coral)" : "var(--accent)" },
        ]);
        setDrawerCards([
          { k: "Free-Surface Slope (Eq. 2.87)", v: `tan θ = -ax / (g + az) ⇒ θ = ${d.tilt_deg.toFixed(2)}°`, tone: "amber" },
          { k: "Bottom Hole Trap (p. 99)", v: d.g_effective < 0.01 ? "Free Fall: p = patm everywhere ⇒ No leak (V_exit = 0)!" : `Orifice speed = ${d.orifice_v_true.toFixed(2)} m/s (Static: ${d.orifice_v_naive_static.toFixed(2)} m/s)`, tone: d.g_effective < 0.01 ? "coral" : "accent" },
        ]);
      }
    } catch (err) {
      if (err.name === "AbortError") return;
      document.getElementById("flowProbeHud").textContent = `Solver error: ${err.message}`;
    }
  };

  const sub = document.getElementById("s4Sub");
  if (m === "lbm") {
    sub.innerHTML = `
      <div class="field-group">
        <div class="field-label-row"><span>Wind-Tunnel Geometry</span></div>
        <select class="select-input" id="selLbm">
          <option value="cylinder" ${p.lbmPreset === "cylinder" ? "selected" : ""}>Circular Cylinder (K&aacute;rm&aacute;n Wake)</option>
          <option value="cylinder_splitter" ${p.lbmPreset === "cylinder_splitter" ? "selected" : ""}>Cylinder + Wake Splitter Plate</option>
          <option value="backward_step" ${p.lbmPreset === "backward_step" ? "selected" : ""}>Backward-Facing Step Recirculation</option>
          <option value="tandem_cylinders" ${p.lbmPreset === "tandem_cylinders" ? "selected" : ""}>Tandem Dual Cylinders</option>
        </select>
      </div>
      <div class="field-group" style="margin-top:8px;">
        <div class="field-label-row"><span>Reynolds Number Re (25..160)</span><span class="val-readout" id="lblRe">${p.reynolds.toFixed(0)}</span></div>
        <input type="range" id="rngRe" min="25" max="160" step="5" value="${p.reynolds}" />
      </div>
      <button class="btn-machined btn-primary" id="btnRunLbm" style="width:100%;margin-top:10px;">Run 450 LBM Steps</button>
    `;
    document.getElementById("selLbm").onchange = (e) => {
      p.lbmPreset = e.target.value;
      p.customObstacles = null;
      run();
    };
    const rngRe = document.getElementById("rngRe");
    rngRe.oninput = (e) => {
      p.reynolds = parseFloat(e.target.value);
      document.getElementById("lblRe").textContent = p.reynolds.toFixed(0);
      debouncedRun("bay04_lbm", run, 220);
    };
    rngRe.onchange = run;
    document.getElementById("btnRunLbm").onclick = run;
  } else if (m === "jump") {
    sub.innerHTML = `
      <div class="preset-row" style="margin-bottom:8px;">
        <button class="btn-machined" id="preEx1211">Ex 12.11 (Fr&#8321;=3.53)</button>
        <button class="btn-machined" id="preEx1212">Ex 12.12 (Fr&#8321;=2.15)</button>
      </div>
      <div class="grid-2">
        <div class="field-group">
          <div class="field-label-row"><span>Inlet V&#8321; (m/s)</span><span class="val-readout" id="lblJ1">${p.jumpV1.toFixed(2)}</span></div>
          <input type="range" id="rngJ1" min="2.0" max="10.0" step="0.1" value="${p.jumpV1}" />
        </div>
        <div class="field-group">
          <div class="field-label-row"><span>Depth h&#8321; (m)</span><span class="val-readout" id="lblH1">${p.jumpH1.toFixed(3)}</span></div>
          <input type="range" id="rngH1" min="0.15" max="0.80" step="0.01" value="${p.jumpH1}" />
        </div>
      </div>
    `;
    document.getElementById("preEx1211").onclick = () => {
      p.jumpV1 = 6.1;
      p.jumpH1 = 0.3042;
      p.jumpWidth = 6.1;
      renderStation04(ctx);
    };
    document.getElementById("preEx1212").onclick = () => {
      p.jumpV1 = 4.14;
      p.jumpH1 = 0.379;
      p.jumpWidth = 3.5;
      renderStation04(ctx);
    };
    document.getElementById("rngJ1").oninput = (e) => {
      p.jumpV1 = parseFloat(e.target.value);
      document.getElementById("lblJ1").textContent = p.jumpV1.toFixed(2);
      debouncedRun("bay04", run, 55);
    };
    document.getElementById("rngH1").oninput = (e) => {
      p.jumpH1 = parseFloat(e.target.value);
      document.getElementById("lblH1").textContent = p.jumpH1.toFixed(3);
      debouncedRun("bay04", run, 55);
    };
  } else if (m === "expansion") {
    sub.innerHTML = `
      <div class="grid-2">
        <div class="field-group">
          <div class="field-label-row"><span>D&#8322; / D&#8321; Ratio</span><span class="val-readout" id="lblExpR">${(p.expD2 / p.expD1).toFixed(2)}</span></div>
          <input type="range" id="rngExpR" min="1.2" max="4.0" step="0.1" value="${p.expD2 / p.expD1}" />
        </div>
        <div class="field-group">
          <div class="field-label-row"><span>Inlet V&#8321; (m/s)</span><span class="val-readout" id="lblExpV">${p.expV1.toFixed(1)}</span></div>
          <input type="range" id="rngExpV" min="1.0" max="8.0" step="0.2" value="${p.expV1}" />
        </div>
      </div>
    `;
    document.getElementById("rngExpR").oninput = (e) => {
      const r = parseFloat(e.target.value);
      p.expD2 = p.expD1 * r;
      document.getElementById("lblExpR").textContent = r.toFixed(2);
      debouncedRun("bay04", run, 55);
    };
    document.getElementById("rngExpV").oninput = (e) => {
      p.expV1 = parseFloat(e.target.value);
      document.getElementById("lblExpV").textContent = p.expV1.toFixed(1);
      debouncedRun("bay04", run, 55);
    };
  } else {
    sub.innerHTML = `
      <div class="preset-row" style="margin-bottom:8px;">
        <button class="btn-machined" id="preTilt">Horiz Accel (3 m/s&sup2;)</button>
        <button class="btn-machined" id="preFreeFall">Free Fall (az = -g)</button>
      </div>
      <div class="grid-2">
        <div class="field-group">
          <div class="field-label-row"><span>Horizontal ax (m/s&sup2;)</span><span class="val-readout" id="lblAx">${p.tankAx.toFixed(2)}</span></div>
          <input type="range" id="rngAx" min="-6.0" max="6.0" step="0.25" value="${p.tankAx}" />
        </div>
        <div class="field-group">
          <div class="field-label-row"><span>Vertical az (m/s&sup2;)</span><span class="val-readout" id="lblAz">${p.tankAz.toFixed(2)}</span></div>
          <input type="range" id="rngAz" min="-9.81" max="5.0" step="0.25" value="${p.tankAz}" />
        </div>
      </div>
    `;
    document.getElementById("preTilt").onclick = () => {
      p.tankAx = 3.0;
      p.tankAz = 0.0;
      renderStation04(ctx);
    };
    document.getElementById("preFreeFall").onclick = () => {
      p.tankAx = 0.0;
      p.tankAz = -9.81;
      renderStation04(ctx);
    };
    document.getElementById("rngAx").oninput = (e) => {
      p.tankAx = parseFloat(e.target.value);
      document.getElementById("lblAx").textContent = p.tankAx.toFixed(2);
      debouncedRun("bay04", run, 55);
    };
    document.getElementById("rngAz").oninput = (e) => {
      p.tankAz = parseFloat(e.target.value);
      document.getElementById("lblAz").textContent = p.tankAz.toFixed(2);
      debouncedRun("bay04", run, 55);
    };
  }

  run();
}
