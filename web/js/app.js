/**
 * Thin Workbench Router & Global Lifecycle Coordinator.
 * Wave 0 modularized entrypoint delegating state to core/store.js and labs to stations/*.js.
 */
import {
  LAB_CATALOG,
  ROCKER_DEFS,
  bus,
  state,
  persistLLMConfig,
} from "./core/store.js";
import { updateEquationStrip } from "./core/equation_strip.js";
import { initCoachDrawer } from "./components/coach_drawer.js";
import { renderTex } from "./math_ui.js";
import { FlowCanvasEngine } from "./canvas_flow.js";
import { CurvePlotEngine } from "./canvas_plots.js";
import { renderOverview } from "./overview.js";
import { renderStation01 } from "./stations/station01.js";
import { renderStation02, applyStation02Assumption } from "./stations/station02.js";
import { renderStation03 } from "./stations/station03.js";
import { renderStation04 } from "./stations/station04.js";
import { renderStation05 } from "./stations/station05.js";

const flowEngine = new FlowCanvasEngine(
  document.getElementById("flowCanvas"),
  document.getElementById("flowProbeHud")
);
const plotEngine = new CurvePlotEngine(
  document.getElementById("plotCanvas"),
  document.getElementById("plotProbeHud")
);

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

function applyAssumptionToActiveLab(key) {
  if (state.activeView !== "labs") return false;
  const val = state.assumptions[key];
  const bayCtx = makeBayCtx();

  if (state.activeBay === "02") {
    return applyStation02Assumption(key, bayCtx);
  }
  if (state.activeBay === "03" && state.s3) {
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
    renderStation04(bayCtx);
    return true;
  }
  return false;
}

