/**
 * CAD-Style Interactive Homework Assignment Workspace (HW 1–7).
 * Accessed exclusively from the left Workspace Views sidebar entry.
 */
import { HOMEWORK_SPECS, buildSolutionSteps } from "../data/assignment_hw_specs.js";
import {
  computeAssignmentSim,
  renderAssignmentAnimCanvas,
  renderAssignmentPlotCanvas,
} from "../components/assignment_engine.js?v=3";
import { loadLLMConfig } from "../core/store.js";
import { fmtNum } from "../core/color_scales.js";
import { renderTex, formatRichText, formatInlineRichText } from "../math_ui.js";

let _hostEl = null;
let _rafId = null;
let _resizeObs = null;
let _lastFrameTs = 0;

const _ws = {
  hwId: "hw1",
  subpartId: "a",
  inspectorTab: "params", // "params" | "question" | "solution"
  plotTab: "primary",
  showAllSubparts: false,
  playing: true,
  speed: 1.0,
  animTime: 0.0,
  hoverPx: null,
  valuesByHw: {},
  customKinByHw: {},
  customOverrideByHw: {},
  deriveBusy: false,
  deriveStatus: "",
};

function getHwSpec(hwId = _ws.hwId) {
  return HOMEWORK_SPECS.find((h) => h.id === hwId) || HOMEWORK_SPECS[0];
}

function getDefaultValues(hw) {
  const out = {};
  (hw.params || []).forEach((p) => {
    out[p.key] = p.def;
  });
  if (hw.defaultEquations) {
    out.u_str = hw.defaultEquations.u_str;
    out.v_str = hw.defaultEquations.v_str;
  }
  return out;
}

function getValues(hw = getHwSpec()) {
  if (!_ws.valuesByHw[hw.id]) {
    _ws.valuesByHw[hw.id] = getDefaultValues(hw);
  }
  return _ws.valuesByHw[hw.id];
}

function getVisibleSubparts(hw, v) {
  if (!hw.sections) return hw.subparts;
  const activeSec = v.section || hw.sections[0].id;
  return hw.subparts.filter((sp) => sp.section === activeSec);
}

function ensureValidSelection(hw) {
  const v = getValues(hw);
  const subparts = getVisibleSubparts(hw, v);
  if (!subparts.some((s) => s.id === _ws.subpartId)) {
    _ws.subpartId = subparts[0]?.id || hw.subparts[0].id;
  }
  if (!hw.plotTabs.some((t) => t.id === _ws.plotTab)) {
    _ws.plotTab = hw.plotTabs[0]?.id || "primary";
  }
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function syncCanvasDpr(canvas) {
  if (!canvas) return { w: 0, h: 0 };
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(200, Math.round(rect.width));
  const h = Math.max(140, Math.round(rect.height));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const pw = Math.round(w * dpr);
  const ph = Math.round(h * dpr);
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w, h, ctx };
}

function paintCanvases(hw, v, sim) {
  const animCanvas = _hostEl?.querySelector("#assignAnimCanvas");
  const plotCanvas = _hostEl?.querySelector("#assignPlotCanvas");
  const hoverEl = _hostEl?.querySelector("#assignHoverReadout");
  const timeEl = _hostEl?.querySelector("#assignTimeClock");
  const scrubEl = _hostEl?.querySelector("#assignTimeScrub");

  if (animCanvas) {
    const { w, h, ctx } = syncCanvasDpr(animCanvas);
    if (ctx) {
      const hoverMsg = renderAssignmentAnimCanvas(
        ctx,
        w,
        h,
        hw.id,
        v,
        sim,
        _ws.animTime,
        _ws.hoverPx
      );
      if (hoverEl) {
        hoverEl.textContent = hoverMsg || "Hover viewport to inspect local velocity / pressure / thickness";
      }
    }
  }

  if (plotCanvas) {
    const { w, h, ctx } = syncCanvasDpr(plotCanvas);
    if (ctx) {
      renderAssignmentPlotCanvas(ctx, w, h, hw.id, v, sim, _ws.plotTab);
    }
  }

  const cycle = Math.max(sim?.tEnd || 4.0, 1.5);
  const loopT = _ws.animTime % cycle;
  if (timeEl) timeEl.textContent = `t = ${fmtNum(loopT, 2)} / ${fmtNum(cycle, 2)} s`;
  if (scrubEl && document.activeElement !== scrubEl) {
    scrubEl.value = String((loopT / cycle) * 100);
  }
}

