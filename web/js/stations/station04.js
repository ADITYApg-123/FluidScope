/**
 * Station 04: Conservation Traps (Ch. 2.9, 11.5, 12.4) & Live Numba 2D D2Q9 LBM Tunnel.
 * Wave 1 — Agent D: single top-strip lab switching (no duplicate 2x2 switcher),
 * paired tabular-nums inputs + unit tags + fmtNum, 4A interactive obstacle drawing
 * (Circle / Rect / Splitter / Clear -> preset:"custom"), step scrubber (200/450/700),
 * |V| vs Ωz colormap toggle, 4B Fs(h), 4C pipe EGL/HGL, 4D Free-Fall sequence + efflux gauge,
 * collapsible Full Diagnostics, and ParsedPhysicsQuery coach context emission.
 */
import { fmtNum } from "../core/color_scales.js";
import { renderTex } from "../math_ui.js";
import { displaySolvedFamily } from "./scene_mapper.js";

const CONSERVATION_META = {
  lbm_tunnel: {
    concept_twist:
      "Viscous D2Q9 Lattice–Boltzmann flow sheds alternating Kármán vortices unless stabilized by geometry such as a wake splitter.",
    broken_shortcut:
      "Assuming steady symmetric potential streamlines behind a bluff cylinder at Re ~ 100.",
    textbook_ref: "Som, Biswas & Chakraborty Ch. 10 (Unsteady Viscous Wake & LBM)",
  },
  hydraulic_jump: {
    concept_twist:
      "Hydraulic jumps conserve integral specific force Fs rather than specific energy Es due to turbulent roller dissipation.",
    broken_shortcut:
      "Setting Es1 = Es2 across a hydraulic jump and ignoring irreversible eddy head loss hj.",
    textbook_ref: "Som, Biswas & Chakraborty Ch. 12.4 (Example 12.11, Eq. 12.48)",
  },
  sudden_expansion: {
    concept_twist:
      "Annular corner eddies hold shoulder pressure p' ≈ p1 across an abrupt expansion, reducing pressure recovery via Borda–Carnot loss.",
    broken_shortcut:
      "Using ideal lossless Bernoulli Δp = ½ρ(V1² - V2²) across a sudden pipe expansion.",
    textbook_ref: "Som, Biswas & Chakraborty Ch. 11.5 (Eq. 11.18–11.23)",
  },
  accelerating_tank: {
    concept_twist:
      "Isobars tilt perpendicular to effective body force g_eff = g - a_frame; in free fall (az = -g), g_eff = 0 halts bottom orifice flow.",
    broken_shortcut:
      "Applying static Torricelli efflux v = √(2gh) inside an accelerating or free-falling tank.",
    textbook_ref: "Som, Biswas & Chakraborty Ch. 2.9 (Eq. 2.86–2.88, p. 97–99)",
  },
};

let activeAnimToken = 0;
let lastSolvedS4 = { family: null, data: null };

function fmt(v, d = 3) {
  if (v === null || v === undefined || v === "") return "-";
  return fmtNum(v, d);
}

