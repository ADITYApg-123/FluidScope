import { renderAuditBar, renderTex } from "./math_ui.js";
import { FlowCanvasEngine } from "./canvas_flow.js";
import { CurvePlotEngine } from "./canvas_plots.js";
import { renderOverview } from "./overview.js";
import {
  buildRotatingVesselScene,
  computeKinematicsFraming,
} from "./stations/scene_mapper.js";
import { renderStation01 } from "./stations/station01.js";
import { renderStation03 } from "./stations/station03.js";
import { renderStation04 } from "./stations/station04.js";
import { renderStation05 } from "./stations/station05.js";

const state = {
  activeView: "overview", // overview | 01 | labs | 05
  activeBay: "02",
  bay02Mode: "kinematics", // kinematics | vortex | vessel | potential
  llmConfig: {
    provider: "offline",
    api_key: "",
    model: "",
    base_url: "https://api.openai.com/v1",
  },
  assumptions: {
    steady: false,
    incompressible: true,
    inviscid: true,
    irrotational: false,
    no_slip: true,
    newtonian: true,
    inertial_frame: true,
    adverse_pressure_gradient: false,
    irreversible_jump: false,
  },
  kinParams: {
    u_str: "x / (t + t0)",
    v_str: "v0",
    t0: 1.0,
    v0: 1.0,
    x0: 1.0,
    y0: 0.0,
    t_eval: 2.0,
    loop_cx: 1.5,
    loop_cy: 0.8,
    loop_r: 0.7,
  },
  vortexParams: {
    mode: "forced",
    strength_c: 0.9,
    omega: 10.0,
    core_radius: 0.30,
    radial_c2: -0.35,
    r1: 0.15,
    r2: 0.45,
  },
  vesselParams: {
    radius: 0.30,
    vessel_height: 0.503,
    initial_depth: 0.503,
    rpm: 130.0,
  },
  potentialParams: {
    u_inf: 2.0,
    doublet_kappa: 12.566,
    gamma: -12.566,
  },
};

const flowEngine = new FlowCanvasEngine(
  document.getElementById("flowCanvas"),
  document.getElementById("flowProbeHud")
);
const plotEngine = new CurvePlotEngine(
  document.getElementById("plotCanvas"),
  document.getElementById("plotProbeHud")
);

// AbortController + monotonic request tokens eliminate async out-of-order race conditions
const inFlightControllers = new Map();
const debounceTimers = new Map();

function debouncedRun(key, fn, delayMs = 65) {
  if (debounceTimers.has(key)) clearTimeout(debounceTimers.get(key));
  const id = setTimeout(() => {
    debounceTimers.delete(key);
    fn();
  }, delayMs);
  debounceTimers.set(key, id);
}

function cancelLabPending() {
  for (const [k, id] of debounceTimers.entries()) {
    clearTimeout(id);
    debounceTimers.delete(k);
  }
  for (const ch of ["activeLab", "coach"]) {
    if (inFlightControllers.has(ch)) {
      inFlightControllers.get(ch).abort();
      inFlightControllers.delete(ch);
    }
  }
}