function renderInspectorBody(hw, v, sim) {
  const bodyEl = _hostEl?.querySelector("#assignInspectorBody");
  if (!bodyEl) return;

  if (_ws.inspectorTab === "params") {
    const visParams = (hw.params || []).filter(
      (p) => !p.section || p.section === v.section
    );
    const customBox = hw.supportsCustomEquations
      ? `<div class="assign-custom-eq-card">
           <div class="assign-subhdr">
             <span>Custom Velocity Field $u(x,y,t), v(x,y,t)$</span>
             <span class="badge">${_ws.customKinByHw[hw.id] ? "SymPy Active" : "Exact Analytical"}</span>
           </div>
           <div class="assign-eq-inputs">
             <label><span>u(x,y,t) =</span><input id="assignInputU" type="text" value="${escapeHtml(v.u_str ?? hw.defaultEquations.u_str)}" /></label>
             <label><span>v(x,y,t) =</span><input id="assignInputV" type="text" value="${escapeHtml(v.v_str ?? hw.defaultEquations.v_str)}" /></label>
           </div>
           <div class="assign-eq-actions">
             <button type="button" class="btn btn-primary btn-xs" id="assignApplyEqBtn" ${_ws.deriveBusy ? "disabled" : ""}>Apply Equations (SymPy)</button>
             <button type="button" class="btn btn-outline btn-xs" id="assignResetEqBtn">Reset u, v</button>
           </div>
           ${_ws.deriveStatus ? `<div class="assign-derive-msg">${escapeHtml(_ws.deriveStatus)}</div>` : ""}
         </div>`
      : "";

    const presetsHtml = (hw.presets || []).length
      ? `<div class="assign-presets-block">
           <div class="assign-subhdr"><span>Regime Presets</span></div>
           <div class="assign-preset-chips">
             ${hw.presets
               .map(
                 (pr, idx) =>
                   `<button type="button" class="assign-chip" data-assign-preset="${idx}">${escapeHtml(pr.label)}</button>`
               )
               .join("")}
           </div>
         </div>`
      : "";

    const paramsHtml = visParams
      .map((p) => {
        const cur = v[p.key];
        if (p.type === "toggle") {
          return `<label class="assign-param-toggle">
            <span>${escapeHtml(p.label)}</span>
            <input type="checkbox" data-assign-param="${p.key}" ${cur ? "checked" : ""} />
          </label>`;
        }
        if (p.type === "select") {
          return `<div class="assign-param-row">
            <div class="assign-param-top"><span>${escapeHtml(p.label)}</span></div>
            <select data-assign-param="${p.key}" class="assign-select">
              ${p.options
                .map(
                  (o) =>
                    `<option value="${escapeHtml(o.value)}" ${cur === o.value ? "selected" : ""}>${escapeHtml(o.label)}</option>`
                )
                .join("")}
            </select>
          </div>`;
        }
        return `<div class="assign-param-row">
          <div class="assign-param-top">
            <span>${escapeHtml(p.label)}</span>
            <strong class="assign-param-val">${fmtNum(cur, p.step < 0.01 ? 4 : p.step < 0.1 ? 2 : 1)} ${escapeHtml(p.unit || "")}</strong>
          </div>
          <input type="range" data-assign-param="${p.key}" min="${p.min}" max="${p.max}" step="${p.step}" value="${cur}" />
        </div>`;
      })
      .join("");

    bodyEl.innerHTML = `${presetsHtml}${customBox}<div class="assign-param-list">${paramsHtml}</div>`;
    formatInlineRichText && bodyEl.querySelectorAll(".assign-subhdr span:first-child").forEach((el) => {
      el.innerHTML = formatInlineRichText(el.textContent);
    });
  } else if (_ws.inspectorTab === "question") {
    const visibleSubs = getVisibleSubparts(hw, v);
    const itemsHtml = visibleSubs
      .map((sp) => {
        const active = sp.id === _ws.subpartId ? "active" : "";
        return `<div class="assign-q-subpart ${active}" data-assign-subpart="${escapeHtml(sp.id)}">
          <div class="assign-q-subhdr">
            <strong>${escapeHtml(sp.label)}</strong>
            <button type="button" class="btn btn-outline btn-xs" data-jump-sol="${escapeHtml(sp.id)}">View Solution →</button>
          </div>
          <div class="assign-q-prompt">${formatInlineRichText(sp.prompt)}</div>
        </div>`;
      })
      .join("");

    bodyEl.innerHTML = `
      <div class="assign-statement-card">
        <div class="assign-subhdr"><span>Problem Statement · ${escapeHtml(hw.code)}</span></div>
        <div class="assign-statement-body">${formatRichText(hw.statementHtml)}</div>
      </div>
      <div class="assign-subparts-col">${itemsHtml}</div>
    `;
  } else {
    // Step-by-Step Solution Tab
    const customOverride = _ws.customOverrideByHw[hw.id] || null;
    const stepsMap = buildSolutionSteps(hw.id, v, sim, customOverride);
    const visibleSubs = getVisibleSubparts(hw, v);
    const targetSubs = _ws.showAllSubparts
      ? visibleSubs
      : visibleSubs.filter((s) => s.id === _ws.subpartId);

    const cfg = loadLLMConfig();
    const hasAiKey = Boolean(cfg?.apiKey && String(cfg.apiKey).trim());

    const headerControls = `
      <div class="assign-sol-toolbar">
        <button type="button" class="btn btn-primary btn-xs" id="assignAiDeriveBtn" ${_ws.deriveBusy ? "disabled" : ""}>
          ${_ws.deriveBusy ? "Deriving..." : "Re-Derive Steps (Gemini AI)"}
        </button>
        <label class="assign-all-chk">
          <input type="checkbox" id="assignShowAllChk" ${_ws.showAllSubparts ? "checked" : ""} />
          <span>Show all subparts</span>
        </label>
        <button type="button" class="btn btn-outline btn-xs" id="assignCfgKeyBtn">
          ${hasAiKey ? "Gemini Key ✓" : "Set API Key"}
        </button>
      </div>
      ${_ws.deriveStatus ? `<div class="assign-derive-msg">${escapeHtml(_ws.deriveStatus)}</div>` : ""}
    `;

    const blocksHtml = targetSubs
      .map((sp) => {
        const list = stepsMap[sp.id] || [];
        const cards = list
          .map(
            (st, idx) => `
          <div class="assign-step-card">
            <div class="assign-step-title">${idx + 1}. ${formatInlineRichText(st.title || "")}</div>
            <div class="assign-step-expl">${formatInlineRichText(st.explanation || "")}</div>
            <div class="assign-step-tex" data-tex="${escapeHtml(st.equation_tex || "")}"></div>
          </div>`
          )
          .join("");
        return `<div class="assign-sol-group">
          <div class="assign-subhdr"><span>${escapeHtml(sp.label)}</span></div>
          ${cards || '<div class="assign-empty">No steps recorded for this subpart.</div>'}
        </div>`;
      })
      .join("");

    bodyEl.innerHTML = `${headerControls}<div class="assign-sol-list">${blocksHtml}</div>`;
    bodyEl.querySelectorAll(".assign-step-tex[data-tex]").forEach((el) => {
      const tex = el.getAttribute("data-tex") || "";
      if (tex) renderTex(el, tex, true);
    });
  }
}

