/**
 * Station 02: Kinematics & Potential/Vortex Labs (2A Equation Flow, 2B Vortex Trap, 2C Rotating Vessel, 2D Magnus Cylinder).
 * Extracted from app.js in Wave 0 (owned by Agent C in Wave 1).
 */
import { computeKinematicsFraming, buildRotatingVesselScene } from "./scene_mapper.js";

function computeKinRequestBounds(kp) {
  const xs = [kp.x0, kp.x0 + 2.2, kp.loop_cx - kp.loop_r - 0.5, kp.loop_cx + kp.loop_r + 0.5];
  const ys = [
    kp.y0,
    kp.y0 + kp.v0 * Math.max(0.5, kp.t_eval - kp.t0) + 0.6,
    kp.loop_cy - kp.loop_r - 0.5,
    kp.loop_cy + kp.loop_r + 0.5,
  ];
  if (kp.u_str.includes("y") && kp.u_str.includes("x")) {
    return [-2.6, 2.6, -2.6, 2.6];
  }
  return [
    Math.min(...xs) - 0.8,
    Math.max(...xs) + 1.2,
    Math.min(...ys) - 0.6,
    Math.max(...ys) + 1.0,
  ];
}

function renderBay02Controls(ctx) {
  const { state, debouncedRun, renderRockers, refreshAudit } = ctx;
  const host = document.getElementById("bayControls");
  const m = state.bay02Mode;
  const titles = {
    kinematics: "2A · Kinematics & Flow Lines",
    vortex: "2B · Radial Vortex Trap",
    vessel: "2C · Rotating Vessel (Ex. 4.8)",
    potential: "2D · Magnus Lift Cylinder",
  };
  host.innerHTML = `
    <section class="panel-bay">
      <div class="bay-header">
        <span>${titles[m]}</span>
        <span class="tag-mono">Ch. 3 / 4.5 / 7</span>
      </div>
      <div id="subControls"></div>
    </section>
  `;

  const sub = document.getElementById("subControls");
  if (m === "kinematics") {
    const kp = state.kinParams;
    sub.innerHTML = `
      <div class="preset-row" style="margin-bottom:8px;">
        <button class="btn-machined" id="preEx310">Ex 3.10 Unsteady</button>
        <button class="btn-machined" id="preShear">Pure Shear</button>
        <button class="btn-machined" id="preFreeV">Free Vortex</button>
        <button class="btn-machined" id="preForcedV">Solid Rotation</button>
      </div>
      <div class="field-group">
        <div class="field-label-row"><span>u(x, y, t) =</span></div>
        <input class="text-input mono-input" id="inU" />
      </div>
      <div class="field-group" style="margin-top:8px;">
        <div class="field-label-row"><span>v(x, y, t) =</span></div>
        <input class="text-input mono-input" id="inV" />
      </div>
      <div class="grid-2" style="margin-top:10px;">
        <div class="field-group">
          <div class="field-label-row"><span>Evaluation Time t</span><span class="val-readout" id="lblTeval">${kp.t_eval.toFixed(2)}</span></div>
          <input type="range" id="rngTeval" min="1.1" max="4.0" step="0.05" value="${kp.t_eval}" />
        </div>
        <div class="field-group">
          <div class="field-label-row"><span>Param v₀</span><span class="val-readout" id="lblV0">${kp.v0.toFixed(2)}</span></div>
          <input type="range" id="rngV0" min="0.2" max="2.5" step="0.1" value="${kp.v0}" />
        </div>
        <div class="field-group">
          <div class="field-label-row"><span>Seed x₀</span><span class="val-readout" id="lblX0">${kp.x0.toFixed(2)}</span></div>
          <input type="range" id="rngX0" min="-2.0" max="3.0" step="0.1" value="${kp.x0}" />
        </div>
        <div class="field-group">
          <div class="field-label-row"><span>Seed y₀</span><span class="val-readout" id="lblY0">${kp.y0.toFixed(2)}</span></div>
          <input type="range" id="rngY0" min="-2.0" max="2.5" step="0.1" value="${kp.y0}" />
        </div>
      </div>
      <button class="btn-machined btn-primary" id="btnRunKin" style="width:100%;margin-top:10px;">Integrate Field &amp; Tracers</button>
    `;
    document.getElementById("inU").value = kp.u_str;
    document.getElementById("inV").value = kp.v_str;

    document.getElementById("preEx310").onclick = () => {
      Object.assign(kp, { u_str: "x / (t + t0)", v_str: "v0", x0: 1.0, y0: 0.0, t0: 1.0, t_eval: 2.0, v0: 1.0, loop_cx: 1.5, loop_cy: 0.8, loop_r: 0.7 });
      state.assumptions.steady = false;
      state.assumptions.irrotational = true;
      state.assumptions.irreversible_jump = false;
      state.assumptions.inviscid = true;
      renderBay02Controls(ctx);
      renderRockers();
      refreshAudit();
      runBay02(ctx);
    };
    document.getElementById("preShear").onclick = () => {
      Object.assign(kp, { u_str: "1.2 * y + 0.5", v_str: "0", x0: 0.5, y0: 1.0, t_eval: 2.2, loop_cx: 1.5, loop_cy: 0.8, loop_r: 0.7 });
      state.assumptions.steady = true;
      state.assumptions.irrotational = false;
      state.assumptions.irreversible_jump = false;
      renderBay02Controls(ctx);
      renderRockers();
      refreshAudit();
      runBay02(ctx);
    };
    document.getElementById("preFreeV").onclick = () => {
      Object.assign(kp, { u_str: "-2*y / (x^2 + y^2 + 0.04)", v_str: "2*x / (x^2 + y^2 + 0.04)", x0: 1.4, y0: 0.0, t_eval: 1.8, loop_cx: 1.2, loop_cy: 0.8, loop_r: 0.65 });
      state.assumptions.steady = true;
      state.assumptions.irrotational = true;
      state.assumptions.irreversible_jump = false;
      renderBay02Controls(ctx);
      renderRockers();
      refreshAudit();
      runBay02(ctx);
    };
    document.getElementById("preForcedV").onclick = () => {
      Object.assign(kp, { u_str: "-1.5*y", v_str: "1.5*x", x0: 1.4, y0: 0.0, t_eval: 1.8, loop_cx: 0.0, loop_cy: 0.0, loop_r: 0.8 });
      state.assumptions.steady = true;
      state.assumptions.irrotational = false;
      state.assumptions.irreversible_jump = false;
      renderBay02Controls(ctx);
      renderRockers();
      refreshAudit();
      runBay02(ctx);
    };

    const syncInputsAndRun = () => {
      kp.u_str = document.getElementById("inU").value;
      kp.v_str = document.getElementById("inV").value;
      debouncedRun("bay02", () => runBay02(ctx), 70);
    };

    document.getElementById("rngTeval").oninput = (e) => {
      kp.t_eval = parseFloat(e.target.value);
      document.getElementById("lblTeval").textContent = kp.t_eval.toFixed(2);
      syncInputsAndRun();
    };
    document.getElementById("rngV0").oninput = (e) => {
      kp.v0 = parseFloat(e.target.value);
      document.getElementById("lblV0").textContent = kp.v0.toFixed(2);
      syncInputsAndRun();
    };
    document.getElementById("rngX0").oninput = (e) => {
      kp.x0 = parseFloat(e.target.value);
      document.getElementById("lblX0").textContent = kp.x0.toFixed(2);
      syncInputsAndRun();
    };
    document.getElementById("rngY0").oninput = (e) => {
      kp.y0 = parseFloat(e.target.value);
      document.getElementById("lblY0").textContent = kp.y0.toFixed(2);
      syncInputsAndRun();
    };
    document.getElementById("btnRunKin").onclick = () => {
      kp.u_str = document.getElementById("inU").value;
      kp.v_str = document.getElementById("inV").value;
      runBay02(ctx);
    };
  } else if (m === "vortex") {
    const vp = state.vortexParams;
    const isForced = vp.mode === "forced";
    const isFree = vp.mode === "free";
    const isRankine = vp.mode === "rankine";
    const isSpiral = vp.mode === "spiral";

    let slidersHtml = "";
    if (isForced || isRankine) {
      slidersHtml += `
        <div class="field-group">
          <div class="field-label-row"><span>Angular Speed &omega; (rad/s)</span><span class="val-readout" id="lblOm">${vp.omega.toFixed(1)}</span></div>
          <input type="range" id="rngOm" min="2" max="25" step="0.5" value="${vp.omega}" />
        </div>`;
    }
    if (isFree || isSpiral) {
      slidersHtml += `
        <div class="field-group">
          <div class="field-label-row"><span>Swirl Constant C (m&sup2;/s)</span><span class="val-readout" id="lblC">${vp.strength_c.toFixed(2)}</span></div>
          <input type="range" id="rngC" min="0.2" max="2.5" step="0.05" value="${vp.strength_c}" />
        </div>`;
    }
    if (isRankine) {
      slidersHtml += `
        <div class="field-group">
          <div class="field-label-row"><span>Core Radius Rc (m)</span><span class="val-readout" id="lblRc">${vp.core_radius.toFixed(2)}</span></div>
          <input type="range" id="rngRc" min="0.1" max="0.5" step="0.02" value="${vp.core_radius}" />
        </div>`;
    }
    if (isSpiral) {
      slidersHtml += `
        <div class="field-group">
          <div class="field-label-row"><span>Radial Sink/Source C&#8322;</span><span class="val-readout" id="lblC2">${vp.radial_c2.toFixed(2)}</span></div>
          <input type="range" id="rngC2" min="-1.0" max="1.0" step="0.05" value="${vp.radial_c2}" />
        </div>`;
    }
    slidersHtml += `
      <div class="field-group">
        <div class="field-label-row"><span>Outer Probe r&#8322; (m)</span><span class="val-readout" id="lblR2">${vp.r2.toFixed(2)}</span></div>
        <input type="range" id="rngR2" min="0.2" max="0.58" step="0.02" value="${vp.r2}" />
      </div>`;

    sub.innerHTML = `
      <div class="field-group">
        <div class="field-label-row"><span>Vortex Regime</span></div>
        <select class="select-input" id="selVortex">
          <option value="forced" ${isForced ? "selected" : ""}>Forced Vortex (vθ = ωr, Rotational)</option>
          <option value="free" ${isFree ? "selected" : ""}>Free Vortex (vθ = C/r, Ex 4.7)</option>
          <option value="rankine" ${isRankine ? "selected" : ""}>Rankine Combined Vortex</option>
          <option value="spiral" ${isSpiral ? "selected" : ""}>Spiral Free Vortex (Log Spiral)</option>
        </select>
      </div>
      <div class="grid-2" style="margin-top:10px;">
        ${slidersHtml}
      </div>
    `;

    document.getElementById("selVortex").onchange = (e) => {
      vp.mode = e.target.value;
      state.assumptions.irrotational = vp.mode === "free" || vp.mode === "spiral";
      state.assumptions.steady = true;
      renderBay02Controls(ctx);
      renderRockers();
      refreshAudit("radial_euler");
      runBay02(ctx);
    };

    const bindSlider = (id, key, lbl, dec) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.oninput = (e) => {
        vp[key] = parseFloat(e.target.value);
        document.getElementById(lbl).textContent = vp[key].toFixed(dec);
        debouncedRun("bay02", () => runBay02(ctx), 55);
      };
    };
    bindSlider("rngOm", "omega", "lblOm", 1);
    bindSlider("rngC", "strength_c", "lblC", 2);
    bindSlider("rngRc", "core_radius", "lblRc", 2);
    bindSlider("rngC2", "radial_c2", "lblC2", 2);
    bindSlider("rngR2", "r2", "lblR2", 2);
  } else if (m === "vessel") {
    const tv = state.vesselParams;
    sub.innerHTML = `
      <div class="grid-2" style="margin-top:4px;">
        <div class="field-group">
          <div class="field-label-row"><span>Spin RPM</span><span class="val-readout" id="lblRpm">${tv.rpm.toFixed(0)}</span></div>
          <input type="range" id="rngRpm" min="0" max="200" step="5" value="${tv.rpm}" />
        </div>
        <div class="field-group">
          <div class="field-label-row"><span>Height H (m)</span><span class="val-readout" id="lblH">${tv.vessel_height.toFixed(3)}</span></div>
          <input type="range" id="rngH" min="0.25" max="0.80" step="0.01" value="${tv.vessel_height}" />
        </div>
      </div>
      <div class="preset-row" style="margin-top:10px;">
        <button class="btn-machined" id="preEx48a">Ex 4.8 @ 100 RPM</button>
        <button class="btn-machined" id="preEx48b">Ex 4.8 @ 130 RPM</button>
      </div>
    `;
    document.getElementById("rngRpm").oninput = (e) => {
      tv.rpm = parseFloat(e.target.value);
      document.getElementById("lblRpm").textContent = tv.rpm.toFixed(0);
      debouncedRun("bay02", () => runBay02(ctx), 55);
    };
    document.getElementById("rngH").oninput = (e) => {
      tv.vessel_height = parseFloat(e.target.value);
      tv.initial_depth = tv.vessel_height;
      document.getElementById("lblH").textContent = tv.vessel_height.toFixed(3);
      debouncedRun("bay02", () => runBay02(ctx), 55);
    };
    document.getElementById("preEx48a").onclick = () => {
      tv.rpm = 100; tv.vessel_height = 0.503; tv.initial_depth = 0.503;
      renderBay02Controls(ctx);
      runBay02(ctx);
    };
    document.getElementById("preEx48b").onclick = () => {
      tv.rpm = 130; tv.vessel_height = 0.503; tv.initial_depth = 0.503;
      renderBay02Controls(ctx);
      runBay02(ctx);
    };
  } else {
    const pp = state.potentialParams;
    sub.innerHTML = `
      <div class="grid-2" style="margin-top:4px;">
        <div class="field-group">
          <div class="field-label-row"><span>Freestream U&#8734; (m/s)</span><span class="val-readout" id="lblUinf">${pp.u_inf.toFixed(1)}</span></div>
          <input type="range" id="rngUinf" min="0.5" max="5.0" step="0.2" value="${pp.u_inf}" />
        </div>
        <div class="field-group">
          <div class="field-label-row"><span>Circulation &Gamma; (m&sup2;/s)</span><span class="val-readout" id="lblGam">${pp.gamma.toFixed(1)}</span></div>
          <input type="range" id="rngGam" min="-25" max="25" step="1.0" value="${pp.gamma}" />
        </div>
      </div>
    `;
    document.getElementById("rngUinf").oninput = (e) => {
      pp.u_inf = parseFloat(e.target.value);
      document.getElementById("lblUinf").textContent = pp.u_inf.toFixed(1);
      debouncedRun("bay02", () => runBay02(ctx), 55);
    };
    document.getElementById("rngGam").oninput = (e) => {
      pp.gamma = parseFloat(e.target.value);
      document.getElementById("lblGam").textContent = pp.gamma.toFixed(1);
      debouncedRun("bay02", () => runBay02(ctx), 55);
    };
  }
}