async function apiPost(url, payload, channelKey = null) {
  let signal;
  if (channelKey) {
    if (inFlightControllers.has(channelKey)) {
      inFlightControllers.get(channelKey).abort();
    }
    const ctrl = new AbortController();
    inFlightControllers.set(channelKey, ctrl);
    signal = ctrl.signal;
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json.data;
}

const ROCKER_DEFS = [
  ["steady", "Steady"],
  ["incompressible", "Incomp."],
  ["inviscid", "Inviscid"],
  ["irrotational", "Irrotat."],
  ["no_slip", "No-Slip"],
  ["newtonian", "Newtonian"],
  ["inertial_frame", "Inertial"],
  ["adverse_pressure_gradient", "dp/dx > 0"],
  ["irreversible_jump", "Shock/Jump"],
];

function applyAssumptionToActiveLab(key) {
  if (state.activeView !== "labs") return false;
  const val = state.assumptions[key];

  if (state.activeBay === "02") {
    if (state.bay02Mode === "kinematics" && key === "steady") {
      state.kinParams.u_str = val ? "x / t0" : "x / (t + t0)";
      state.kinParams.v_str = "v0";
      renderBay02Controls();
      runBay02();
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
      renderBay02Controls();
      runBay02();
      return true;
    }
    if (state.bay02Mode === "vortex" && key === "irrotational") {
      state.vortexParams.mode = val ? "free" : "forced";
      renderBay02Controls();
      runBay02();
      return true;
    }
  } else if (state.activeBay === "03" && state.s3) {
    const bayCtx = makeBayCtx();
    if (state.bay03Mode === "separation" && key === "adverse_pressure_gradient") {
      if (state.s3.use_falkner_skan) state.s3.beta_fs = val ? -0.15 : 0.30;
      else state.s3.lambda_pg = val ? -14.0 : 5.0;
      renderStation03(bayCtx);
      return true;
    }
    if (state.bay03Mode === "couette" && key === "adverse_pressure_gradient") {
      state.s3.P_cp = val ? -3.0 : 1.5;
      renderStation03(bayCtx);
      return true;
    }
    if (state.bay03Mode === "slip_hb" && key === "no_slip") {
      state.s3.slip_mm = val ? 0.0 : 0.25;
      renderStation03(bayCtx);
      return true;
    }
    if (state.bay03Mode === "slip_hb" && key === "newtonian") {
      state.s3.n_hb = val ? 1.0 : 0.65;
      state.s3.tau_y = val ? 0.0 : 2.5;
      renderStation03(bayCtx);
      return true;
    }
  } else if (state.activeBay === "04" && state.s4 && state.bay04Mode === "tank" && key === "inertial_frame") {
    state.s4.tankAx = val ? 0.0 : 3.0;
    state.s4.tankAz = 0.0;
    renderStation04(makeBayCtx());
    return true;
  }
  return false;
}

function renderRockers() {
  const container = document.getElementById("assumptionRockers");
  if (!container) return;
  container.innerHTML = "";
  for (const [key, label] of ROCKER_DEFS) {
    const val = state.assumptions[key];
    const isWarningFlag = key === "adverse_pressure_gradient" || key === "irreversible_jump";
    const isTrapFlag = isWarningFlag ? val : !val;
    const btn = document.createElement("button");
    btn.className = `rocker-btn ${val ? "on" : ""} ${isTrapFlag ? "broken" : ""}`;
    btn.innerHTML = `<span>${label}</span><span class="led ${isTrapFlag ? "led-coral" : "led-ok"}"></span>`;
    btn.onclick = () => {
      state.assumptions[key] = !state.assumptions[key];
      if (key === "inviscid" && state.assumptions.inviscid) {
        state.assumptions.irreversible_jump = false;
      }
      renderRockers();
      refreshAudit();
      applyAssumptionToActiveLab(key);
    };
    container.appendChild(btn);
  }
}

async function refreshAudit() {
  try {
    const data = await apiPost("/api/audit", state.assumptions, "audit");
    renderAuditBar(data);
    document.getElementById("bernoulliVerdictBadge").textContent = data.bernoulli_status.valid_globally
      ? "Bernoulli: Global"
      : data.bernoulli_status.valid_along_streamline
      ? "Streamline Only"
      : "Bernoulli Broken";

    const warnBox = document.getElementById("assumptionWarnings");
    warnBox.innerHTML = "";
    data.warnings.slice(0, 3).forEach((w) => {
      const div = document.createElement("div");
      div.className = "warning-line";
      div.textContent = w;
      warnBox.appendChild(div);
    });
  } catch (err) {
    if (err.name === "AbortError") return;
    document.getElementById("kernelBadge").textContent = `Err: ${err.message}`;
  }
}

function resolveBadgeColor(col) {
  if (!col) return "var(--ink-primary)";
  const c = String(col).toLowerCase();
  if (c === "primary" || c === "#58a6ff" || c === "#1d4ed8") return "var(--accent)";
  if (c === "amber" || c === "#e6a23c") return "var(--amber)";
  if (c === "coral" || c === "trap" || c === "#e05a47") return "var(--coral)";
  if (c === "ok" || c === "#58b368") return "var(--ok-green)";
  if (c === "#d9e2ec" || c === "#f0f6fc") return "var(--ink-primary)";
  if (c === "#9fb3c8" || c === "#7f8ea3") return "var(--ink-secondary)";
  return col;
}

function setLegend(elId, items) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.innerHTML = items
    .map((it) => {
      const c = resolveBadgeColor(it.color);
      return `<span class="leg-item"><span class="leg-swatch" style="background:${c};${
        it.dashed ? "border-top:2.5px dashed " + c + ";background:transparent;" : ""
      }"></span>${it.label}</span>`;
    })
    .join("");
}