function buildSummaryForAi(hw, v, sim) {
  if (hw.id === "hw3") {
    return {
      ratio_A: v.ratio_A,
      h0_over_sqrtA: v.h0_over_sqrtA,
      mu: v.mu,
      tT_sec: Number(sim.tT?.toFixed(3)),
      t_ideal_over_tT: Number(sim.t_ideal_ratio?.toFixed(4)),
      t_visc_over_tT: Number(sim.t_visc_ratio?.toFixed(4)),
    };
  }
  if (hw.id === "hw4") {
    return {
      section: v.section,
      te_cone_s: Number(sim.teCone?.toFixed(3)),
      te_cyl_s: Number(sim.teCyl?.toFixed(3)),
      tau_sphere_s: Number(sim.tau?.toFixed(3)),
      V_sphere_m3: Number(sim.V_sph?.toFixed(4)),
    };
  }
  if (hw.id === "hw5") {
    return {
      kappa: v.kappa,
      R1: v.R1,
      omega1: v.omega1,
      mu: v.mu,
      dp_norm_max: Number(sim.dp_norm_max?.toFixed(4)),
    };
  }
  if (hw.id === "hw6") {
    return {
      alpha: v.alpha,
      n_terms: v.n_terms,
      W_center: Number(sim.w_center?.toFixed(4)),
      poiseuille_deviation_pct: Number(sim.dev_pct?.toFixed(2)),
    };
  }
  if (hw.id === "hw7") {
    return {
      bounded: !!v.bounded,
      U: v.U,
      nu_m2_s: sim.nu,
      t_cur_s: v.t_cur,
      H_mm: v.H_mm,
      delta99_mm: Number(sim.delta99MM?.toFixed(2)),
    };
  }
  return v;
}