function roundDec(v, d = 2) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  const f = Math.pow(10, d);
  const r = Math.round(n * f) / f;
  return Object.is(r, -0) ? 0 : r;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function finiteOr(val, fallback) {
  if (val === null || val === undefined || val === "") return fallback;
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function prefersReducedMotion() {
  try {
    return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  } catch (_) {
    return false;
  }
}

function stopActiveAnimations() {
  activeAnimToken += 1;
}

function sanitizeObstacle(ob) {
  if (!ob || typeof ob !== "object") return null;
  const t = String(ob.type || "").toLowerCase();
  if (!["circle", "rect", "splitter", "step"].includes(t)) return null;
  if (t === "circle") {
    return {
      type: "circle",
      x: roundDec(clamp(finiteOr(ob.x, 0.25), 0.02, 0.95), 4),
      y: roundDec(clamp(finiteOr(ob.y, 0.5), 0.05, 0.95), 4),
      r: roundDec(clamp(finiteOr(ob.r, 0.1), 0.03, 0.35), 4),
    };
  }
  const x0 = roundDec(clamp(finiteOr(ob.x0, 0.3), 0.02, 0.95), 4);
  const y0 = roundDec(clamp(finiteOr(ob.y0, 0.45), 0.02, 0.95), 4);
  const x1 = roundDec(clamp(finiteOr(ob.x1, 0.55), Math.max(0.05, x0 + 0.01), 0.98), 4);
  const y1 = roundDec(clamp(finiteOr(ob.y1, 0.55), Math.max(0.05, y0 + 0.01), 0.98), 4);
  return { type: t, x0, y0, x1, y1 };
}

function sanitizeObstaclesList(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(sanitizeObstacle).filter(Boolean);
}

function unwrapNavPayload(navPayload) {
  if (!navPayload || typeof navPayload !== "object") return null;
  const inner =
    navPayload.payload && typeof navPayload.payload === "object"
      ? navPayload.payload
      : navPayload;
  if (inner.params && typeof inner.params === "object") {
    return {
      ...inner.params,
      _family: inner.family || navPayload.family,
      _obstacles: inner.obstacles ?? navPayload.obstacles,
    };
  }
  return {
    ...inner,
    _family: inner.family || navPayload.family,
    _obstacles: inner.obstacles ?? navPayload.obstacles,
  };
}

function applyIncomingNavPayload(ctx) {
  const np = unwrapNavPayload(ctx.navPayload);
  if (!np) return;
  ctx.navPayload = null;

  const { state } = ctx;
  const m = state.bay04Mode;
  const p = state.s4;
  if (!p) return;

  if (m === "lbm") {
    p.lbmDrawTool = null;
    const incomingObs = Array.isArray(np._obstacles)
      ? np._obstacles
      : Array.isArray(np.obstacles)
      ? np.obstacles
      : null;
    if (incomingObs && incomingObs.length > 0) {
      p.customObstacles = sanitizeObstaclesList(incomingObs);
      p.lbmPreset = "custom";
    } else if (typeof np.preset === "string" && np.preset.trim()) {
      p.lbmPreset = np.preset.trim();
      p.customObstacles = p.lbmPreset === "custom" ? [] : null;
    }
    p.reynolds = clamp(roundDec(finiteOr(np.reynolds, p.reynolds), 0), 25, 160);
    if (Number.isFinite(Number(np.n_steps))) {
      p.nSteps = Math.round(clamp(Number(np.n_steps), 150, 800));
    }
  } else if (m === "jump") {
    p.jumpWidth = clamp(roundDec(finiteOr(np.width, p.jumpWidth), 2), 0.5, 25.0);
    p.jumpV1 = clamp(roundDec(finiteOr(np.v1, p.jumpV1), 2), 0.5, 20.0);
    if ((np.h1 === null || np.h1 === undefined) && Number(np.discharge) > 0) {
      p.jumpH1 = roundDec(Number(np.discharge) / (p.jumpWidth * p.jumpV1), 4);
    } else if (Number(np.h1) > 0) {
      p.jumpH1 = clamp(roundDec(Number(np.h1), 4), 0.05, 5.0);
    }
  } else if (m === "expansion") {
    p.expD1 = clamp(finiteOr(np.D1, p.expD1), 0.02, 2.0);
    p.expD2 = clamp(finiteOr(np.D2, p.expD2), p.expD1 * 1.1, 8.0);
    p.expV1 = clamp(roundDec(finiteOr(np.V1, p.expV1), 1), 0.2, 20.0);
  } else if (m === "tank") {
    p.tankAx = clamp(roundDec(finiteOr(np.ax, p.tankAx), 2), -6.0, 6.0);
    p.tankAz = clamp(roundDec(finiteOr(np.az, p.tankAz), 2), -9.81, 5.0);
  }
}

function pairedFieldHtml({
  idBase,
  paramName,
  label,
  unit,
  min,
  max,
  step,
  value,
  dec = 2,
  fullWidth = false,
}) {
  const numVal = fmt(value, dec);
  return `
    <div class="field-group slider-pair"${fullWidth ? ' style="grid-column: 1 / -1;"' : ""}>
      <div class="slider-label-row">
        <span>${label}</span>
        <span class="slider-input-wrap">
          <input
            type="number"
            class="num-input"
            id="num${idBase}"
            data-param="${paramName}"
            name="${paramName}"
            min="${min}"
            max="${max}"
            step="${step}"
            value="${numVal}"
            aria-label="${label} (${unit})"
          />
          <span class="unit-tag">${unit}</span>
        </span>
      </div>
      <input
        type="range"
        id="rng${idBase}"
        data-param="${paramName}"
        min="${min}"
        max="${max}"
        step="${step}"
        value="${value}"
        aria-label="${label} slider"
      />
    </div>
  `;
}

function bindPairedControl({
  idBase,
  obj,
  key,
  dec = 2,
  clampMin = -Infinity,
  clampMax = Infinity,
  getVal,
  setVal,
  onAfterChange,
}) {
  const rng = document.getElementById(`rng${idBase}`);
  const num = document.getElementById(`num${idBase}`);
  if (!rng || !num) return;

  const readModel = () => (typeof getVal === "function" ? getVal() : obj[key]);
  const writeModel = (v) => {
    if (typeof setVal === "function") setVal(v);
    else obj[key] = v;
  };

  const syncSliderBounds = (val) => {
    const rMin = parseFloat(rng.min);
    const rMax = parseFloat(rng.max);
    if (Number.isFinite(rMin) && val < rMin) rng.min = String(roundDec(val, dec));
    if (Number.isFinite(rMax) && val > rMax) rng.max = String(roundDec(val, dec));
  };

  rng.oninput = (e) => {
    const raw = parseFloat(e.target.value);
    if (!Number.isFinite(raw)) return;
    const val = roundDec(raw, dec);
    writeModel(val);
    num.value = fmt(val, dec);
    onAfterChange?.(val, "range");
  };

  num.oninput = (e) => {
    const raw = parseFloat(e.target.value);
    if (!Number.isFinite(raw)) return;
    const clamped = clamp(raw, clampMin, clampMax);
    writeModel(clamped);
    syncSliderBounds(clamped);
    rng.value = String(clamped);
    onAfterChange?.(clamped, "number-input");
  };

  num.onchange = () => {
    const raw = parseFloat(num.value);
    const cur = readModel();
    const val = Number.isFinite(raw) ? clamp(raw, clampMin, clampMax) : cur;
    const clean = roundDec(val, dec);
    writeModel(clean);
    syncSliderBounds(clean);
    rng.value = String(clean);
    num.value = fmt(clean, dec);
    onAfterChange?.(clean, "number-commit");
  };
}

function syncPairedValues(idBase, val, dec = 2) {
  const rng = document.getElementById(`rng${idBase}`);
  const num = document.getElementById(`num${idBase}`);
  const clean = roundDec(val, dec);
  if (rng) {
    const rMin = parseFloat(rng.min);
    const rMax = parseFloat(rng.max);
    if (Number.isFinite(rMin) && clean < rMin) rng.min = String(clean);
    if (Number.isFinite(rMax) && clean > rMax) rng.max = String(clean);
    rng.value = String(clean);
  }
  if (num) num.value = fmt(clean, dec);
}

function appendFullDiagnosticsDetails(cards = []) {
  const body = document.getElementById("drawerBody");
  if (!body) return;
  const existing = body.querySelector(".diag-details");
  if (existing) existing.remove();
  if (!Array.isArray(cards) || !cards.length) return;

  const details = document.createElement("details");
  details.className = "diag-details";

  const summary = document.createElement("summary");
  summary.textContent = "Full Diagnostics & Formulas";
  details.appendChild(summary);

  const grid = document.createElement("div");
  grid.className = "diag-grid";

  for (const item of cards) {
    const cell = document.createElement("div");
    cell.className = "diag-cell";
    const kEl = document.createElement("div");
    kEl.className = "diag-key";
    kEl.textContent = item.k || "";
    const vEl = document.createElement("div");
    vEl.className = `diag-val ${item.tone || ""}`;
    if (item.tex) {
      renderTex(vEl, item.tex, false);
    } else if (item.html) {
      vEl.innerHTML = item.html;
    } else {
      vEl.textContent = item.v ?? "";
    }
    cell.appendChild(kEl);
    cell.appendChild(vEl);
    grid.appendChild(cell);
  }

  details.appendChild(grid);
  body.appendChild(details);
}

function describeCustomObstacles(obsList, activeTool) {
  const list = Array.isArray(obsList) ? obsList : [];
  const counts = {};
  for (const ob of list) {
    counts[ob.type] = (counts[ob.type] || 0) + 1;
  }
  const summaryParts = Object.entries(counts).map(([k, n]) => `${n} ${k}`);
  const obsSummary =
    obsList === null
      ? "Built-in preset geometry"
      : list.length === 0
      ? "Custom: 0 obstacles (empty channel)"
      : `Custom (${list.length}): ${summaryParts.join(", ")}`;
  if (!activeTool) return obsSummary;
  const toolLabel =
    activeTool === "circle"
      ? "Drawing Circle (drag on tunnel)"
      : activeTool === "rect"
      ? "Drawing Rect (drag on tunnel)"
      : "Drawing Wake Splitter (drag on tunnel)";
  return `${obsSummary} · ${toolLabel}`;
}

export function renderStation04(ctx) {
  const {
    state,
    bus,
    apiPost,
    debouncedRun,
    flowEngine,
    clearSecondaryControls,
    renderRockers,
    refreshAudit,
  } = ctx;

  stopActiveAnimations();
  clearSecondaryControls();
  lastSolvedS4 = { family: null, data: null };

  if (!state.bay04Mode) state.bay04Mode = "lbm"; // lbm | jump | expansion | tank
  if (!state.s4) {
    state.s4 = {
      lbmPreset: "cylinder",
      reynolds: 105.0,
      nSteps: 450,
      customObstacles: null,
      lbmPlotView: "wake",
      lbmScalarMode: "vorticity",
      lbmDrawTool: null,
      lastLbmData: null,
      jumpV1: 6.1,
      jumpH1: 0.305,
      jumpWidth: 6.1,
      jumpPlotView: "es",
      expD1: 0.10,
      expD2: 0.20,
      expV1: 4.0,
      expPlotView: "pressure",
      tankAx: 3.0,
      tankAz: 0.0,
    };
  }

  const p = state.s4;
  p.nSteps = Number.isFinite(Number(p.nSteps)) ? Number(p.nSteps) : 450;
  p.lbmPlotView = p.lbmPlotView === "profile" ? "profile" : "wake";
  p.lbmScalarMode = p.lbmScalarMode === "speed" ? "speed" : "vorticity";
  p.jumpPlotView = p.jumpPlotView === "fs" ? "fs" : "es";
  p.expPlotView = p.expPlotView === "head" ? "head" : "pressure";
  if (p.lbmDrawTool === undefined) p.lbmDrawTool = null;

  applyIncomingNavPayload(ctx);

  const m = state.bay04Mode;
  if (m !== "lbm") {
    p.lbmDrawTool = null;
    flowEngine?.setDrawMode?.(null, null);
  }

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
      <div id="s4Sub"></div>
    </section>
  `;

  const sub = document.getElementById("s4Sub");

  const displayAndAppend = (family, d, options = {}) => {
    lastSolvedS4 = { family, data: d };
    const spec = displaySolvedFamily(family, d, ctx, options);
    appendFullDiagnosticsDetails(spec.deepCards || []);
    return spec;
  };

  const emitSolved = ({ family, subMode, params, obstacles = [], solverData, rawQuery }) => {
    if (!bus || typeof bus.emit !== "function") return;
    const meta = CONSERVATION_META[family] || CONSERVATION_META.lbm_tunnel;
    const cleanObstacles = sanitizeObstaclesList(obstacles);
    bus.emit("solver:updated", {
      bay: "04",
      sub: subMode,
      family,
      payload: { ...params },
      obstacles: cleanObstacles,
      solverData,
      parsedQuery: {
        family,
        confidence: 1.0,
        parser_mode: "live_lab",
        assumptions: { ...state.assumptions },
        params: { ...params },
        obstacles: cleanObstacles,
        concept_twist: meta.concept_twist,
        broken_shortcut: meta.broken_shortcut,
        textbook_ref: meta.textbook_ref,
        unsupported_reason: null,
        raw_query: rawQuery,
      },
    });
  };

  const renderSecondaryControls = () => {
    const slot = document.getElementById("secondaryPlotControls");
    if (!slot) return;

    if (state.bay04Mode === "lbm") {
      slot.innerHTML = `
        <div class="seg-toggle" role="tablist" aria-label="LBM Plot View">
          <button type="button" class="seg-btn ${p.lbmPlotView === "wake" ? "active" : ""}" id="btnLbmWake" role="tab" aria-selected="${p.lbmPlotView === "wake"}">Wake uy(t)</button>
          <button type="button" class="seg-btn ${p.lbmPlotView === "profile" ? "active" : ""}" id="btnLbmProf" role="tab" aria-selected="${p.lbmPlotView === "profile"}">Profile u(y) @ 0.75L</button>
        </div>
      `;
      document.getElementById("btnLbmWake").onclick = () => {
        p.lbmPlotView = "wake";
        renderSecondaryControls();
        if (p.lastLbmData) {
          displayAndAppend("lbm_tunnel", p.lastLbmData, {
            lbmScalarMode: p.lbmScalarMode,
            lbmPlotView: p.lbmPlotView,
          });
        }
      };
      document.getElementById("btnLbmProf").onclick = () => {
        p.lbmPlotView = "profile";
        renderSecondaryControls();
        if (p.lastLbmData) {
          displayAndAppend("lbm_tunnel", p.lastLbmData, {
            lbmScalarMode: p.lbmScalarMode,
            lbmPlotView: p.lbmPlotView,
          });
        }
      };
    } else if (state.bay04Mode === "jump") {
      slot.innerHTML = `
        <div class="seg-toggle" role="tablist" aria-label="Hydraulic Jump Plot View">
          <button type="button" class="seg-btn ${p.jumpPlotView === "es" ? "active" : ""}" id="btnJumpEs" data-jump-plot="es" role="tab" aria-selected="${p.jumpPlotView === "es"}">Specific Energy Es(h)</button>
          <button type="button" class="seg-btn ${p.jumpPlotView === "fs" ? "active" : ""}" id="btnJumpFs" data-jump-plot="fs" role="tab" aria-selected="${p.jumpPlotView === "fs"}">Specific Force Fs(h)</button>
        </div>
      `;
      slot.querySelectorAll("[data-jump-plot]").forEach((btn) => {
        btn.onclick = () => {
          p.jumpPlotView = btn.dataset.jumpPlot === "fs" ? "fs" : "es";
          renderSecondaryControls();
          if (lastSolvedS4.family === "hydraulic_jump" && lastSolvedS4.data) {
            displayAndAppend("hydraulic_jump", lastSolvedS4.data, { jumpPlotView: p.jumpPlotView });
          } else {
            run();
          }
        };
      });
    } else if (state.bay04Mode === "expansion") {
      slot.innerHTML = `
        <div class="seg-toggle" role="tablist" aria-label="Sudden Expansion Plot View">
          <button type="button" class="seg-btn ${p.expPlotView === "pressure" ? "active" : ""}" id="btnExpP" data-exp-plot="pressure" role="tab" aria-selected="${p.expPlotView === "pressure"}">Pressure p(x)</button>
          <button type="button" class="seg-btn ${p.expPlotView === "head" ? "active" : ""}" id="btnExpHead" data-exp-plot="head" role="tab" aria-selected="${p.expPlotView === "head"}">EGL &amp; HGL Head</button>
        </div>
      `;
      slot.querySelectorAll("[data-exp-plot]").forEach((btn) => {
        btn.onclick = () => {
          p.expPlotView = btn.dataset.expPlot === "head" ? "head" : "pressure";
          renderSecondaryControls();
          if (lastSolvedS4.family === "sudden_expansion" && lastSolvedS4.data) {
            displayAndAppend("sudden_expansion", lastSolvedS4.data, { expPlotView: p.expPlotView });
          } else {
            run();
          }
        };
      });
    } else {
      clearSecondaryControls();
    }
  };

  const updateTankEffluxUI = (d) => {
    const gaugeEl = document.getElementById("tankEffluxGauge");
    const seqBtn = document.getElementById("btnFreeFallSeq");
    const inFreeFall = p.tankAz <= -9.75 || (d && Number(d.g_effective) < 0.05);

    if (seqBtn) {
      seqBtn.textContent =
        p.tankAz <= -9.75 ? "Restore Gravity (az = 0)" : "Drop in Free Fall (az = -g)";
    }

    if (!gaugeEl || !d) return;
    const vTrue = Math.max(0, Number(d.orifice_v_true) || 0);
    const vNaive = Math.max(0.01, Number(d.orifice_v_naive_static) || 0);
    const scaleRef = Math.max(vTrue, vNaive, 1.0);
    const pctTrue = inFreeFall ? 0 : clamp((vTrue / scaleRef) * 100, 0, 100);
    const pctNaive = clamp((vNaive / scaleRef) * 100, 0, 100);

    gaugeEl.classList.toggle("is-freefall", inFreeFall);
    gaugeEl.innerHTML = `
      <div class="efflux-gauge-header">
        <span>Orifice Efflux Comparison</span>
        <span class="tag-mono">g_eff = ${fmt(d.g_effective, 2)} m/s²</span>
      </div>
      <div class="efflux-gauge-grid">
        <div class="efflux-card ${inFreeFall ? "efflux-freefall" : "efflux-true"}">
          <span class="efflux-k">True Frame V_exit</span>
          <span class="efflux-v" id="effluxTrueVal">${inFreeFall ? "0.00 m/s · NO LEAK" : `${fmt(vTrue, 2)} m/s`}</span>
          <div class="efflux-meter-track"><div class="efflux-meter-fill" style="width:${pctTrue.toFixed(1)}%;"></div></div>
          <span class="efflux-note">${inFreeFall ? "Free fall (dp/dz = 0) halts draining" : `Tilt θ = ${fmt(d.tilt_deg, 1)}°`}</span>
        </div>
        <div class="efflux-card efflux-naive">
          <span class="efflux-k">Torricelli Naive √(2gh₀)</span>
          <span class="efflux-v" id="effluxNaiveVal">${fmt(vNaive, 2)} m/s</span>
          <div class="efflux-meter-track"><div class="efflux-meter-fill" style="width:${pctNaive.toFixed(1)}%;"></div></div>
          <span class="efflux-note">${inFreeFall ? `Overpredicts by +${fmt(vNaive, 2)} m/s!` : `ΔV = ${fmt(vTrue - vNaive, 2)} m/s`}</span>
        </div>
      </div>
    `;
  };

  const isBayActive = (subMode) =>
    (!state.activeView || state.activeView === "labs") &&
    (!state.activeBay || state.activeBay === "04") &&
    state.bay04Mode === subMode &&
    sub?.isConnected !== false;

  const run = async () => {
    try {
      if (state.bay04Mode === "lbm") {
        const hud = document.getElementById("flowProbeHud");
        if (hud) hud.textContent = "Numba D2Q9 LBM kernel simulating...";

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
        state.assumptionCauses = {
          steady: "∂V/∂t ≠ 0 (shedding)",
          incompressible: "Ma ≪ 0.3",
          irrotational: "Ωz ≠ 0 (viscous wake)",
        };
        renderRockers();
        refreshAudit("ns_x");
        renderSecondaryControls();

        const useCustom = p.lbmPreset === "custom" || Array.isArray(p.customObstacles);
        const effectivePreset = useCustom ? "custom" : p.lbmPreset;
        const effectiveObstacles = useCustom ? sanitizeObstaclesList(p.customObstacles || []) : null;
        if (useCustom && p.lbmPreset !== "custom") p.lbmPreset = "custom";

        const reqPayload = {
          preset: effectivePreset,
          reynolds: p.reynolds,
          n_steps: p.nSteps,
          obstacles: effectiveObstacles,
          ...(useCustom ? { customObstacles: effectiveObstacles } : {}),
        };

        const d = await apiPost("/api/lbm_tunnel", reqPayload, "activeLab");
        if (!isBayActive("lbm")) return;
        p.lastLbmData = d;

        displayAndAppend("lbm_tunnel", d, {
          lbmScalarMode: p.lbmScalarMode,
          lbmPlotView: p.lbmPlotView,
        });
        emitSolved({
          family: "lbm_tunnel",
          subMode: "lbm",
          params: reqPayload,
          obstacles: effectiveObstacles || [],
          solverData: d,
          rawQuery: `2D D2Q9 LBM wind tunnel (${effectivePreset}) Re=${fmt(p.reynolds, 0)}, n_steps=${p.nSteps}, obstacles=${(effectiveObstacles || []).length}`,
        });
      } else if (state.bay04Mode === "jump") {
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
        state.assumptionCauses = {
          steady: "∂V/∂t = 0",
          incompressible: "∇·V = 0.000 s⁻¹",
          irrotational: "Turbulent roller eddy",
        };
        renderRockers();
        refreshAudit("specific_force");
        renderSecondaryControls();

        const reqPayload = { width: p.jumpWidth, v1: p.jumpV1, h1: p.jumpH1 };
        const d = await apiPost("/api/hydraulic_jump", reqPayload, "activeLab");
        if (!isBayActive("jump")) return;

        displayAndAppend("hydraulic_jump", d, { jumpPlotView: p.jumpPlotView });
        emitSolved({
          family: "hydraulic_jump",
          subMode: "jump",
          params: reqPayload,
          solverData: d,
          rawQuery: `Hydraulic jump width=${fmt(p.jumpWidth, 2)} m, V1=${fmt(p.jumpV1, 2)} m/s, h1=${fmt(p.jumpH1, 3)} m`,
        });
      } else if (state.bay04Mode === "expansion") {
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
        state.assumptionCauses = {
          steady: "∂V/∂t = 0",
          incompressible: "∇·V = 0.000 s⁻¹",
          irrotational: "Corner shear eddy",
        };
        renderRockers();
        refreshAudit("specific_force");
        renderSecondaryControls();

        const reqPayload = { D1: p.expD1, D2: p.expD2, V1: p.expV1 };
        const d = await apiPost("/api/sudden_expansion", reqPayload, "activeLab");
        if (!isBayActive("expansion")) return;

        displayAndAppend("sudden_expansion", d, { expPlotView: p.expPlotView });
        emitSolved({
          family: "sudden_expansion",
          subMode: "expansion",
          params: reqPayload,
          solverData: d,
          rawQuery: `Sudden pipe expansion D1=${fmt(p.expD1, 3)} m to D2=${fmt(p.expD2, 3)} m at V1=${fmt(p.expV1, 2)} m/s`,
        });
      } else {
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
        state.assumptionCauses = {
          steady: "∂V/∂t = 0 (tank frame)",
          incompressible: "∇·V = 0.000 s⁻¹",
          irrotational: "Rigid tank body",
        };
        renderRockers();
        refreshAudit("frame_g_eff");
        clearSecondaryControls();

        const reqPayload = { ax: p.tankAx, az: p.tankAz };
        const d = await apiPost("/api/accel_tank", reqPayload, "activeLab");
        if (!isBayActive("tank")) return;

        displayAndAppend("accelerating_tank", d);
        updateTankEffluxUI(d);
        emitSolved({
          family: "accelerating_tank",
          subMode: "tank",
          params: reqPayload,
          solverData: d,
          rawQuery: `Accelerating tank frame ax=${fmt(p.tankAx, 2)} m/s^2, az=${fmt(p.tankAz, 2)} m/s^2`,
        });
      }
    } catch (err) {
      if (err?.name === "AbortError") return;
      const hud = document.getElementById("flowProbeHud");
      if (hud) hud.textContent = `Solver error: ${err.message}`;
    }
  };

  if (m === "lbm") {
    const syncLbmToolbarUI = () => {
      const sel = document.getElementById("selLbm");
      if (sel) sel.value = p.lbmPreset;

      sub.querySelectorAll("[data-lbm-tool]").forEach((btn) => {
        const active = btn.dataset.lbmTool === p.lbmDrawTool;
        btn.classList.toggle("active", active);
        btn.setAttribute("aria-pressed", String(active));
      });

      const badge = document.getElementById("lbmObstacleStatus");
      if (badge) {
        badge.textContent = describeCustomObstacles(p.customObstacles, p.lbmDrawTool);
        badge.classList.toggle("is-drawing", Boolean(p.lbmDrawTool));
        badge.classList.toggle(
          "is-empty",
          !p.lbmDrawTool && (!Array.isArray(p.customObstacles) || p.customObstacles.length === 0)
        );
      }

      sub.querySelectorAll("[data-lbm-steps]").forEach((btn) => {
        const active = Number(btn.dataset.lbmSteps) === Number(p.nSteps);
        btn.classList.toggle("active", active);
        btn.setAttribute("aria-selected", String(active));
      });

      sub.querySelectorAll("[data-lbm-scalar]").forEach((btn) => {
        const active = btn.dataset.lbmScalar === p.lbmScalarMode;
        btn.classList.toggle("active", active);
        btn.setAttribute("aria-selected", String(active));
      });

      const runBtn = document.getElementById("btnRunLbm");
      if (runBtn) runBtn.textContent = `Run ${p.nSteps} LBM Steps`;
    };

    const handleObstacleAdded = (rawPrimitive) => {
      const clean = sanitizeObstacle(rawPrimitive);
      if (!clean) return;
      p.customObstacles = [...(Array.isArray(p.customObstacles) ? p.customObstacles : []), clean];
      p.lbmPreset = "custom";
      syncLbmToolbarUI();
      run();
    };

    sub.innerHTML = `
      <div class="field-group">
        <div class="field-label-row"><span>Wind-Tunnel Geometry</span></div>
        <select class="select-input" id="selLbm" aria-label="Wind-Tunnel Geometry Preset">
          <option value="cylinder" ${p.lbmPreset === "cylinder" ? "selected" : ""}>Circular Cylinder (K&aacute;rm&aacute;n Wake)</option>
          <option value="cylinder_splitter" ${p.lbmPreset === "cylinder_splitter" ? "selected" : ""}>Cylinder + Wake Splitter Plate</option>
          <option value="backward_step" ${p.lbmPreset === "backward_step" ? "selected" : ""}>Backward-Facing Step Recirculation</option>
          <option value="tandem_cylinders" ${p.lbmPreset === "tandem_cylinders" ? "selected" : ""}>Tandem Dual Cylinders</option>
          <option value="custom" ${p.lbmPreset === "custom" ? "selected" : ""}>Custom Drawn Obstacles</option>
        </select>
      </div>

      <div class="lbm-toolbar-wrap" style="margin-top:8px;">
        <div class="lbm-status-row">
          <span>Interactive Canvas Draw Tools</span>
          <span class="lbm-badge" id="lbmObstacleStatus"></span>
        </div>
        <div class="lbm-draw-bar" role="group" aria-label="LBM Obstacle Drawing Tools">
          <button type="button" class="draw-tool-btn" id="btnDrawCircle" data-lbm-tool="circle">Draw Circle</button>
          <button type="button" class="draw-tool-btn" id="btnDrawRect" data-lbm-tool="rect">Draw Rect</button>
          <button type="button" class="draw-tool-btn" id="btnDrawSplitter" data-lbm-tool="splitter">Add Wake Splitter</button>
          <button type="button" class="draw-tool-btn draw-tool-clear" id="btnClearObstacles">Clear Obstacles</button>
        </div>
      </div>

      <div style="margin-top:8px;">
        ${pairedFieldHtml({
          idBase: "Re",
          paramName: "reynolds",
          label: "Reynolds Number Re",
          unit: "Re",
          min: 25,
          max: 160,
          step: 5,
          value: p.reynolds,
          dec: 0,
          fullWidth: true,
        })}
      </div>

      <div class="lbm-step-bar" style="margin-top:8px;">
        <div class="field-label-row"><span>Simulation Step Scrubber</span></div>
        <div class="seg-toggle seg-toggle-full" role="tablist" aria-label="LBM Step Count">
          <button type="button" class="seg-btn" data-lbm-steps="200" role="tab">200 Fast</button>
          <button type="button" class="seg-btn" data-lbm-steps="450" role="tab">450 Standard</button>
          <button type="button" class="seg-btn" data-lbm-steps="700" role="tab">700 Developed</button>
        </div>
      </div>

      <div class="lbm-step-bar" style="margin-top:8px;">
        <div class="field-label-row"><span>Colormap Scalar Field</span></div>
        <div class="seg-toggle seg-toggle-full" role="tablist" aria-label="LBM Field Colormap Mode">
          <button type="button" class="seg-btn" data-lbm-scalar="vorticity" role="tab">Diverging Vorticity &Omega;z</button>
          <button type="button" class="seg-btn" data-lbm-scalar="speed" role="tab">Velocity |V|</button>
        </div>
      </div>

      <button type="button" class="btn-machined btn-primary" id="btnRunLbm" style="width:100%;margin-top:10px;">Run ${p.nSteps} LBM Steps</button>
    `;

    syncLbmToolbarUI();
    flowEngine?.setDrawMode?.(p.lbmDrawTool, p.lbmDrawTool ? handleObstacleAdded : null);

    document.getElementById("selLbm").onchange = (e) => {
      const next = e.target.value;
      p.lbmPreset = next;
      if (next === "custom") {
        p.customObstacles = Array.isArray(p.customObstacles) ? p.customObstacles : [];
      } else {
        p.customObstacles = null;
        p.lbmDrawTool = null;
        flowEngine?.setDrawMode?.(null, null);
      }
      syncLbmToolbarUI();
      run();
    };

    sub.querySelectorAll("[data-lbm-tool]").forEach((btn) => {
      btn.onclick = () => {
        const tool = btn.dataset.lbmTool;
        p.lbmDrawTool = p.lbmDrawTool === tool ? null : tool;
        flowEngine?.setDrawMode?.(p.lbmDrawTool, p.lbmDrawTool ? handleObstacleAdded : null);
        syncLbmToolbarUI();
      };
    });

    document.getElementById("btnClearObstacles").onclick = () => {
      p.customObstacles = [];
      p.lbmPreset = "custom";
      p.lbmDrawTool = null;
      flowEngine?.setDrawMode?.(null, null);
      syncLbmToolbarUI();
      run();
    };

    sub.querySelectorAll("[data-lbm-steps]").forEach((btn) => {
      btn.onclick = () => {
        p.nSteps = Number(btn.dataset.lbmSteps) || 450;
        syncLbmToolbarUI();
        run();
      };
    });

    sub.querySelectorAll("[data-lbm-scalar]").forEach((btn) => {
      btn.onclick = () => {
        p.lbmScalarMode = btn.dataset.lbmScalar === "speed" ? "speed" : "vorticity";
        syncLbmToolbarUI();
        if (p.lastLbmData) {
          displayAndAppend("lbm_tunnel", p.lastLbmData, {
            lbmScalarMode: p.lbmScalarMode,
            lbmPlotView: p.lbmPlotView,
          });
          renderSecondaryControls();
        }
      };
    });

    bindPairedControl({
      idBase: "Re",
      obj: p,
      key: "reynolds",
      dec: 0,
      clampMin: 15,
      clampMax: 180,
      onAfterChange: (_val, src) => {
        if (src === "number-commit") run();
        else debouncedRun("bay04_lbm", run, 200);
      },
    });
    document.getElementById("rngRe").onchange = run;
    document.getElementById("btnRunLbm").onclick = run;
  } else if (m === "jump") {
    sub.innerHTML = `
      <div class="preset-row" style="margin-bottom:8px;">
        <button type="button" class="btn-machined" id="preEx1211">Ex 12.11 (Fr&#8321;=3.53)</button>
        <button type="button" class="btn-machined" id="preEx1212">Ex 12.12 (Fr&#8321;=2.15)</button>
      </div>
      <div class="grid-2">
        ${pairedFieldHtml({
          idBase: "J1",
          paramName: "v1",
          label: "Inlet V₁",
          unit: "m/s",
          min: 2.0,
          max: 10.0,
          step: 0.1,
          value: p.jumpV1,
          dec: 2,
        })}
        ${pairedFieldHtml({
          idBase: "H1",
          paramName: "h1",
          label: "Depth h₁",
          unit: "m",
          min: 0.15,
          max: 0.80,
          step: 0.01,
          value: p.jumpH1,
          dec: 3,
        })}
        ${pairedFieldHtml({
          idBase: "Jw",
          paramName: "width",
          label: "Apron Width b",
          unit: "m",
          min: 1.0,
          max: 12.0,
          step: 0.1,
          value: p.jumpWidth,
          dec: 2,
          fullWidth: true,
        })}
      </div>
    `;
    const scheduleJump = () => debouncedRun("bay04", run, 65);
    bindPairedControl({
      idBase: "J1",
      obj: p,
      key: "jumpV1",
      dec: 2,
      clampMin: 0.5,
      clampMax: 25.0,
      onAfterChange: scheduleJump,
    });
    bindPairedControl({
      idBase: "H1",
      obj: p,
      key: "jumpH1",
      dec: 3,
      clampMin: 0.05,
      clampMax: 5.0,
      onAfterChange: scheduleJump,
    });
    bindPairedControl({
      idBase: "Jw",
      obj: p,
      key: "jumpWidth",
      dec: 2,
      clampMin: 0.5,
      clampMax: 30.0,
      onAfterChange: scheduleJump,
    });
    document.getElementById("preEx1211").onclick = () => {
      p.jumpV1 = 6.1;
      p.jumpH1 = 0.3042;
      p.jumpWidth = 6.1;
      syncPairedValues("J1", p.jumpV1, 2);
      syncPairedValues("H1", p.jumpH1, 3);
      syncPairedValues("Jw", p.jumpWidth, 2);
      run();
    };
    document.getElementById("preEx1212").onclick = () => {
      p.jumpV1 = 4.14;
      p.jumpH1 = 0.379;
      p.jumpWidth = 3.5;
      syncPairedValues("J1", p.jumpV1, 2);
      syncPairedValues("H1", p.jumpH1, 3);
      syncPairedValues("Jw", p.jumpWidth, 2);
      run();
    };
  } else if (m === "expansion") {
    const ratioVal = roundDec(p.expD2 / Math.max(p.expD1, 1e-6), 2);
    sub.innerHTML = `
      <div class="preset-row" style="margin-bottom:8px;">
        <button type="button" class="btn-machined" id="preExpDefault">Ex. 11.5 (D₂/D₁=2.0, V₁=4.0)</button>
        <button type="button" class="btn-machined" id="preExpWide">Wide Step (D₂/D₁=3.0)</button>
      </div>
      <div class="grid-2">
        ${pairedFieldHtml({
          idBase: "ExpR",
          paramName: "diameter_ratio",
          label: "D₂ / D₁ Ratio",
          unit: "ratio",
          min: 1.2,
          max: 4.0,
          step: 0.1,
          value: ratioVal,
          dec: 2,
        })}
        ${pairedFieldHtml({
          idBase: "ExpV",
          paramName: "V1",
          label: "Inlet V₁",
          unit: "m/s",
          min: 1.0,
          max: 8.0,
          step: 0.2,
          value: p.expV1,
          dec: 1,
        })}
      </div>
    `;
    const scheduleExp = () => debouncedRun("bay04", run, 65);
    bindPairedControl({
      idBase: "ExpR",
      obj: p,
      key: "expD2",
      dec: 2,
      clampMin: 1.1,
      clampMax: 6.0,
      getVal: () => roundDec(p.expD2 / Math.max(p.expD1, 1e-6), 2),
      setVal: (r) => {
        p.expD2 = roundDec(p.expD1 * r, 4);
      },
      onAfterChange: scheduleExp,
    });
    bindPairedControl({
      idBase: "ExpV",
      obj: p,
      key: "expV1",
      dec: 1,
      clampMin: 0.2,
      clampMax: 20.0,
      onAfterChange: scheduleExp,
    });
    document.getElementById("preExpDefault").onclick = () => {
      p.expD1 = 0.10;
      p.expD2 = 0.20;
      p.expV1 = 4.0;
      syncPairedValues("ExpR", 2.0, 2);
      syncPairedValues("ExpV", 4.0, 1);
      run();
    };
    document.getElementById("preExpWide").onclick = () => {
      p.expD1 = 0.10;
      p.expD2 = 0.30;
      syncPairedValues("ExpR", 3.0, 2);
      run();
    };
  } else {
    sub.innerHTML = `
      <div class="preset-row" style="margin-bottom:8px;">
        <button type="button" class="btn-machined" id="preTilt">Horiz Accel (3 m/s&sup2;)</button>
        <button type="button" class="btn-machined" id="preStaticTank">Static (ax=0, az=0)</button>
        <button type="button" class="btn-machined btn-primary" id="btnFreeFallSeq" style="width:100%;">
          ${p.tankAz <= -9.75 ? "Restore Gravity (az = 0)" : "Drop in Free Fall (az = -g)"}
        </button>
      </div>
      <div class="grid-2">
        ${pairedFieldHtml({
          idBase: "Ax",
          paramName: "ax",
          label: "Horizontal ax",
          unit: "m/s²",
          min: -6.0,
          max: 6.0,
          step: 0.25,
          value: p.tankAx,
          dec: 2,
        })}
        ${pairedFieldHtml({
          idBase: "Az",
          paramName: "az",
          label: "Vertical az",
          unit: "m/s²",
          min: -9.81,
          max: 5.0,
          step: 0.25,
          value: p.tankAz,
          dec: 2,
        })}
      </div>
      <div class="efflux-gauge" id="tankEffluxGauge" style="margin-top:8px;"></div>
    `;

    const scheduleTank = () => {
      stopActiveAnimations();
      debouncedRun("bay04", run, 65);
    };
    bindPairedControl({
      idBase: "Ax",
      obj: p,
      key: "tankAx",
      dec: 2,
      clampMin: -15.0,
      clampMax: 15.0,
      onAfterChange: scheduleTank,
    });
    bindPairedControl({
      idBase: "Az",
      obj: p,
      key: "tankAz",
      dec: 2,
      clampMin: -9.81,
      clampMax: 15.0,
      onAfterChange: scheduleTank,
    });

    document.getElementById("preTilt").onclick = () => {
      stopActiveAnimations();
      p.tankAx = 3.0;
      p.tankAz = 0.0;
      syncPairedValues("Ax", p.tankAx, 2);
      syncPairedValues("Az", p.tankAz, 2);
      run();
    };
    document.getElementById("preStaticTank").onclick = () => {
      stopActiveAnimations();
      p.tankAx = 0.0;
      p.tankAz = 0.0;
      syncPairedValues("Ax", p.tankAx, 2);
      syncPairedValues("Az", p.tankAz, 2);
      run();
    };

    const ffBtn = document.getElementById("btnFreeFallSeq");
    ffBtn.onclick = async () => {
      const targetAz = p.tankAz <= -9.75 ? 0.0 : -9.81;
      const startAz = finiteOr(p.tankAz, 0.0);
      const token = ++activeAnimToken;

      if (prefersReducedMotion()) {
        p.tankAz = targetAz;
        syncPairedValues("Az", p.tankAz, 2);
        await run();
        return;
      }

      const steps = 10;
      for (let i = 1; i <= steps; i++) {
        if (token !== activeAnimToken || ffBtn.isConnected === false || !isBayActive("tank")) {
          return;
        }
        const frac = i / steps;
        const eased = frac < 0.5 ? 2 * frac * frac : 1 - Math.pow(-2 * frac + 2, 2) / 2;
        p.tankAz = i === steps ? targetAz : roundDec(startAz + (targetAz - startAz) * eased, 2);
        syncPairedValues("Az", p.tankAz, 2);
        await run();
        if (token !== activeAnimToken || ffBtn.isConnected === false || !isBayActive("tank")) return;
        if (i < steps) {
          await new Promise((r) => setTimeout(r, 75));
        }
      }
    };
  }

  run();
}