function setConceptBanner(mainHtml, trapHtml) {
  const m = document.getElementById("conceptBannerText");
  const t = document.getElementById("conceptBannerTrap");
  if (m && mainHtml) m.innerHTML = mainHtml;
  if (t && trapHtml) t.innerHTML = trapHtml;
}

function clearSecondaryControls() {
  const slot = document.getElementById("secondaryPlotControls");
  if (slot) slot.innerHTML = "";
}

function setDrawerMetrics(items) {
  const box = document.getElementById("drawerMetrics");
  box.innerHTML = items
    .map((m) => `<span style="color:${resolveBadgeColor(m.color)}">${m.k}: ${m.v}</span>`)
    .join("");
}

function setDrawerCards(cards) {
  const body = document.getElementById("drawerBody");
  body.innerHTML = "";
  const grid = document.createElement("div");
  grid.className = "diag-grid";
  cards.forEach((c) => {
    const cell = document.createElement("div");
    cell.className = "diag-cell";
    const key = document.createElement("div");
    key.className = "diag-key";
    key.textContent = c.k;
    const val = document.createElement("div");
    val.className = `diag-val ${c.tone || ""}`;
    if (c.tex) {
      renderTex(val, c.tex, false);
    } else if (c.html) {
      val.innerHTML = c.html;
    } else {
      val.textContent = c.v ?? "";
    }
    cell.appendChild(key);
    cell.appendChild(val);
    grid.appendChild(cell);
  });
  body.appendChild(grid);
}