async function runDeriveRequest({ useAi }) {
  const hw = getHwSpec();
  const v = getValues(hw);
  const sim = computeAssignmentSim(hw.id, v, _ws.customKinByHw[hw.id]);

  // If custom equations match HW 1/2 defaults cleanly and useAi is false, restore built-in analytic mode
  if (
    !useAi &&
    hw.defaultEquations &&
    (v.u_str || "").trim() === hw.defaultEquations.u_str &&
    (v.v_str || "").trim() === hw.defaultEquations.v_str
  ) {
    delete _ws.customKinByHw[hw.id];
    delete _ws.customOverrideByHw[hw.id];
    _ws.deriveStatus = "Restored exact analytical solution for default equations.";
    refreshDynamicPanels();
    return;
  }

  _ws.deriveBusy = true;
  _ws.deriveStatus = useAi
    ? "Querying Gemini AI grounded in exact SymPy/numerical outputs..."
    : "Solving velocity expressions via SymPy & SciPy...";
  refreshInspectorOnly();

  try {
    const cfg = loadLLMConfig();
    const res = await fetch("/api/assignment/derive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hw_id: hw.id,
        topic: hw.topic,
        subpart: _ws.subpartId,
        u_str: v.u_str || "",
        v_str: v.v_str || "",
        params: v,
        computed_summary: buildSummaryForAi(hw, v, sim),
        use_ai: Boolean(useAi),
        llm_config: {
          provider: cfg?.provider || (cfg?.apiKey ? "gemini" : "offline"),
          api_key: cfg?.apiKey || "",
          model: cfg?.model || "gemini-2.5-flash",
          base_url: cfg?.baseUrl || "https://api.openai.com/v1",
        },
      }),
    });
    const payload = await res.json();
    const data = payload?.data || payload;
    if (!res.ok || payload?.ok === false || payload?.error) {
      _ws.deriveStatus = `Derivation notice: ${payload?.error || res.statusText}`;
    } else {
      if (data?.kin_data) {
        _ws.customKinByHw[hw.id] = data;
      }
      if (data?.steps_by_subpart) {
        _ws.customOverrideByHw[hw.id] = data;
      } else if (Array.isArray(data?.steps) && data.steps.length > 0) {
        const merged = { ...buildSolutionSteps(hw.id, v, sim) };
        merged[_ws.subpartId] = data.steps;
        _ws.customOverrideByHw[hw.id] = {
          steps_by_subpart: merged,
          provider_used: data.provider_used,
        };
      }
      _ws.deriveStatus =
        data?.provider_used === "gemini"
          ? "Gemini AI steps synchronized with verified SymPy / numerical outputs."
          : data?.note
            ? `Verified solver (${data.note})`
            : "SymPy symbolic steps & SciPy trajectories updated.";
    }
  } catch (err) {
    _ws.deriveStatus = `Server request failed: ${err.message}`;
  } finally {
    _ws.deriveBusy = false;
    refreshDynamicPanels();
  }
}