async function runBay02(ctx) {
  const {
    state,
    bus,
    apiPost,
    flowEngine,
    plotEngine,
    setLegend,
    setConceptBanner,
    clearSecondaryControls,
    setDrawerMetrics,
    setDrawerCards,
    renderRockers,
    refreshAudit,
  } = ctx;

  clearSecondaryControls();
  const m = state.bay02Mode;
  try {
    if (m === "kinematics") {
      const kp = state.kinParams;
      const reqBounds = computeKinRequestBounds(kp);
      const reqPayload = {
        u_str: kp.u_str,
        v_str: kp.v_str,
        params: { t0: kp.t0, v0: kp.v0 },
        x0: kp.x0,
        y0: kp.y0,
        t0: kp.t0,
        t_eval: kp.t_eval,
        bounds: reqBounds,
        loop_center: [kp.loop_cx, kp.loop_cy],
        loop_radius: kp.loop_r,
      };
      const d = await apiPost("/api/kinematics", reqPayload, "activeLab");

      if (d?.classification) {
        state.assumptions.steady = Boolean(d.classification.steady);
        if (d.classification.incompressible !== undefined) {
          state.assumptions.incompressible = Boolean(d.classification.incompressible);
        }
        state.assumptions.irrotational = Boolean(d.classification.irrotational);
        state.assumptionCauses = {
          steady: d.classification.steady ? "∂V/∂t = 0" : "∂V/∂t ≠ 0",
          incompressible: `∇·V = ${Number(d.point_probe?.divergence ?? 0).toFixed(3)} s⁻¹`,
          irrotational: `Ωz = ${Number(d.point_probe?.vorticity_z ?? 0).toFixed(3)} s⁻¹`,
        };
        renderRockers();
        refreshAudit("ns_x");
      }

      const { viewBounds, clippedStream } = computeKinematicsFraming(d);

      document.getElementById("primaryTitle").textContent = "Streamline vs. Pathline vs. Streakline + Fluid Element";
      document.getElementById("secondaryTitle").textContent = "Trajectory Comparison x(y) & Stokes Check";
      setLegend("primaryLegend", [
        { label: "Streamline", color: "primary" },
        { label: "Pathline", color: "amber" },
        { label: "Streakline", color: "coral", dashed: true },
        { label: "Stokes Loop", color: "ok", dashed: true },
      ]);
      setLegend("secondaryLegend", [
        { label: "Streamline", color: "primary" },
        { label: "Pathline", color: "amber" },
        { label: "Streakline", color: "coral", dashed: true },
      ]);
      setConceptBanner(
        d.classification.curves_coincide
          ? "<strong>Steady Kinematics:</strong> Instantaneous streamline, particle pathline, and dye streakline lie identically atop one another."
          : "<strong>Unsteady Kinematics (Ex. 3.10):</strong> Because ∂V/∂t ≠ 0, the dark blue streamline, ochre pathline, and crimson streakline diverge into distinct curves.",
        "Green dashed loop verifies Stokes' theorem (Γ = ∬Ωz dA); orange square visualizes element shear & rotation.",
        "insight"
      );

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
        seedPoint: [kp.x0, kp.y0],
      });

      const yVals = d.curves.pathline.map((p) => p[1]);
      const ySpan = yVals.length > 1 ? Math.max(...yVals) - Math.min(...yVals) : 0;
      plotEngine.setPlot({
        probeAxis: ySpan > 0.05 ? "y" : "x",
        xLabel: "Horizontal position x (m)",
        yLabel: "Vertical position y (m)",
        xShort: "x",
        yShort: "y",
        series: [
          { name: "Streamline", x: clippedStream.map((p) => p[0]), y: clippedStream.map((p) => p[1]), color: "primary" },
          { name: "Pathline", x: d.curves.pathline.map((p) => p[0]), y: d.curves.pathline.map((p) => p[1]), color: "amber" },
          { name: "Streakline", x: d.curves.streakline.map((p) => p[0]), y: d.curves.streakline.map((p) => p[1]), color: "coral", dashed: true },
        ],
        defaultHud: d.classification.curves_coincide
          ? "Steady field: All three curves coincide identically"
          : "Hover along trajectories to compare Streamline vs. Pathline vs. Streakline",
      });

      const pr = d.point_probe;
      const st = d.stokes_check;
      setDrawerMetrics([
        { k: "DIV", v: pr.divergence !== null ? pr.divergence.toFixed(3) : "-" },
        { k: "Ωz", v: pr.vorticity_z !== null ? `${pr.vorticity_z.toFixed(3)} s⁻¹` : "-", color: "var(--amber)" },
        { k: "Γ_line", v: st.circulation_line !== null ? st.circulation_line.toFixed(3) : "-" },
      ]);
      setDrawerCards([
        { k: "Symbolic Vorticity Ωz", tex: `\\Omega_z = ${d.expressions.vorticity_tex}` },
        { k: "Flow Classification", v: `${d.classification.steady ? "Steady" : "Unsteady"} · ${d.classification.irrotational ? "Irrotational" : "Rotational"}`, tone: d.classification.steady ? "" : "amber" },
        { k: "Curves Coincide?", v: d.classification.curves_coincide ? "Yes (Steady flow)" : "No — Stream, Path & Streak diverge!", tone: d.classification.curves_coincide ? "ok" : "coral" },
        { k: "Stokes Check Γ = ∬Ωz dA", v: `Line: ${st.circulation_line?.toFixed(3) ?? "-"} vs Area: ${st.circulation_area_vorticity.toFixed(3)}` },
      ]);

      if (bus) {
        bus.emit("solver:updated", {
          bay: "02",
          sub: "kinematics",
          family: "kinematics_equation",
          payload: reqPayload,
          solverData: d,
          parsedQuery: {
            family: "kinematics_equation",
            confidence: 1.0,
            parser_mode: "live_lab",
            assumptions: { ...state.assumptions },
            params: reqPayload,
            obstacles: [],
            concept_twist: "Unsteady flows separate streamline, pathline, and streakline; nonzero divergence violates incompressibility.",
            broken_shortcut: "Assuming streamlines equal particle trajectories or steady streamlines when ∂V/∂t ≠ 0.",
            textbook_ref: "Ch. 3.3, Ex. 3.10",
            raw_query: `u = ${kp.u_str}, v = ${kp.v_str} at t = ${kp.t_eval}`,
          },
        });
      }
    } else if (m === "vortex") {
      const vp = state.vortexParams;
      const reqPayload = { ...vp, r_max: vp.r_max ?? 0.60 };
      const d = await apiPost("/api/vortex", reqPayload, "activeLab");
      document.getElementById("primaryTitle").textContent = `${vp.mode.toUpperCase()} Vortex Swirl Plane`;
      document.getElementById("secondaryTitle").textContent = "Radial Pressure: Exact Euler vs. Naive Bernoulli";
      setLegend("primaryLegend", vp.mode === "rankine" ? [{ label: "Core Rc", color: "amber", dashed: true }] : []);
      setLegend("secondaryLegend", [
        { label: "Exact p(r)", color: "primary" },
        { label: "Naive Bernoulli p(r)", color: "coral", dashed: true },
      ]);
      setConceptBanner(
        d.bernoulli_globally_valid
          ? `<strong>Irrotational ${vp.mode.toUpperCase()} Vortex:</strong> Since Ωz = 0 outside r = 0, mechanical head H stays constant radially and Bernoulli matches Euler.`
          : `<strong>Rotational Vortex (${vp.mode.toUpperCase()}):</strong> Nonzero vorticity (Ωz = 2ω) causes total head H to rise radially (∂H/∂n = VΩz/g).`,
        d.bernoulli_globally_valid
          ? "Notice the shaded error band disappears when irrotationality holds."
          : "Shaded red band exposes Bernoulli's sign reversal in a rotational core!",
        d.bernoulli_globally_valid ? "insight" : "trap"
      );

      flowEngine.setScene({
        bounds: d.field_2d.bounds,
        aspectLock: true,
        xLabel: "x (m)",
        yLabel: "y (m)",
        field: { ...d.field_2d, vorticity: null },
        vortexCoreRadius: vp.mode === "rankine" ? vp.core_radius : null,
        spiralCurve: d.spiral_curve,
      });

      plotEngine.setPlot({
        xLabel: "Radius r (m)",
        yLabel: "Pressure change p - p₁ (kPa)",
        xShort: "r",
        shadeDiff: true,
        vMarkers: [
          { x: vp.r1, label: "r₁", color: "#475569" },
          { x: vp.r2, label: "r₂", color: "amber" },
        ],
        series: [
          { name: "Exact p (kPa)", x: d.r, y: d.p_true.map((p) => p / 1000), color: "primary" },
          { name: "Naive p (kPa)", x: d.r, y: d.p_naive.map((p) => p / 1000), color: "coral", dashed: true },
        ],
        defaultHud: "Shaded crimson band = pressure error from constant-head Bernoulli assumption",
      });

      const pr = d.probes;
      setDrawerMetrics([
        { k: "Δp_true", v: `${(pr.dp_true / 1000).toFixed(2)} kPa`, color: "var(--accent)" },
        { k: "Δp_naive", v: `${(pr.dp_naive / 1000).toFixed(2)} kPa`, color: "var(--coral)" },
        { k: "ΔH(r₁→r₂)", v: `${pr.head_gain_r1_to_r2.toFixed(2)} m` },
      ]);
      setDrawerCards([
        { k: "Exact Δp (Radial Euler)", v: `${(pr.dp_true / 1000).toFixed(3)} kPa`, tone: "accent" },
        { k: "Naive Bernoulli Δp", v: `${(pr.dp_naive / 1000).toFixed(3)} kPa`, tone: Math.abs(pr.dp_discrepancy) > 1 ? "coral" : "" },
        { k: "Cross-Stream Head Gain ΔH", v: `${pr.head_gain_r1_to_r2.toFixed(3)} m (Eq. 4.44 / 4.57)`, tone: "amber" },
        { k: "Explanation", v: d.bernoulli_globally_valid ? "Irrotational (Ωz = 0): Bernoulli matches radial Euler." : "Rotational core (Ωz = 2ω): Total head rises radially outward!" },
      ]);

      if (bus) {
        bus.emit("solver:updated", {
          bay: "02",
          sub: "vortex",
          family: "vortex_flow",
          payload: reqPayload,
          solverData: d,
          parsedQuery: {
            family: "vortex_flow",
            confidence: 1.0,
            parser_mode: "live_lab",
            assumptions: { ...state.assumptions },
            params: reqPayload,
            obstacles: [],
            concept_twist: d.bernoulli_globally_valid
              ? "Free vortex is irrotational outside r=0 so total head H stays constant across streamlines."
              : "Rotational core has Ωz = 2ω ≠ 0 so Bernoulli cannot cross streamlines.",
            broken_shortcut: "Applying constant-head Bernoulli across streamlines in a rotational forced vortex.",
            textbook_ref: "Ch. 4.5, Eq. 4.43–4.57",
            raw_query: `${vp.mode} vortex from r1=${vp.r1} to r2=${vp.r2}`,
          },
        });
      }
    } else if (m === "vessel") {
      const reqPayload = { ...state.vesselParams };
      const d = await apiPost("/api/vessel", reqPayload, "activeLab");
      document.getElementById("primaryTitle").textContent = `Rotating Open Cylinder Cross-Section @ ${d.rpm.toFixed(0)} RPM`;
      document.getElementById("secondaryTitle").textContent = "Free Surface Paraboloid z(r) & Base Uncovering (Ex. 4.8)";
      setLegend("primaryLegend", [
        { label: "Water Paraboloid", color: "primary" },
        ...(d.uncovered_radius > 0 ? [{ label: "Dry Base R₁", color: "coral" }] : []),
      ]);
      setLegend("secondaryLegend", [
        { label: "Free Surface z(r)", color: "primary" },
        { label: "Rim Height H", color: "#475569", dashed: true },
      ]);
      setConceptBanner(
        "<strong>Rotating Cylinder Paraboloid (Ex. 4.8):</strong> Solid-body rotation shapes the free surface as z(r) = z₀ + ω²r²/(2g) across the open cylindrical tank.",
        "Above the rim-overflow speed, liquid spills overboard first before the center floor uncovers radius R₁!"
      );

      flowEngine.setScene(buildRotatingVesselScene(d));
      plotEngine.setPlot({
        xLabel: "Radius r (m)",
        yLabel: "Surface elevation z (m)",
        xShort: "r",
        series: [
          { name: "z_surf (m)", x: d.r, y: d.z_surface, color: "primary" },
          { name: "Rim H", x: [0, d.radius], y: [d.vessel_height, d.vessel_height], color: "#475569", dashed: true },
        ],
        vMarkers: d.uncovered_radius > 0 ? [{ x: d.uncovered_radius, label: "Dry R₁", color: "coral" }] : [],
        defaultHud: `Regime: ${d.regime} | Critical Uncover RPM: ${d.critical_full_uncover_rpm.toFixed(1)}`,
      });
      setDrawerMetrics([
        { k: "Regime", v: d.regime, color: "var(--accent)" },
        { k: "Dry Area", v: `${d.uncovered_area.toFixed(4)} m²`, color: d.uncovered_area > 0 ? "var(--coral)" : "var(--ok-green)" },
      ]);
      setDrawerCards([
        { k: "Paraboloid Rise ω²R²/2g", v: `${d.paraboloid_height.toFixed(3)} m`, tone: "amber" },
        { k: "Critical Touch RPM", v: `${d.critical_full_uncover_rpm.toFixed(1)} rpm` },
        { k: "Uncovered Base Area πR₁²", v: `${d.uncovered_area.toFixed(4)} m² (Ex 4.8 = 0.116 @ 130 rpm)`, tone: d.uncovered_area > 0 ? "coral" : "" },
        { k: "Spilled Liquid Fraction", v: `${(d.spilled_fraction * 100).toFixed(1)}% overboard` },
      ]);

      if (bus) {
        bus.emit("solver:updated", {
          bay: "02",
          sub: "vessel",
          family: "rotating_vessel",
          payload: reqPayload,
          solverData: d,
          parsedQuery: {
            family: "rotating_vessel",
            confidence: 1.0,
            parser_mode: "live_lab",
            assumptions: { ...state.assumptions },
            params: reqPayload,
            obstacles: [],
            concept_twist: "Open vessel spills over its rim first rather than conserving full initial water volume.",
            broken_shortcut: "Assuming trapped fluid volume equals initial fill volume once paraboloid reaches the top rim.",
            textbook_ref: "Ch. 4.5, Ex. 4.8",
            raw_query: `Open rotating vessel at ${reqPayload.rpm} RPM`,
          },
        });
      }
    } else {
      const pp = state.potentialParams;
      const kappa = 2 * Math.PI * pp.u_inf * 1.0;
      const reqPayload = {
        u_inf: pp.u_inf,
        alpha_deg: pp.alpha_deg ?? 0.0,
        doublets: [{ x: 0, y: 0, kappa }],
        vortices: [{ x: 0, y: 0, gamma: pp.gamma }],
      };
      const d = await apiPost("/api/potential", reqPayload, "activeLab");

      document.getElementById("primaryTitle").textContent = "Magnus Rotating Cylinder (Cp Contours & Stagnation)";
      document.getElementById("secondaryTitle").textContent = "Surface Pressure Coefficient Cp(x) @ y = 1.2 m";
      setLegend("primaryLegend", [{ label: "Stagnation Point", color: "coral" }]);
      setLegend("secondaryLegend", [{ label: "Cp(x, y = 1.2)", color: "primary" }]);
      setConceptBanner(
        "<strong>Magnus Effect & Kutta–Joukowski Lift:</strong> Superposing uniform stream, doublet, and circulation Γ generates transverse lift L' = -ρU∞Γ.",
        "Red dots mark exact stagnation points on the cylinder wall; for |Γ| > 4πU∞a they lift off into the fluid!"
      );

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
        yLabel: "Pressure coefficient Cp",
        xShort: "x",
        series: [{ name: "Cp(y=1.2)", x: d.xs, y: d.cp[Math.floor(d.cp.length * 0.72)], color: "primary" }],
        defaultHud: `Lift L' = ${d.lift_per_unit_span.toFixed(2)} N/m | Γ = ${d.total_circulation.toFixed(2)} m²/s`,
      });
      setDrawerMetrics([{ k: "Lift L'", v: `${d.lift_per_unit_span.toFixed(2)} N/m`, color: "var(--accent)" }]);
      setDrawerCards([
        { k: "Circulation Γ", v: `${d.total_circulation.toFixed(2)} m²/s` },
        { k: "Lift per Span L' = -ρU∞Γ", v: `${d.lift_per_unit_span.toFixed(2)} N/m`, tone: "accent" },
        { k: "Stagnation Points", v: d.stagnation_points.length ? `${d.stagnation_points.length} on cylinder surface` : "Detached off surface (|Γ| > 4πU∞a)", tone: d.stagnation_points.length ? "" : "coral" },
      ]);

      if (bus) {
        bus.emit("solver:updated", {
          bay: "02",
          sub: "potential",
          family: "potential_superposition",
          payload: reqPayload,
          solverData: d,
          parsedQuery: {
            family: "potential_superposition",
            confidence: 1.0,
            parser_mode: "live_lab",
            assumptions: { ...state.assumptions },
            params: reqPayload,
            obstacles: [],
            concept_twist: "Ideal potential flow with Γ predicts Kutta–Joukowski lift but zero D'Alembert drag.",
            broken_shortcut: "Expecting stagnation points to remain on the cylinder wall when |Γ| > 4πU∞a.",
            textbook_ref: "Ch. 7, Kutta–Joukowski",
            raw_query: `Magnus cylinder Uinf=${pp.u_inf}, Gamma=${pp.gamma}`,
          },
        });
      }
    }
  } catch (err) {
    if (err.name === "AbortError") return;
    document.getElementById("flowProbeHud").textContent = `Solver error: ${err.message}`;
  }
}