function computeKinRequestBounds(kp) {
  const xs = [kp.x0, kp.x0 + 2.2, kp.loop_cx - kp.loop_r - 0.5, kp.loop_cx + kp.loop_r + 0.5];
  const ys = [kp.y0, kp.y0 + kp.v0 * Math.max(0.5, kp.t_eval - kp.t0) + 0.6, kp.loop_cy - kp.loop_r - 0.5, kp.loop_cy + kp.loop_r + 0.5];
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

function renderBay02Controls() {
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
      Object.assign(kp, { u_str: "x / (t + t0)", v_str: "v0", x0: 1.0, y0: 0.0, t_eval: 2.0, v0: 1.0, loop_cx: 1.5, loop_cy: 0.8, loop_r: 0.7 });
      state.assumptions.steady = false;
      state.assumptions.irrotational = true;
      state.assumptions.irreversible_jump = false;
      state.assumptions.inviscid = true;
      renderBay02Controls(); renderRockers(); refreshAudit(); runBay02();
    };
    document.getElementById("preShear").onclick = () => {
      Object.assign(kp, { u_str: "1.2 * y + 0.5", v_str: "0", x0: 0.5, y0: 1.0, t_eval: 2.2, loop_cx: 1.5, loop_cy: 0.8, loop_r: 0.7 });
      state.assumptions.steady = true;
      state.assumptions.irrotational = false;
      state.assumptions.irreversible_jump = false;
      renderBay02Controls(); renderRockers(); refreshAudit(); runBay02();
    };
    document.getElementById("preFreeV").onclick = () => {
      Object.assign(kp, { u_str: "-2*y / (x^2 + y^2 + 0.04)", v_str: "2*x / (x^2 + y^2 + 0.04)", x0: 1.4, y0: 0.0, t_eval: 1.8, loop_cx: 1.2, loop_cy: 0.8, loop_r: 0.65 });
      state.assumptions.steady = true;
      state.assumptions.irrotational = true;
      state.assumptions.irreversible_jump = false;
      renderBay02Controls(); renderRockers(); refreshAudit(); runBay02();
    };
    document.getElementById("preForcedV").onclick = () => {
      Object.assign(kp, { u_str: "-1.5*y", v_str: "1.5*x", x0: 1.4, y0: 0.0, t_eval: 1.8, loop_cx: 0.0, loop_cy: 0.0, loop_r: 0.8 });
      state.assumptions.steady = true;
      state.assumptions.irrotational = false;
      state.assumptions.irreversible_jump = false;
      renderBay02Controls(); renderRockers(); refreshAudit(); runBay02();
    };

    const syncInputsAndRun = () => {
      kp.u_str = document.getElementById("inU").value;
      kp.v_str = document.getElementById("inV").value;
      debouncedRun("bay02", runBay02, 70);
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
      runBay02();
    };
  } else if (m === "vortex") {
    const vp = state.vortexParams;
    const isForced = vp.mode === "forced";
    const isFree = vp.mode === "free";
    const isRankine = vp.mode === "rankine";
    const isSpiral = vp.mode === "spiral";

    // Contextual controls: show ONLY sliders active for the chosen vortex model!
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
      renderBay02Controls();
      renderRockers();
      refreshAudit();
      runBay02();
    };

    const bindSlider = (id, key, lbl, dec) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.oninput = (e) => {
        vp[key] = parseFloat(e.target.value);
        document.getElementById(lbl).textContent = vp[key].toFixed(dec);
        debouncedRun("bay02", runBay02, 55);
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
      debouncedRun("bay02", runBay02, 55);
    };
    document.getElementById("rngH").oninput = (e) => {
      tv.vessel_height = parseFloat(e.target.value);
      tv.initial_depth = tv.vessel_height;
      document.getElementById("lblH").textContent = tv.vessel_height.toFixed(3);
      debouncedRun("bay02", runBay02, 55);
    };
    document.getElementById("preEx48a").onclick = () => {
      tv.rpm = 100; tv.vessel_height = 0.503; tv.initial_depth = 0.503;
      renderBay02Controls(); runBay02();
    };
    document.getElementById("preEx48b").onclick = () => {
      tv.rpm = 130; tv.vessel_height = 0.503; tv.initial_depth = 0.503;
      renderBay02Controls(); runBay02();
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
      debouncedRun("bay02", runBay02, 55);
    };
    document.getElementById("rngGam").oninput = (e) => {
      pp.gamma = parseFloat(e.target.value);
      document.getElementById("lblGam").textContent = pp.gamma.toFixed(1);
      debouncedRun("bay02", runBay02, 55);
    };
  }
}

async function runBay02() {
  clearSecondaryControls();
  const m = state.bay02Mode;
  try {
    if (m === "kinematics") {
      const kp = state.kinParams;
      const reqBounds = computeKinRequestBounds(kp);
      const d = await apiPost(
        "/api/kinematics",
        {
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
        },
        "activeLab"
      );

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
        "Green dashed loop verifies Stokes' theorem (Γ = ∬Ωz dA); orange square visualizes element shear & rotation."
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
    } else if (m === "vortex") {
      const vp = state.vortexParams;
      const d = await apiPost("/api/vortex", vp, "activeLab");
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
          : "Shaded red band exposes Bernoulli's sign reversal in a rotational core!"
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
    } else if (m === "vessel") {
      const d = await apiPost("/api/vessel", state.vesselParams, "activeLab");
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
    } else {
      const pp = state.potentialParams;
      const kappa = 2 * Math.PI * pp.u_inf * 1.0;
      const d = await apiPost(
        "/api/potential",
        {
          u_inf: pp.u_inf,
          doublets: [{ x: 0, y: 0, kappa }],
          vortices: [{ x: 0, y: 0, gamma: pp.gamma }],
        },
        "activeLab"
      );
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
    }
  } catch (err) {
    if (err.name === "AbortError") return;
    document.getElementById("flowProbeHud").textContent = `Solver error: ${err.message}`;
  }
}