function refreshInspectorOnly() {
  const hw = getHwSpec();
  const v = getValues(hw);
  const sim = computeAssignmentSim(hw.id, v, _ws.customKinByHw[hw.id]);
  renderInspectorBody(hw, v, sim);
}

function refreshDynamicPanels() {
  const hw = getHwSpec();
  ensureValidSelection(hw);
  const v = getValues(hw);
  const sim = computeAssignmentSim(hw.id, v, _ws.customKinByHw[hw.id]);
  renderInspectorBody(hw, v, sim);
  try {
    paintCanvases(hw, v, sim);
  } catch (err) {
    console.error("Assignment canvas render error:", err);
  }
}

function rebuildFullShell() {
  if (!_hostEl) return;
  const hw = getHwSpec();
  ensureValidSelection(hw);
  const v = getValues(hw);
  const visibleSubs = getVisibleSubparts(hw, v);
  const sim = computeAssignmentSim(hw.id, v, _ws.customKinByHw[hw.id]);

  const hwListHtml = HOMEWORK_SPECS.map((item) => {
    const isActive = item.id === hw.id;
    const itemSubs = isActive ? getVisibleSubparts(item, v) : [];
    const sectionsHtml =
      isActive && item.sections
        ? `<div class="assign-hw-sections">
            ${item.sections
              .map(
                (sec) =>
                  `<button type="button" class="assign-sec-btn ${v.section === sec.id ? "active" : ""}" data-assign-section="${sec.id}">${escapeHtml(sec.label)}</button>`
              )
              .join("")}
          </div>`
        : "";
    const subHtml = isActive
      ? `<div class="assign-subpart-tree">
           ${sectionsHtml}
           ${itemSubs
             .map(
               (sp) =>
                 `<button type="button" class="assign-sub-btn ${sp.id === _ws.subpartId ? "active" : ""}" data-assign-subpart="${escapeHtml(sp.id)}">${escapeHtml(sp.label)}</button>`
             )
             .join("")}
         </div>`
      : "";

    return `<div class="assign-hw-group ${isActive ? "active" : ""}">
      <button type="button" class="assign-hw-btn ${isActive ? "active" : ""}" data-assign-hw="${item.id}">
        <span class="assign-hw-code">${escapeHtml(item.code)}</span>
        <span class="assign-hw-title">${escapeHtml(item.title)}</span>
      </button>
      ${subHtml}
    </div>`;
  }).join("");

  const activeSubObj = visibleSubs.find((s) => s.id === _ws.subpartId) || visibleSubs[0];

  _hostEl.innerHTML = `
    <div class="assignment-shell" id="assignmentShell">
      <!-- Left Rail: HW 1-7 & Subparts Directory -->
      <aside class="assignment-left-rail">
        <div class="assign-rail-hdr">
          <div>
            <div class="assign-rail-kicker">ASSIGNMENT WORKSPACE</div>
            <h2>Homework 1 – 7</h2>
          </div>
          <span class="badge">CAD Lab</span>
        </div>
        <div class="assign-hw-list">${hwListHtml}</div>
      </aside>

      <!-- Center CAD Stage: Viewport + Transport + Synced Telemetry Plot -->
      <section class="assignment-center-stage">
        <div class="assign-stage-hdr">
          <div class="assign-stage-titles">
            <span class="assign-stage-badge">${escapeHtml(hw.code)}</span>
            <strong>${escapeHtml(hw.title)}</strong>
            <span class="assign-stage-subbadge">${escapeHtml(activeSubObj?.label || "")}</span>
          </div>
          <div id="assignHoverReadout" class="assign-hover-pill">Hover viewport to inspect local field</div>
        </div>

        <div class="assign-canvas-wrap">
          <canvas id="assignAnimCanvas"></canvas>
        </div>

        <!-- CAD Simulation Transport Bar -->
        <div class="assign-transport">
          <div class="assign-transport-left">
            <button type="button" class="btn btn-primary btn-xs" id="assignPlayBtn">${_ws.playing ? "Pause" : "Play"}</button>
            <button type="button" class="btn btn-outline btn-xs" id="assignStepBtn">+Δt Step</button>
            <button type="button" class="btn btn-outline btn-xs" id="assignResetBtn">Reset</button>
            <select id="assignSpeedSel" class="assign-speed-sel" title="Playback Speed">
              <option value="0.5" ${_ws.speed === 0.5 ? "selected" : ""}>0.5×</option>
              <option value="1" ${_ws.speed === 1 ? "selected" : ""}>1.0×</option>
              <option value="2" ${_ws.speed === 2 ? "selected" : ""}>2.0×</option>
            </select>
          </div>
          <div class="assign-transport-mid">
            <input type="range" id="assignTimeScrub" min="0" max="100" step="0.5" value="0" />
          </div>
          <div class="assign-transport-right">
            <span id="assignTimeClock" class="assign-time-clock">t = 0.00 s</span>
            <button type="button" class="btn btn-outline btn-xs" id="assignDefaultBtn">Defaults</button>
          </div>
        </div>

        <!-- Bottom Synced Plot Bay -->
        <div class="assign-plot-bay">
          <div class="assign-plot-hdr">
            <span>Synced Quantitative Telemetry · ${escapeHtml(hw.topic)}</span>
            <div class="assign-plot-tabs">
              ${hw.plotTabs
                .map(
                  (pt) =>
                    `<button type="button" class="assign-plot-tab ${pt.id === _ws.plotTab ? "active" : ""}" data-assign-plot="${pt.id}">${escapeHtml(pt.label)}</button>`
                )
                .join("")}
            </div>
          </div>
          <div class="assign-plot-canvas-wrap">
            <canvas id="assignPlotCanvas"></canvas>
          </div>
        </div>
      </section>

      <!-- Right 3-Tab Inspector -->
      <aside class="assignment-right-panel">
        <div class="assign-inspector-tabs" role="tablist">
          <button type="button" class="assign-tab-btn ${_ws.inspectorTab === "params" ? "active" : ""}" data-assign-tab="params">Parameters</button>
          <button type="button" class="assign-tab-btn ${_ws.inspectorTab === "question" ? "active" : ""}" data-assign-tab="question">Question</button>
          <button type="button" class="assign-tab-btn ${_ws.inspectorTab === "solution" ? "active" : ""}" data-assign-tab="solution">Step-by-Step Solution</button>
        </div>
        <div class="assign-inspector-body" id="assignInspectorBody"></div>
      </aside>
    </div>
  `;

  renderInspectorBody(hw, v, sim);
  try {
    paintCanvases(hw, v, sim);
  } catch (err) {
    console.error("Assignment canvas render error:", err);
  }
}