export function applyStation02Assumption(key, ctx) {
  const { state, renderRockers, refreshAudit } = ctx;
  const val = state.assumptions[key];
  if (state.bay02Mode === "kinematics" && key === "steady") {
    state.kinParams.u_str = val ? "x / t0" : "x / (t + t0)";
    state.kinParams.v_str = "v0";
    renderBay02Controls(ctx);
    runBay02(ctx);
    return true;
  }
  if (state.bay02Mode === "kinematics" && key === "irrotational") {
    if (val) {
      Object.assign(state.kinParams, { u_str: "x / (t + t0)", v_str: "v0", x0: 1.0, y0: 0.0, t_eval: 2.0 });
      state.assumptions.steady = false;
    } else {
      Object.assign(state.kinParams, { u_str: "1.2 * y + 0.5", v_str: "0", x0: 0.5, y0: 1.0, t_eval: 2.2 });
      state.assumptions.steady = true;
    }
    renderRockers();
    renderBay02Controls(ctx);
    runBay02(ctx);
    return true;
  }
  if (state.bay02Mode === "vortex" && key === "irrotational") {
    state.vortexParams.mode = val ? "free" : "forced";
    renderBay02Controls(ctx);
    refreshAudit("radial_euler");
    runBay02(ctx);
    return true;
  }
  return false;
}

export function renderStation02(ctx) {
  const { state, renderRockers, refreshAudit } = ctx;
  const eqCtx = state.bay02Mode === "vortex" ? "radial_euler" : "ns_x";
  Object.assign(state.assumptions, {
    steady: state.bay02Mode !== "kinematics" || !/\bt\b/.test(state.kinParams.u_str),
    incompressible: state.bay02Mode !== "kinematics",
    inviscid: true,
    irrotational:
      state.bay02Mode === "potential" ||
      state.bay02Mode === "kinematics" ||
      (state.bay02Mode === "vortex" && ["free", "spiral"].includes(state.vortexParams.mode)),
    no_slip: true,
    newtonian: true,
    inertial_frame: true,
    adverse_pressure_gradient: false,
    irreversible_jump: false,
  });
  renderRockers();
  refreshAudit(eqCtx);
  renderBay02Controls(ctx);
  runBay02(ctx);
}