function renderRockers() {
  const container = document.getElementById("assumptionRockers");
  if (!container) return;
  container.innerHTML = "";
  let activeCount = 0;

  for (const [key, label, , hazardFlag] of ROCKER_DEFS) {
    const val = state.assumptions[key];
    const isTrapFlag = hazardFlag ? val : !val;
    if (val) activeCount += 1;

    const btn = document.createElement("button");
    btn.type = "button";
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

  const summaryPill = document.getElementById("assumptionSummaryPill");
  if (summaryPill) {
    summaryPill.textContent = `${activeCount}/${ROCKER_DEFS.length} On`;
  }
}

async function refreshAudit(contextId = null) {
  if (contextId) state.equationContext = contextId;
  const activeCtxId = state.equationContext || "ns_x";
  try {
    const data = await apiPost(
      "/api/audit",
      { ...state.assumptions, equation_context: activeCtxId },
      "audit"
    );
    updateEquationStrip(data, activeCtxId);

    const warnBox = document.getElementById("assumptionWarnings");
    if (warnBox) {
      warnBox.innerHTML = "";
      (data.warnings || []).slice(0, 3).forEach((w) => {
        const div = document.createElement("div");
        div.className = "warning-line";
        div.textContent = w;
        warnBox.appendChild(div);
      });
    }
  } catch (err) {
    if (err.name === "AbortError") return;
    const kb = document.getElementById("kernelBadge");
    if (kb) kb.textContent = `Err: ${err.message}`;
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
  el.innerHTML = (items || [])
    .map((it) => {
      const c = resolveBadgeColor(it.color);
      return `<span class="leg-item"><span class="leg-swatch" style="background:${c};${
        it.dashed ? "border-top:2.5px dashed " + c + ";background:transparent;" : ""
      }"></span>${it.label}</span>`;
    })
    .join("");
}

function setConceptBanner(mainHtml, trapHtml, trapTone = "trap") {
  const m = document.getElementById("conceptBannerText");
  const t = document.getElementById("conceptBannerTrap");
  if (m && mainHtml) m.innerHTML = mainHtml;
  if (t && trapHtml !== undefined && trapHtml !== null) {
    t.innerHTML = trapHtml;
    t.classList.toggle("insight-callout", trapTone === "insight");
  }
}

function clearSecondaryControls() {
  const slot = document.getElementById("secondaryPlotControls");
  if (slot) slot.innerHTML = "";
}

function setDrawerMetrics(items) {
  const box = document.getElementById("drawerMetrics");
  if (!box) return;
  box.innerHTML = (items || [])
    .map((m) => `<span style="color:${resolveBadgeColor(m.color)}">${m.k}: ${m.v}</span>`)
    .join("");
}

function setDrawerCards(cards) {
  const body = document.getElementById("drawerBody");
  if (!body) return;
  body.innerHTML = "";
  const grid = document.createElement("div");
  grid.className = "diag-grid";
  (cards || []).forEach((c) => {
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

function updateAiBadge() {
  const badge = document.getElementById("aiEngineBadge");
  if (badge) {
    badge.textContent =
      state.llmConfig.provider === "offline"
        ? "AI: Offline"
        : `AI: ${state.llmConfig.provider.toUpperCase()}`;
  }
  const tag = document.getElementById("s1CoachModeTag");
  if (tag) tag.textContent = state.llmConfig.provider.toUpperCase();
}

function renderAIConfigModal() {
  const existing = document.getElementById("aiModal");
  if (existing) {
    existing.remove();
    return;
  }
  const div = document.createElement("div");
  div.id = "aiModal";
  div.style.cssText =
    "position:fixed;top:60px;right:18px;width:330px;z-index:60;background:var(--bg-bay);border:1px solid var(--accent);padding:14px;border-radius:8px;box-shadow:var(--shadow-md);";
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
      <input type="password" class="text-input" id="inAiKey" placeholder="Optional key..." />
    </div>
    <div class="field-group" style="margin-top:8px;">
      <div class="field-label-row"><span>Model Name</span></div>
      <input class="text-input" id="inAiModel" placeholder="gemini-2.5-flash / gpt-4o-mini" />
    </div>
    <div class="field-group" style="margin-top:8px;">
      <div class="field-label-row"><span>Base URL (OpenAI / Groq / Ollama)</span></div>
      <input class="text-input" id="inAiUrl" />
    </div>
    <button class="btn-machined btn-primary" id="saveAiCfg" style="width:100%;margin-top:12px;">Apply AI Settings</button>
  `;
  document.body.appendChild(div);
  div.querySelector("#inAiKey").value = state.llmConfig.api_key || "";
  div.querySelector("#inAiModel").value = state.llmConfig.model || "";
  div.querySelector("#inAiUrl").value = state.llmConfig.base_url || "https://api.openai.com/v1";

  document.getElementById("closeAiModal").onclick = () => div.remove();
  document.getElementById("saveAiCfg").onclick = () => {
    state.llmConfig = persistLLMConfig({
      provider: document.getElementById("selAiProv").value,
      api_key: document.getElementById("inAiKey").value,
      model: document.getElementById("inAiModel").value,
      base_url: document.getElementById("inAiUrl").value,
    });
    updateAiBadge();
    div.remove();
  };
}

document.getElementById("aiEngineBadge").onclick = renderAIConfigModal;

function makeBayCtx() {
  return {
    state,
    bus,
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
    navPayload: state.pendingNavPayload,
  };
}

function openStation(bayId) {
  cancelLabPending();
  clearSecondaryControls();
  const bayCtx = makeBayCtx();
  state.pendingNavPayload = null;

  if (bayId === "01") renderStation01(bayCtx);
  else if (bayId === "02") renderStation02(bayCtx);
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
    refreshAudit("ns_x");
    renderStation03(bayCtx);
  } else if (bayId === "04") renderStation04(bayCtx);
  else if (bayId === "05") renderStation05(bayCtx);
}

function getActiveLabEntry() {
  let activeSub = state.bay02Mode;
  if (state.activeBay === "03") activeSub = state.bay03Mode || "separation";
  else if (state.activeBay === "04") activeSub = state.bay04Mode || "lbm";
  return LAB_CATALOG.find((item) => item.bay === state.activeBay && item.sub === activeSub) || LAB_CATALOG[0];
}

function updateLabPillsUI() {
  const activeEntry = getActiveLabEntry();
  document.querySelectorAll(".lab-pill").forEach((pill) => {
    const match = pill.dataset.bay === activeEntry.bay && pill.dataset.sub === activeEntry.sub;
    pill.classList.toggle("active", match);
  });
  document.querySelectorAll(".lab-cat-tab").forEach((tab) => {
    const match = tab.dataset.labCat === activeEntry.category;
    tab.classList.toggle("active", match);
    tab.setAttribute("aria-selected", String(match));
  });
  document.querySelectorAll(".lab-pill-group").forEach((grp) => {
    grp.classList.toggle("is-active-group", grp.dataset.labGroup === activeEntry.category);
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
  try {
    localStorage.setItem("fluidscope_theme", mode);
  } catch (_) {}
  const icon = document.getElementById("themeIcon");
  const label = document.getElementById("themeLabel");
  if (icon) icon.innerHTML = mode === "dark" ? "&#9790;" : "&#9788;";
  if (label) label.textContent = mode === "dark" ? "Dark Mode" : "Light Mode";
  requestAnimationFrame(() => {
    plotEngine.render();
    if (typeof flowEngine.render === "function") flowEngine.render();
    else if (typeof flowEngine._render === "function") flowEngine._render();
  });
}

// Event Bus Cross-Module Subscriptions
bus.on("lab:navigate", ({ bay, mode, payload = null, autoSolve = true } = {}) => {
  if (!bay || !mode) return;
  state.pendingNavPayload = payload ? { payload, autoSolve: autoSolve !== false } : null;
  openLab(bay, mode);
});

bus.on("flow:hover", (payload) => {
  if (typeof plotEngine.setExternalHover === "function") {
    plotEngine.setExternalHover(payload);
  }
});

bus.on("plot:hover", (payload) => {
  if (typeof flowEngine.setExternalHover === "function") {
    flowEngine.setExternalHover(payload);
  }
});

bus.on("solver:updated", ({ parsedQuery = null, solverData = null, suggestedPrompt = "" } = {}) => {
  state.activeCoachContext = {
    parsedQuery,
    solverData,
    suggestedPrompt,
  };
});

// Top Shell & Strip Bindings
document.querySelectorAll("#bayTabs .bay-tab").forEach((tab) => {
  tab.onclick = () => openView(tab.dataset.view);
});

document.getElementById("brandHomeBtn").onclick = () => openView("overview");

document.querySelectorAll(".lab-pill").forEach((pill) => {
  pill.onclick = () => openLab(pill.dataset.bay, pill.dataset.sub);
});

document.querySelectorAll(".lab-cat-tab").forEach((tab) => {
  tab.onclick = () => {
    const cat = tab.dataset.labCat;
    if (cat === "kinematics") openLab("02", state.bay02Mode || "kinematics");
    else if (cat === "viscous") openLab("03", state.bay03Mode || "separation");
    else if (cat === "conservation") openLab("04", state.bay04Mode || "lbm");
  };
});

const stepLab = (delta) => {
  const cur = getActiveLabEntry();
  const idx = LAB_CATALOG.indexOf(cur);
  const nextIdx = (idx + delta + LAB_CATALOG.length) % LAB_CATALOG.length;
  const target = LAB_CATALOG[nextIdx];
  openLab(target.bay, target.sub);
};

const prevBtn = document.getElementById("btnPrevLab");
if (prevBtn) prevBtn.onclick = () => stepLab(-1);
const nextBtn = document.getElementById("btnNextLab");
if (nextBtn) nextBtn.onclick = () => stepLab(1);

const openCoachBtn = document.getElementById("btnOpenCoach");
if (openCoachBtn) {
  openCoachBtn.onclick = () => {
    bus.emit("coach:open", {
      parsedQuery: state.activeCoachContext?.parsedQuery || null,
      solverData: state.activeCoachContext?.solverData ?? null,
      suggestedPrompt: state.activeCoachContext?.suggestedPrompt || "",
    });
  };
}

const accBtn = document.getElementById("assumptionAccordionBtn");
const accPanel = document.getElementById("assumptionPanel");
if (accBtn && accPanel && !accBtn.dataset.accordionBound) {
  accBtn.dataset.accordionBound = "1";
  accBtn.onclick = () => {
    const nextExpanded = accBtn.getAttribute("aria-expanded") !== "true";
    accBtn.setAttribute("aria-expanded", String(nextExpanded));
    accPanel.classList.toggle("collapsed", !nextExpanded);
  };
}

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

// Boot onto Overview Landing Page (Light Laboratory Paper default)
let savedTheme = "light";
try {
  savedTheme = localStorage.getItem("fluidscope_theme") || "light";
} catch (_) {}
applyTheme(savedTheme);
updateAiBadge();
initCoachDrawer(makeBayCtx());
renderOverview({ openView, openLab });
renderRockers();
refreshAudit();
openView("overview");