function attachDelegatedEvents() {
  if (!_hostEl || _hostEl.dataset.assignBound === "1") return;
  _hostEl.dataset.assignBound = "1";

  _hostEl.addEventListener("click", (e) => {
    const hwBtn = e.target.closest("[data-assign-hw]");
    if (hwBtn) {
      _ws.hwId = hwBtn.dataset.assignHw;
      _ws.animTime = 0;
      _ws.deriveStatus = "";
      rebuildFullShell();
      return;
    }

    const secBtn = e.target.closest("[data-assign-section]");
    if (secBtn) {
      const hw = getHwSpec();
      getValues(hw).section = secBtn.dataset.assignSection;
      _ws.animTime = 0;
      rebuildFullShell();
      return;
    }

    const subBtn = e.target.closest("[data-assign-subpart]");
    if (subBtn && !e.target.closest("[data-jump-sol]")) {
      _ws.subpartId = subBtn.dataset.assignSubpart;
      rebuildFullShell();
      return;
    }

    const jumpBtn = e.target.closest("[data-jump-sol]");
    if (jumpBtn) {
      _ws.subpartId = jumpBtn.dataset.jumpSol;
      _ws.inspectorTab = "solution";
      rebuildFullShell();
      return;
    }

    const tabBtn = e.target.closest("[data-assign-tab]");
    if (tabBtn) {
      _ws.inspectorTab = tabBtn.dataset.assignTab;
      rebuildFullShell();
      return;
    }

    const plotBtn = e.target.closest("[data-assign-plot]");
    if (plotBtn) {
      _ws.plotTab = plotBtn.dataset.assignPlot;
      rebuildFullShell();
      return;
    }

    const presetBtn = e.target.closest("[data-assign-preset]");
    if (presetBtn) {
      const hw = getHwSpec();
      const idx = Number(presetBtn.dataset.assignPreset);
      const pr = hw.presets?.[idx];
      if (pr) {
        const cur = getValues(hw);
        Object.assign(cur, pr.values);
        _ws.animTime = 0;
        if (hw.supportsCustomEquations && pr.values.u_str && pr.values.v_str) {
          if (
            pr.values.u_str !== hw.defaultEquations.u_str ||
            pr.values.v_str !== hw.defaultEquations.v_str
          ) {
            runDeriveRequest({ useAi: false });
          } else {
            delete _ws.customKinByHw[hw.id];
            delete _ws.customOverrideByHw[hw.id];
          }
        }
        rebuildFullShell();
      }
      return;
    }

    if (e.target.id === "assignPlayBtn") {
      _ws.playing = !_ws.playing;
      e.target.textContent = _ws.playing ? "Pause" : "Play";
      return;
    }

    if (e.target.id === "assignStepBtn") {
      _ws.playing = false;
      const playBtn = _hostEl.querySelector("#assignPlayBtn");
      if (playBtn) playBtn.textContent = "Play";
      const hw = getHwSpec();
      const v = getValues(hw);
      const sim = computeAssignmentSim(hw.id, v, _ws.customKinByHw[hw.id]);
      _ws.animTime += Math.max(sim?.tEnd || 4.0, 1.5) * 0.05;
      paintCanvases(hw, v, sim);
      return;
    }

    if (e.target.id === "assignResetBtn") {
      _ws.animTime = 0;
      refreshDynamicPanels();
      return;
    }

    if (e.target.id === "assignDefaultBtn") {
      const hw = getHwSpec();
      _ws.valuesByHw[hw.id] = getDefaultValues(hw);
      delete _ws.customKinByHw[hw.id];
      delete _ws.customOverrideByHw[hw.id];
      _ws.deriveStatus = "";
      _ws.animTime = 0;
      rebuildFullShell();
      return;
    }

    if (e.target.id === "assignApplyEqBtn") {
      const hw = getHwSpec();
      const v = getValues(hw);
      v.u_str = _hostEl.querySelector("#assignInputU")?.value ?? v.u_str;
      v.v_str = _hostEl.querySelector("#assignInputV")?.value ?? v.v_str;
      runDeriveRequest({ useAi: false });
      return;
    }

    if (e.target.id === "assignResetEqBtn") {
      const hw = getHwSpec();
      const v = getValues(hw);
      if (hw.defaultEquations) {
        v.u_str = hw.defaultEquations.u_str;
        v.v_str = hw.defaultEquations.v_str;
      }
      delete _ws.customKinByHw[hw.id];
      delete _ws.customOverrideByHw[hw.id];
      _ws.deriveStatus = "";
      refreshDynamicPanels();
      return;
    }

    if (e.target.id === "assignAiDeriveBtn") {
      runDeriveRequest({ useAi: true });
      return;
    }

    if (e.target.id === "assignCfgKeyBtn") {
      document.getElementById("aiConfigBtn")?.click();
    }
  });

  _hostEl.addEventListener("input", (e) => {
    const pKey = e.target.dataset?.assignParam;
    if (pKey) {
      const hw = getHwSpec();
      const v = getValues(hw);
      if (e.target.type === "checkbox") {
        v[pKey] = Boolean(e.target.checked);
      } else if (e.target.tagName === "SELECT") {
        v[pKey] = e.target.value;
        rebuildFullShell();
        return;
      } else {
        v[pKey] = Number(e.target.value);
        const row = e.target.closest(".assign-param-row");
        const valEl = row?.querySelector(".assign-param-val");
        const schema = hw.params.find((p) => p.key === pKey);
        if (valEl && schema) {
          valEl.textContent = `${fmtNum(v[pKey], schema.step < 0.01 ? 4 : schema.step < 0.1 ? 2 : 1)} ${schema.unit || ""}`;
        }
      }
      refreshDynamicPanels();
      return;
    }

    if (e.target.id === "assignInputU") {
      getValues().u_str = e.target.value;
      return;
    }
    if (e.target.id === "assignInputV") {
      getValues().v_str = e.target.value;
      return;
    }

    if (e.target.id === "assignTimeScrub") {
      _ws.playing = false;
      const playBtn = _hostEl.querySelector("#assignPlayBtn");
      if (playBtn) playBtn.textContent = "Play";
      const hw = getHwSpec();
      const v = getValues(hw);
      const sim = computeAssignmentSim(hw.id, v, _ws.customKinByHw[hw.id]);
      const cycle = Math.max(sim?.tEnd || 4.0, 1.5);
      _ws.animTime = (Number(e.target.value) / 100) * cycle;
      paintCanvases(hw, v, sim);
    }
  });

  _hostEl.addEventListener("change", (e) => {
    if (e.target.id === "assignSpeedSel") {
      _ws.speed = Number(e.target.value) || 1.0;
    } else if (e.target.id === "assignShowAllChk") {
      _ws.showAllSubparts = Boolean(e.target.checked);
      refreshInspectorOnly();
    } else if (e.target.dataset?.assignParam && e.target.tagName === "SELECT") {
      const hw = getHwSpec();
      getValues(hw)[e.target.dataset.assignParam] = e.target.value;
      rebuildFullShell();
    }
  });

  _hostEl.addEventListener("mousemove", (e) => {
    const canvas = e.target.closest("#assignAnimCanvas");
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    _ws.hoverPx = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  });

  _hostEl.addEventListener("mouseout", (e) => {
    if (e.target.id === "assignAnimCanvas") _ws.hoverPx = null;
  });
}