function renderAIConfigModal() {
  const existing = document.getElementById("aiModal");
  if (existing) { existing.remove(); return; }
  const div = document.createElement("div");
  div.id = "aiModal";
  div.style.cssText = "position:fixed;top:60px;right:18px;width:330px;z-index:60;background:var(--bg-bay);border:1px solid var(--accent);padding:14px;border-radius:8px;box-shadow:var(--shadow-md);";
  div.innerHTML = `
    <div class="bay-header"><span>AI Engine Settings</span><button class="btn-machined btn-xs" id="closeAiModal">Close</button></div>
    <div class="field-group" style="margin-top:10px;">
      <div class="field-label-row"><span>Backend Provider</span></div>
      <select class="select-input" id="selAiProv">
        <option value="offline" ${state.llmConfig.provider === "offline" ? "selected" : ""}>Offline Deterministic (No Key Required)</option>
        <option value="gemini" ${state.llmConfig.provider === "gemini" ? "selected" : ""}>Google Gemini (google-genai)</option>
        <option value="openai_compatible" ${state.llmConfig.provider === "openai_compatible" ? "selected" : ""}>OpenAI / Groq / Ollama REST</option>
      </select>
    </div>
    <div class="field-group" style="margin-top:8px;">
      <div class="field-label-row"><span>API Key (Optional / Env var supported)</span></div>
      <input type="password" class="text-input" id="inAiKey" value="${state.llmConfig.api_key}" placeholder="Optional key..." />
    </div>
    <div class="field-group" style="margin-top:8px;">
      <div class="field-label-row"><span>Model Name</span></div>
      <input class="text-input" id="inAiModel" value="${state.llmConfig.model}" placeholder="gemini-2.5-flash / gpt-4o-mini" />
    </div>
    <div class="field-group" style="margin-top:8px;">
      <div class="field-label-row"><span>Base URL (OpenAI / Groq / Ollama)</span></div>
      <input class="text-input" id="inAiUrl" value="${state.llmConfig.base_url}" />
    </div>
    <button class="btn-machined btn-primary" id="saveAiCfg" style="width:100%;margin-top:12px;">Apply AI Settings</button>
  `;
  document.body.appendChild(div);
  document.getElementById("closeAiModal").onclick = () => div.remove();
  document.getElementById("saveAiCfg").onclick = () => {
    state.llmConfig.provider = document.getElementById("selAiProv").value;
    state.llmConfig.api_key = document.getElementById("inAiKey").value;
    state.llmConfig.model = document.getElementById("inAiModel").value;
    state.llmConfig.base_url = document.getElementById("inAiUrl").value;
    document.getElementById("aiEngineBadge").textContent =
      state.llmConfig.provider === "offline"
        ? "AI: Offline"
        : `AI: ${state.llmConfig.provider.toUpperCase()}`;
    const tag = document.getElementById("s1CoachModeTag");
    if (tag) tag.textContent = state.llmConfig.provider.toUpperCase();
    div.remove();
  };
}

document.getElementById("aiEngineBadge").onclick = renderAIConfigModal;

function makeBayCtx() {
  return {
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
  };
}

function openStation(bayId) {
  cancelLabPending();
  clearSecondaryControls();
  const bayCtx = makeBayCtx();
  if (bayId === "01") renderStation01(bayCtx);
  else if (bayId === "02") {
    Object.assign(state.assumptions, {
      steady: state.bay02Mode !== "kinematics" || !state.kinParams.u_str.includes("t"),
      incompressible: true,
      inviscid: true,
      irrotational: state.bay02Mode === "potential" || (state.bay02Mode === "vortex" && ["free", "spiral"].includes(state.vortexParams.mode)),
      no_slip: true,
      newtonian: true,
      inertial_frame: true,
      adverse_pressure_gradient: false,
      irreversible_jump: false,
    });
    renderRockers();
    refreshAudit();
    renderBay02Controls();
    runBay02();
  }
  else if (bayId === "03") {
    Object.assign(state.assumptions, {
      steady: true,
      incompressible: true,
      inviscid: false,
      irrotational: false,
      inertial_frame: true,
      irreversible_jump: false,
    });
    renderRockers();
    refreshAudit();
    renderStation03(bayCtx);
  }
  else if (bayId === "04") renderStation04(bayCtx);
  else if (bayId === "05") renderStation05(bayCtx);
}

