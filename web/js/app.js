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
import { createLab2aLesson } from "./lessons/lesson_02a.js";
import { createLab2bLesson } from "./lessons/lesson_02b.js";
import { createLab2cLesson } from "./lessons/lesson_02c.js";
import { createLab2dLesson } from "./lessons/lesson_02d.js";

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
  for (const ch of ["activeLab", "coach", "cpHelper"]) {
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

const PERTURB_KEYS = ROCKER_DEFS
  .filter(([, , kind]) => kind === "perturb")
  .map(([key]) => key);

const LAB_PERTURB_APPLICABILITY = {
  "02:kinematics": ["inviscid"],
  "02:vortex": ["inviscid"],
  "02:vessel": [],
  "02:potential": ["inviscid"],
  "03:separation": ["adverse_pressure_gradient"],
  "03:couette": ["adverse_pressure_gradient", "newtonian"],
  "03:twolayer": [],
  "03:slip_hb": ["no_slip", "newtonian"],
  "04:lbm": [],
  "04:jump": ["irreversible_jump"],
  "04:expansion": ["irreversible_jump"],
  "04:tank": ["inertial_frame"],
};

function getApplicablePerturbKeys() {
  if (state.activeView === "05" && !state.s5?.checked) {
    return new Set();
  }
  if (state.activeView === "01" || state.activeView === "05" || state.activeView === "overview") {
    return new Set(PERTURB_KEYS);
  }
  const bay = state.activeBay;
  const sub =
    bay === "02"
      ? state.bay02Mode
      : bay === "03"
      ? state.bay03Mode
      : bay === "04"
      ? state.bay04Mode
      : "";
  const list = LAB_PERTURB_APPLICABILITY[`${bay}:${sub}`];
  return new Set(Array.isArray(list) ? list : []);
}

function renderRockers() {
  const derivedRow = document.getElementById("assumptionDerivedRow");
  const container = document.getElementById("assumptionRockers");
  const summaryPill = document.getElementById("assumptionSummaryPill");
  const warnBox = document.getElementById("assumptionWarnings");
  const isQuizLocked = state.activeView === "05" && !state.s5?.checked;
  const applicableKeys = isQuizLocked ? new Set() : getApplicablePerturbKeys();

  if (isQuizLocked && warnBox) {
    warnBox.innerHTML = "";
  }

  let brokenCount = 0;
  for (const [key, , , hazardFlag] of ROCKER_DEFS) {
    const val = Boolean(state.assumptions[key]);
    if (hazardFlag ? val : !val) brokenCount += 1;
  }

  if (derivedRow) {
    derivedRow.innerHTML = "";
    for (const [key, label, kind, hazardFlag] of ROCKER_DEFS) {
      if (kind !== "derived") continue;
      const badge = document.createElement("span");
      const led = document.createElement("span");
      const labelSpan = document.createElement("span");
      labelSpan.className = "derived-label";
      labelSpan.textContent = label;

      if (isQuizLocked) {
        badge.className = "derived-badge derived-locked";
        badge.title = "Submit prediction first";
        led.className = "led led-dim";
        badge.appendChild(led);
        badge.appendChild(labelSpan);
      } else {
        const val = Boolean(state.assumptions[key]);
        const isBroken = hazardFlag ? val : !val;
        const cause = String(state.assumptionCauses?.[key] || "").trim();
        badge.className = `derived-badge ${isBroken ? "derived-broken" : "derived-ok"}`;
        badge.title = cause
          ? `Derived from solver (${label}: ${val ? "Yes" : "No"} — ${cause})`
          : `Derived from solver (${label}: ${val ? "Yes" : "No"}) — read-only`;
        led.className = `led ${isBroken ? "led-coral" : "led-ok"}`;
        badge.appendChild(led);
        badge.appendChild(labelSpan);
        if (cause) {
          const causeSpan = document.createElement("span");
          causeSpan.className = "derived-cause";
          causeSpan.textContent = cause;
          badge.appendChild(causeSpan);
        }
      }
      derivedRow.appendChild(badge);
    }
    if (isQuizLocked) {
      const lockNote = document.createElement("span");
      lockNote.className = "derived-cause derived-lock-note";
      lockNote.textContent = "Submit prediction first";
      derivedRow.appendChild(lockNote);
    }
  }

  if (container) {
    container.innerHTML = "";
    for (const [key, label, kind, hazardFlag] of ROCKER_DEFS) {
      if (kind !== "perturb") continue;
      const val = Boolean(state.assumptions[key]);
      const isBroken = hazardFlag ? val : !val;
      const applicable = applicableKeys.has(key);

      const btn = document.createElement("button");
      btn.type = "button";

      const labelSpan = document.createElement("span");
      labelSpan.textContent = label;
      const led = document.createElement("span");

      if (isQuizLocked) {
        btn.className = "rocker-btn rocker-na rocker-locked";
        btn.disabled = true;
        btn.title = "Submit prediction first";
        led.className = "led led-dim";
      } else {
        const ledClass = isBroken ? "led-coral" : hazardFlag ? "led-dim" : "led-ok";
        led.className = `led ${ledClass}`;
        btn.className = [
          "rocker-btn",
          val ? "on" : "",
          isBroken ? "broken" : "",
          !applicable ? "rocker-na" : "",
        ]
          .filter(Boolean)
          .join(" ");

        if (!applicable) {
          btn.disabled = true;
          btn.title = "Not exposed as a perturbation toggle in this solver";
        } else {
          btn.disabled = false;
          btn.title = hazardFlag
            ? val
              ? `${label} active — click to clear`
              : `${label} inactive — click to trigger`
            : val
            ? `${label} holds — click to perturb`
            : `${label} broken — click to restore`;
          btn.onclick = () => {
            if (state.activeView === "05" && !state.s5?.checked) return;
            state.assumptions[key] = !state.assumptions[key];
            if (key === "inviscid" && state.assumptions.inviscid) {
              state.assumptions.irreversible_jump = false;
            }
            if (state.activeCoachContext?.parsedQuery?.assumptions) {
              state.activeCoachContext.parsedQuery.assumptions = {
                ...state.activeCoachContext.parsedQuery.assumptions,
                ...state.assumptions,
              };
            }
            renderRockers();
            refreshAudit();
            const didResolve = applyAssumptionToActiveLab(key);
            if (!didResolve && state.activeCoachContext?.parsedQuery) {
              bus.emit("solver:updated", {
                parsedQuery: state.activeCoachContext.parsedQuery,
                solverData: state.activeCoachContext.solverData ?? null,
                suggestedPrompt: state.activeCoachContext.suggestedPrompt || "",
              });
            }
          };
        }
      }

      btn.appendChild(labelSpan);
      btn.appendChild(led);
      container.appendChild(btn);
    }
  }

  if (summaryPill) {
    if (isQuizLocked) {
      summaryPill.textContent = "Locked";
      summaryPill.title = "Submit prediction first to unlock physics assumption audit";
    } else {
      summaryPill.textContent = brokenCount > 0 ? `${brokenCount} Broken` : "0 Broken";
      summaryPill.title = `${brokenCount} broken assumption(s); ${applicableKeys.size} perturbation toggle(s) active`;
    }
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
  const c = String(col).toLowerCase().trim();
  if (c === "primary" || c === "#58a6ff" || c === "#1d4ed8") return "var(--accent)";
  if (c === "amber" || c === "#e6a23c") return "var(--amber)";
  if (c === "coral" || c === "trap" || c === "#e05a47" || c === "#b91c1c") return "var(--coral)";
  if (c === "ok" || c === "#58b368") return "var(--ok-green)";
  if (c === "teal" || c === "var(--teal)" || c === "#0f766e" || c === "#2dd4bf") return "var(--teal)";
  if (c === "#d9e2ec" || c === "#f0f6fc") return "var(--ink-primary)";
  if (c === "#9fb3c8" || c === "#7f8ea3") return "var(--ink-secondary)";
  return col;
}

function resolveMetricTextColor(col) {
  if (!col) return "var(--ink-primary)";
  const c = String(col).toLowerCase().trim();
  if (
    c === "amber" ||
    c === "var(--amber)" ||
    c === "#e6a23c" ||
    c === "#d55e00" ||
    c === "#b45309" ||
    c === "#d97706"
  ) {
    return "var(--amber-ink)";
  }
  if (
    c === "coral" ||
    c === "trap" ||
    c === "var(--coral)" ||
    c === "#e05a47" ||
    c === "#dc2626" ||
    c === "#b91c1c"
  ) {
    return "var(--coral-ink)";
  }
  if (
    c === "ok" ||
    c === "stokes" ||
    c === "var(--ok-green)" ||
    c === "#58b368" ||
    c === "#15803d" ||
    c === "#009e73"
  ) {
    return "var(--ok-ink)";
  }
  if (
    c === "primary" ||
    c === "var(--accent)" ||
    c === "#58a6ff" ||
    c === "#1d4ed8" ||
    c === "#0072b2"
  ) {
    return "var(--cobalt-ink)";
  }
  if (c === "teal" || c === "var(--teal)" || c === "#0f766e" || c === "#2dd4bf") {
    return "var(--teal)";
  }
  if (c === "secondary" || c === "purple") return "var(--ink-primary)";
  if (c === "#d9e2ec" || c === "#f0f6fc") return "var(--ink-primary)";
  if (c === "#9fb3c8" || c === "#7f8ea3" || c === "var(--ink-secondary)") return "var(--ink-secondary)";
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
    .map((m) => `<span style="color:${resolveMetricTextColor(m.color)}">${m.k}: ${m.v}</span>`)
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

function formatAiProviderLabel(rawProvider) {
  const key = String(rawProvider || "offline").toLowerCase().trim();
  if (key.includes("offline")) return "Offline Grounded Coach";
  if (key.includes("gemini")) return "Google Gemini Coach";
  if (key.includes("openai") || key.includes("groq") || key.includes("ollama")) {
    return "OpenAI-Compatible Coach";
  }
  return key.replaceAll("_", " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function updateAiBadge() {
  const badge = document.getElementById("aiEngineBadge");
  if (badge) {
    badge.textContent =
      state.llmConfig.provider === "offline"
        ? "AI: Offline"
        : `AI: ${state.llmConfig.provider.toUpperCase()}`;
  }
  const friendly = formatAiProviderLabel(state.llmConfig.provider);
  const tag = document.getElementById("s1CoachModeTag");
  if (tag) tag.textContent = friendly;
  const s1Sum = document.getElementById("s1LlmSummary");
  if (s1Sum) s1Sum.textContent = `AI Engine Settings (${friendly})`;
  const drawerBadge = document.getElementById("coachDrawerProviderBadge");
  if (drawerBadge) drawerBadge.textContent = friendly;

  const s1Prov = document.getElementById("s1SelLlmProv");
  if (s1Prov) s1Prov.value = state.llmConfig.provider || "offline";
  const s1Model = document.getElementById("s1InLlmModel");
  if (s1Model) s1Model.value = state.llmConfig.model || "";
  const s1Key = document.getElementById("s1InLlmKey");
  if (s1Key) s1Key.value = state.llmConfig.api_key || "";
  const s1Url = document.getElementById("s1InLlmUrl");
  if (s1Url) s1Url.value = state.llmConfig.base_url || "https://api.openai.com/v1";
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
    "position:fixed;top:60px;right:12px;width:min(330px,calc(100vw - 24px));max-height:calc(100vh - 80px);overflow-y:auto;z-index:60;background:var(--bg-bay);border:1px solid var(--accent);padding:14px;border-radius:8px;box-shadow:var(--shadow-md);";
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

function closeCoachDrawerHost() {
  const host = document.getElementById("coachDrawerHost");
  if (host) {
    host.setAttribute("aria-hidden", "true");
    host.classList.remove("open");
  }
  bus.emit("coach:close");
}

function openStation(bayId) {
  cancelLabPending();
  clearSecondaryControls();
  state.equationContext = "ns_x";
  state.assumptionCauses = { steady: "", incompressible: "", irrotational: "" };
  state.activeCoachContext = { parsedQuery: null, solverData: null, suggestedPrompt: "" };
  flowEngine.setInteractiveHandles?.([], null);
  flowEngine.setDrawMode?.(null, null);
  flowEngine.setExternalHover?.(null);
  plotEngine.setExternalHover?.(null);
  closeCoachDrawerHost();
  const warnBox = document.getElementById("assumptionWarnings");
  if (warnBox) warnBox.innerHTML = "";
  const bayCtx = makeBayCtx();
  state.pendingNavPayload = null;

  if (bayId === "05" && !state.s5?.checked) {
    renderRockers();
  }

  if (bayId === "01") renderStation01(bayCtx);
  else if (bayId === "02") renderStation02(bayCtx);
  else if (bayId === "03") renderStation03(bayCtx);
  else if (bayId === "04") renderStation04(bayCtx);
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
  const activeIdx = LAB_CATALOG.indexOf(activeEntry);
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
  const prevBtnEl = document.getElementById("btnPrevLab");
  if (prevBtnEl) {
    const atStart = activeIdx <= 0;
    prevBtnEl.disabled = atStart;
    prevBtnEl.title = atStart
      ? "Already at first lab (2A)"
      : `Previous Lab (${LAB_CATALOG[activeIdx - 1]?.id || ""})`;
  }
  const nextBtnEl = document.getElementById("btnNextLab");
  if (nextBtnEl) {
    const atEnd = activeIdx < 0 || activeIdx >= LAB_CATALOG.length - 1;
    nextBtnEl.disabled = atEnd;
    nextBtnEl.title = atEnd
      ? "Already at last lab (4D)"
      : `Next Lab (${LAB_CATALOG[activeIdx + 1]?.id || ""})`;
  }
}

function openView(view) {
  const prevView = state.activeView;
  state.activeView = view;
  const overviewEl = document.getElementById("overviewView");
  const workbenchEl = document.getElementById("workbenchView");
  const labStrip = document.getElementById("labSelectorStrip");

  document.querySelectorAll("#bayTabs .bay-tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.view === view);
  });

  if (view === "overview") {
    cancelLabPending();
    flowEngine.setInteractiveHandles?.([], null);
    flowEngine.setDrawMode?.(null, null);
    flowEngine.setExternalHover?.(null);
    plotEngine.setExternalHover?.(null);
    closeCoachDrawerHost();
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
  if (prevView !== view) {
    window.scrollTo({ top: 0, behavior: "auto" });
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
  const repaintBoth = () => {
    plotEngine.render();
    if (typeof flowEngine.render === "function") flowEngine.render();
    else if (typeof flowEngine._render === "function") flowEngine._render();
  };
  repaintBoth();
  requestAnimationFrame(repaintBoth);
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

const BAY_SUB_TO_FAMILY = {
  "02:kinematics": "kinematics_equation",
  "02:vortex": "vortex_flow",
  "02:vessel": "rotating_vessel",
  "02:potential": "potential_superposition",
  "03:separation": "bl_separation",
  "03:couette": "couette_poiseuille",
  "03:twolayer": "two_layer_poiseuille",
  "03:slip_hb": "slip_herschel_bulkley",
  "04:lbm": "lbm_tunnel",
  "04:jump": "hydraulic_jump",
  "04:expansion": "sudden_expansion",
  "04:tank": "accelerating_tank",
};

const FAMILY_FALLBACK_META = {
  kinematics_equation: {
    concept_twist: "Unsteady flows separate streamline, pathline, and streakline; nonzero divergence violates incompressibility.",
    broken_shortcut: "Assuming streamlines equal particle trajectories or streaklines when ∂V/∂t ≠ 0.",
    textbook_ref: "Fluid Kinematics & Flow Lines",
  },
  vortex_flow: {
    concept_twist: "Radial pressure balances centrifugal acceleration; Bernoulli applies across streamlines only when Ωz = 0.",
    broken_shortcut: "Applying constant-head Bernoulli across streamlines inside a rotational forced vortex.",
    textbook_ref: "Vortex Flow & Radial Pressure Balance",
  },
  rotating_vessel: {
    concept_twist: "Open rotating cylinder spills liquid at the top rim before uncovering a dry center base.",
    broken_shortcut: "Assuming trapped fluid volume equals initial fill volume once the paraboloid reaches the rim.",
    textbook_ref: "Rotating Vessel Free Surface Paraboloid",
  },
  potential_superposition: {
    concept_twist: "Superposing uniform stream, doublet, and circulation generates Kutta–Joukowski lift with zero D'Alembert drag.",
    broken_shortcut: "Expecting stagnation points to remain on the cylinder wall when |Γ| > 4πU∞a.",
    textbook_ref: "Potential Superposition & Magnus Effect",
  },
  falkner_skan: {
    concept_twist: "Adverse Hartree β < 0 forces positive wall curvature and an inflection point ahead of separation at β ≈ -0.1988.",
    broken_shortcut: "Assuming boundary-layer velocity profiles stay monotonic without an inflection point under dp/dx > 0.",
    textbook_ref: "Falkner–Skan Boundary Layer & Inflection",
  },
  bl_separation: {
    concept_twist: "Adverse pressure gradient (dp/dx > 0) forces positive wall curvature and boundary-layer reversal past Λ = -12.",
    broken_shortcut: "Relying on inviscid potential flow (D'Alembert's paradox) which misses wake separation and pressure drag.",
    textbook_ref: "Boundary-Layer Separation & Pressure Gradient",
  },
  couette_poiseuille: {
    concept_twist: "Moving-wall Couette shear competes with opposing pressure gradient, reversing lower-wall shear for P < -1 and reaching Q = 0 at P = -3.",
    broken_shortcut: "Assuming a linear Couette velocity profile when a nonzero axial pressure gradient is present.",
    textbook_ref: "Generalized Couette–Poiseuille Backflow",
  },
  two_layer_poiseuille: {
    concept_twist: "At an immiscible liquid interface, velocity and shear stress τ = μ(du/dy) match, producing a slope kink and off-center peak.",
    broken_shortcut: "Equating velocity gradients du1/dy = du2/dy across fluids of unequal viscosity.",
    textbook_ref: "Two-Layer Immiscible Channel Flow",
  },
  slip_herschel_bulkley: {
    concept_twist: "Yield-stress fluids move as a rigid plug where |τ| ≤ τ_y while Navier wall slip adds nonzero wall speed u_w.",
    broken_shortcut: "Applying classical no-slip parabolic Poiseuille flow to slip or yield-stress Herschel–Bulkley fluids.",
    textbook_ref: "Navier Wall Slip & Herschel–Bulkley Rheology",
  },
  hydraulic_jump: {
    concept_twist: "Hydraulic jumps conserve integral specific force Fs rather than specific energy Es due to turbulent roller dissipation.",
    broken_shortcut: "Setting Es1 = Es2 across a hydraulic jump and ignoring irreversible eddy head loss hj.",
    textbook_ref: "Open-Channel Hydraulic Jump & Specific Force",
  },
  sudden_expansion: {
    concept_twist: "Annular corner eddies hold shoulder pressure p' ≈ p1 across an abrupt expansion, reducing pressure recovery via Borda–Carnot loss.",
    broken_shortcut: "Using ideal lossless Bernoulli Δp = ½ρ(V1² - V2²) across a sudden pipe expansion.",
    textbook_ref: "Borda–Carnot Sudden Pipe Expansion",
  },
  accelerating_tank: {
    concept_twist: "Isobars tilt perpendicular to effective body force g_eff = g - a_frame; in free fall (az = -g), g_eff = 0 halts bottom orifice flow.",
    broken_shortcut: "Applying static Torricelli efflux v = √(2gh) inside an accelerating or free-falling tank.",
    textbook_ref: "Accelerating & Free-Falling Tank Hydrostatics",
  },
  lbm_tunnel: {
    concept_twist: "Viscous D2Q9 Lattice–Boltzmann flow sheds alternating Kármán vortices unless stabilized by geometry such as a wake splitter.",
    broken_shortcut: "Assuming steady symmetric potential streamlines behind a bluff cylinder at Re ~ 100.",
    textbook_ref: "2D Lattice–Boltzmann Wind Tunnel & Wake",
  },
  unsupported_3d: {
    concept_twist: "3D compressible and turbomachinery flows fall outside built 2D/1D incompressible exact solvers.",
    broken_shortcut: "Extrapolating 2D incompressible Bernoulli across 3D shocks or rotating impeller passages.",
    textbook_ref: "3D Compressible & Turbomachinery Regime",
  },
};

const VALID_PHYSICS_FAMILIES = new Set(Object.keys(FAMILY_FALLBACK_META));

function clampObstacleCoord(v, lo, hi, def) {
  const parsed = v === null || v === undefined || v === "" ? def : Number(v);
  const n = Number.isFinite(parsed) ? parsed : def;
  return Math.max(lo, Math.min(hi, n));
}

function roundObstacleCoord(n) {
  return Math.round(n * 10000) / 10000;
}

function sanitizeObstacles(raw) {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set(["circle", "rect", "splitter", "step"]);
  return raw
    .map((o) => {
      if (!o || typeof o !== "object") return null;
      const t = String(o.type || "").toLowerCase();
      if (!allowed.has(t)) return null;
      if (t === "circle") {
        return {
          type: "circle",
          x: roundObstacleCoord(clampObstacleCoord(o.x, 0.02, 0.95, 0.25)),
          y: roundObstacleCoord(clampObstacleCoord(o.y, 0.05, 0.95, 0.5)),
          r: roundObstacleCoord(clampObstacleCoord(o.r, 0.03, 0.35, 0.1)),
        };
      }
      const x0 = roundObstacleCoord(clampObstacleCoord(o.x0, 0.02, 0.95, 0.3));
      const y0 = roundObstacleCoord(clampObstacleCoord(o.y0, 0.02, 0.95, 0.45));
      const x1 = roundObstacleCoord(clampObstacleCoord(o.x1, Math.max(0.05, x0 + 0.01), 0.98, 0.55));
      const y1 = roundObstacleCoord(clampObstacleCoord(o.y1, Math.max(0.05, y0 + 0.01), 0.98, 0.55));
      return { type: t, x0, y0, x1, y1 };
    })
    .filter(Boolean);
}

function buildParsedQueryFallback(eventPayload = {}) {
  const pq = eventPayload?.parsedQuery;
  const bay = String(eventPayload?.bay || state.activeBay || "");
  const sub = String(
    eventPayload?.sub ||
      (bay === "02"
        ? state.bay02Mode
        : bay === "03"
        ? state.bay03Mode
        : bay === "04"
        ? state.bay04Mode
        : "")
  );
  const mappedFamily =
    bay === "03" && sub === "separation"
      ? state.s3?.use_falkner_skan
        ? "falkner_skan"
        : "bl_separation"
      : BAY_SUB_TO_FAMILY[`${bay}:${sub}`];

  const candidateFamily = pq?.family || eventPayload?.family || mappedFamily || "kinematics_equation";
  const family = VALID_PHYSICS_FAMILIES.has(candidateFamily)
    ? candidateFamily
    : mappedFamily || "kinematics_equation";
  const meta = FAMILY_FALLBACK_META[family] || FAMILY_FALLBACK_META.kinematics_equation;

  const rawConf = Number(pq?.confidence);
  const confidence = Number.isFinite(rawConf) ? Math.max(0, Math.min(1, rawConf)) : 1.0;

  const srcAssumptions =
    pq?.assumptions && typeof pq.assumptions === "object" && !Array.isArray(pq.assumptions)
      ? pq.assumptions
      : state.assumptions;
  const assumptions = {};
  for (const [k, v] of Object.entries(srcAssumptions || {})) {
    assumptions[k] = Boolean(v);
  }

  const rawParams =
    pq?.params && typeof pq.params === "object" && !Array.isArray(pq.params)
      ? pq.params
      : eventPayload?.payload && typeof eventPayload.payload === "object" && !Array.isArray(eventPayload.payload)
      ? eventPayload.payload
      : {};

  const rawObstacles =
    Array.isArray(pq?.obstacles)
      ? pq.obstacles
      : Array.isArray(eventPayload?.obstacles)
      ? eventPayload.obstacles
      : Array.isArray(rawParams?.obstacles)
      ? rawParams.obstacles
      : [];

  return {
    family,
    confidence,
    parser_mode: String(pq?.parser_mode || "").trim() || "live_lab",
    assumptions,
    params: { ...rawParams },
    obstacles: sanitizeObstacles(rawObstacles),
    concept_twist: String(pq?.concept_twist || "").trim() || meta.concept_twist,
    broken_shortcut: String(pq?.broken_shortcut || "").trim() || meta.broken_shortcut,
    textbook_ref: String(pq?.textbook_ref || "").trim() || meta.textbook_ref,
    unsupported_reason: pq?.unsupported_reason ?? null,
    raw_query:
      String(pq?.raw_query || "").trim() ||
      `Live ${family.replaceAll("_", " ")} (${meta.textbook_ref})`,
  };
}

bus.on("solver:updated", (eventPayload = {}) => {
  const parsedQuery = buildParsedQueryFallback(eventPayload);
  state.activeCoachContext = {
    parsedQuery,
    solverData: eventPayload?.solverData ?? null,
    suggestedPrompt: String(eventPayload?.suggestedPrompt || ""),
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
  const nextIdx = idx + delta;
  if (nextIdx < 0 || nextIdx >= LAB_CATALOG.length) return;
  const target = LAB_CATALOG[nextIdx];
  openLab(target.bay, target.sub);
};

const prevBtn = document.getElementById("btnPrevLab");
if (prevBtn) prevBtn.onclick = () => stepLab(-1);
const nextBtn = document.getElementById("btnNextLab");
if (nextBtn) nextBtn.onclick = () => stepLab(1);

let activeLesson = null;

const LESSON_FACTORIES = {
  "02:kinematics": createLab2aLesson,
  "02:vortex": createLab2bLesson,
  "02:vessel": createLab2cLesson,
  "02:potential": createLab2dLesson,
};

const openLessonBtn = document.getElementById("btnOpenLesson");
if (openLessonBtn) {
  openLessonBtn.onclick = () => {
    const active = getActiveLabEntry();
    const key = `${active.bay}:${active.sub}`;
    const factory = LESSON_FACTORIES[key];
    if (factory) {
      activeLesson = factory();
      activeLesson.open(makeBayCtx());
    } else {
      const title = active.label || `Lab ${active.id}`;
      alert(`Guided lesson for "${title}" is coming soon! Try the lessons for Labs 2A, 2B, 2C, and 2D.`);
    }
  };
}

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