function startAnimationLoop() {
  if (_rafId) cancelAnimationFrame(_rafId);
  _lastFrameTs = performance.now();

  const tick = (now) => {
    if (!_hostEl || _hostEl.classList.contains("hidden")) {
      _rafId = null;
      return;
    }
    const dtSec = Math.min((now - _lastFrameTs) / 1000, 0.05);
    _lastFrameTs = now;
    if (_ws.playing) {
      _ws.animTime += dtSec * _ws.speed;
    }
    const hw = getHwSpec();
    const v = getValues(hw);
    const sim = computeAssignmentSim(hw.id, v, _ws.customKinByHw[hw.id]);
    paintCanvases(hw, v, sim);
    _rafId = requestAnimationFrame(tick);
  };
  _rafId = requestAnimationFrame(tick);
}

export function renderAssignmentView(hostEl) {
  _hostEl = hostEl;
  if (!_hostEl) return;
  attachDelegatedEvents();
  rebuildFullShell();

  if (!_resizeObs && typeof ResizeObserver !== "undefined") {
    _resizeObs = new ResizeObserver(() => {
      if (_hostEl && !_hostEl.classList.contains("hidden")) {
        const hw = getHwSpec();
        const v = getValues(hw);
        const sim = computeAssignmentSim(hw.id, v, _ws.customKinByHw[hw.id]);
        paintCanvases(hw, v, sim);
      }
    });
    _resizeObs.observe(_hostEl);
  }
  startAnimationLoop();
}

export function destroyAssignmentView() {
  if (_rafId) {
    cancelAnimationFrame(_rafId);
    _rafId = null;
  }
  if (_resizeObs) {
    _resizeObs.disconnect();
    _resizeObs = null;
  }
  _ws.hoverPx = null;
}