function updateLabPillsUI() {
  let activeSub = state.bay02Mode;
  if (state.activeBay === "03") activeSub = state.bay03Mode || "separation";
  else if (state.activeBay === "04") activeSub = state.bay04Mode || "lbm";
  document.querySelectorAll(".lab-pill").forEach((pill) => {
    const match = pill.dataset.bay === state.activeBay && pill.dataset.sub === activeSub;
    pill.classList.toggle("active", match);
  });
}

function openView(view) {
  state.activeView = view;
  const overviewEl = document.getElementById("overviewView");
  const workbenchEl = document.getElementById("workbenchView");
  const labStrip = document.getElementById("labSelectorStrip");

  document.querySelectorAll("#bayTabs .bay-tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.view === view);
  });

  if (view === "overview") {
    cancelLabPending();
    overviewEl.classList.remove("hidden");
    workbenchEl.classList.add("hidden");
    window.scrollTo({ top: 0, behavior: "auto" });
    return;
  }

  overviewEl.classList.add("hidden");
  workbenchEl.classList.remove("hidden");
  if (view === "labs") {
    labStrip.classList.remove("hidden");
    if (!["02", "03", "04"].includes(state.activeBay)) state.activeBay = "02";
  } else {
    labStrip.classList.add("hidden");
    state.activeBay = view; // "01" or "05"
  }
  updateLabPillsUI();
  openStation(state.activeBay);
  requestAnimationFrame(() => plotEngine.render());
}

function openLab(bayId, subMode) {
  state.activeBay = bayId;
  if (bayId === "02") state.bay02Mode = subMode;
  else if (bayId === "03") state.bay03Mode = subMode;
  else if (bayId === "04") state.bay04Mode = subMode;
  openView("labs");
}

function applyTheme(theme) {
  const mode = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", mode);
  try { localStorage.setItem("fluidscope_theme", mode); } catch (_) {}
  const icon = document.getElementById("themeIcon");
  const label = document.getElementById("themeLabel");
  if (icon) icon.innerHTML = mode === "dark" ? "&#9790;" : "&#9788;";
  if (label) label.textContent = mode === "dark" ? "Dark Mode" : "Light Mode";
  requestAnimationFrame(() => plotEngine.render());
}

document.querySelectorAll("#bayTabs .bay-tab").forEach((tab) => {
  tab.onclick = () => openView(tab.dataset.view);
});

document.getElementById("brandHomeBtn").onclick = () => openView("overview");

document.querySelectorAll(".lab-pill").forEach((pill) => {
  pill.onclick = () => openLab(pill.dataset.bay, pill.dataset.sub);
});

document.getElementById("themeToggleBtn").onclick = () => {
  const cur = document.documentElement.getAttribute("data-theme") || "light";
  applyTheme(cur === "light" ? "dark" : "light");
};

document.getElementById("toggleDrawerBtn").onclick = () => {
  const d = document.getElementById("telemetryDrawer");
  d.classList.toggle("collapsed");
  document.getElementById("toggleDrawerBtn").textContent = d.classList.contains("collapsed")
    ? "Show Details"
    : "Hide Details";
};

// Boot onto dedicated Overview Landing Page (Light Drafting Studio default)
let savedTheme = "light";
try { savedTheme = localStorage.getItem("fluidscope_theme") || "light"; } catch (_) {}
applyTheme(savedTheme);
renderOverview({ openView, openLab });
renderRockers();
refreshAudit();
openView("overview");
