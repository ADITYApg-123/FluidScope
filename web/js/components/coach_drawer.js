/**
 * Omnipresent Slide-Over Doubt Coach Drawer (#coachDrawerHost).
 * Grounded strictly to active solver residuals across Labs 2A-4D, AI Translator, and post-submit Quiz 05.
 */
import { ROCKER_DEFS, bus, loadLLMConfig, state } from "../core/store.js";
import { formatRichText, renderTex } from "../math_ui.js";

const VALID_FAMILIES = new Set([
  "kinematics_equation",
  "vortex_flow",
  "rotating_vessel",
  "potential_superposition",
  "falkner_skan",
  "bl_separation",
  "couette_poiseuille",
  "two_layer_poiseuille",
  "slip_herschel_bulkley",
  "hydraulic_jump",
  "sudden_expansion",
  "accelerating_tank",
  "lbm_tunnel",
  "unsupported_3d",
]);

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

const ENDPOINT_TO_FAMILY = {
  "/api/kinematics": "kinematics_equation",
  "/api/vortex": "vortex_flow",
  "/api/vessel": "rotating_vessel",
  "/api/potential": "potential_superposition",
  "/api/falkner_skan": "falkner_skan",
  "/api/bl_separation": "bl_separation",
  "/api/couette_poiseuille": "couette_poiseuille",
  "/api/two_layer": "two_layer_poiseuille",
  "/api/slip_hb": "slip_herschel_bulkley",
  "/api/hydraulic_jump": "hydraulic_jump",
  "/api/sudden_expansion": "sudden_expansion",
  "/api/accel_tank": "accelerating_tank",
  "/api/lbm_tunnel": "lbm_tunnel",
};

const FAMILY_META = {
  kinematics_equation: {
    label: "Equation Flow (Kinematics)",
    concept_twist: "Unsteady velocity separates streamline, pathline, and streakline; nonzero divergence violates incompressibility.",
    broken_shortcut: "Assuming streamlines match trajectories or streaklines when ∂V/∂t ≠ 0.",
    textbook_ref: "Som, Biswas & Chakraborty Ch. 3.3.3 (Example 3.10)",
  },
  vortex_flow: {
    label: "Vortex Flow & Bernoulli Trap",
    concept_twist: "Radial pressure balances centrifugal acceleration; Bernoulli applies across streamlines only when Ωz = 0.",
    broken_shortcut: "Applying constant-head Bernoulli across streamlines inside a rotational forced vortex.",
    textbook_ref: "Som, Biswas & Chakraborty Ch. 4.5 (Eq. 4.43–4.60)",
  },
  rotating_vessel: {
    label: "Open Rotating Vessel (Ex. 4.8)",
    concept_twist: "Open rotating cylinder spills liquid at the top rim before uncovering a dry center base.",
    broken_shortcut: "Assuming trapped liquid volume equals initial fill volume once the paraboloid hits the rim.",
    textbook_ref: "Som, Biswas & Chakraborty Ch. 4.5 (Example 4.8)",
  },
  potential_superposition: {
    label: "Magnus Cylinder & Potential Flow",
    concept_twist: "Superposing uniform stream, doublet, and circulation generates Kutta–Joukowski lift with zero inviscid drag.",
    broken_shortcut: "Expecting stagnation points to stay on the cylinder surface when |Γ| > 4πU∞a.",
    textbook_ref: "Som, Biswas & Chakraborty Ch. 7 (Potential Flow & Magnus Effect)",
  },
  falkner_skan: {
    label: "Falkner–Skan Wedge Boundary Layer",
    concept_twist: "Adverse Hartree β < 0 forces positive wall curvature and an inflection point ahead of separation at β ≈ -0.1988.",
    broken_shortcut: "Using Blasius flat-plate friction when streamwise pressure gradient β ≠ 0.",
    textbook_ref: "Som, Biswas & Chakraborty Ch. 9.3 & 9.6 (Eq. 9.24, Fig. 9.6)",
  },
  bl_separation: {
    label: "Boundary-Layer Separation",
    concept_twist: "Adverse pressure gradient (dp/dx > 0) forces positive wall curvature and boundary-layer reversal past Λ = -12.",
    broken_shortcut: "Relying on inviscid potential flow (D'Alembert's paradox) which misses wake separation.",
    textbook_ref: "Som, Biswas & Chakraborty Ch. 9.6 (Eq. 9.41–9.42, Fig. 9.5)",
  },
  couette_poiseuille: {
    label: "Couette–Poiseuille Backflow",
    concept_twist: "Moving-wall shear competes with opposing pressure gradient, reversing wall shear for P < -1 and yielding Q = 0 at P = -3.",
    broken_shortcut: "Assuming a linear Couette profile when axial pressure gradient P ≠ 0.",
    textbook_ref: "Som, Biswas & Chakraborty Ch. 8.3 (Example 8.4, Eq. 8.42)",
  },
  two_layer_poiseuille: {
    label: "Two-Layer Immiscible Flow (Ex. 8.2)",
    concept_twist: "Shear stress continuity μ1(du1/dy) = μ2(du2/dy) forces a slope kink and off-center peak velocity.",
    broken_shortcut: "Equating velocity gradients du1/dy = du2/dy across unequal-viscosity layers.",
    textbook_ref: "Som, Biswas & Chakraborty Ch. 8.3 (Example 8.2)",
  },
  slip_herschel_bulkley: {
    label: "Navier Slip & Herschel–Bulkley Plug",
    concept_twist: "Yield stress creates a rigid plug core where |τ| ≤ τ_y while Navier wall slip shifts wall velocity upward.",
    broken_shortcut: "Applying classical no-slip Newtonian Poiseuille flow to slip or yield-stress fluids.",
    textbook_ref: "Som, Biswas & Chakraborty Ch. 1.6 & Ch. 8",
  },
  hydraulic_jump: {
    label: "Hydraulic Jump (Specific Force)",
    concept_twist: "Hydraulic jumps conserve specific force Fs rather than specific energy Es due to turbulent roller dissipation.",
    broken_shortcut: "Setting Es1 = Es2 across a jump and ignoring irreversible eddy head loss hj.",
    textbook_ref: "Som, Biswas & Chakraborty Ch. 12.4 (Example 12.11)",
  },
  sudden_expansion: {
    label: "Sudden Pipe Expansion (Borda–Carnot)",
    concept_twist: "Annular corner eddies keep shoulder pressure ~p1, creating irreversible Borda–Carnot head loss.",
    broken_shortcut: "Using lossless Bernoulli Δp = ½ρ(V1² - V2²) across an abrupt pipe enlargement.",
    textbook_ref: "Som, Biswas & Chakraborty Ch. 11.5 (Eq. 11.18–11.23)",
  },
  accelerating_tank: {
    label: "Accelerating / Free-Fall Tank",
    concept_twist: "Isobars align perpendicular to g_eff = g - a_frame; in free fall (az = -g), g_eff = 0 halts bottom orifice efflux.",
    broken_shortcut: "Using static Torricelli speed √(2gh) inside an accelerating or free-falling tank.",
    textbook_ref: "Som, Biswas & Chakraborty Ch. 2.9 (Eq. 2.86–2.88)",
  },
  lbm_tunnel: {
    label: "2D LBM Wake Tunnel",
    concept_twist: "Viscous D2Q9 flow sheds alternating Kármán vortices past bluff obstacles unless stabilized by a wake splitter.",
    broken_shortcut: "Assuming steady symmetric potential streamlines behind a cylinder at Re ~ 100.",
    textbook_ref: "Som, Biswas & Chakraborty Ch. 9.6 & Ch. 10",
  },
  unsupported_3d: {
    label: "Outside 2D/1D Scope",
    concept_twist: "3D compressible and turbomachinery flows fall outside built 2D/1D incompressible exact solvers.",
    broken_shortcut: "Extrapolating 2D incompressible Bernoulli across 3D shocks or blade passages.",
    textbook_ref: "Som, Biswas & Chakraborty Ch. 14 & Ch. 16",
  },
};

const PROMPT_CHIPS = [
  "Why did Bernoulli fail?",
  "Check this shortcut trap",
  "Show exact governing formula",
];

function esc(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function clampNegZeroText(str) {
  return String(str ?? "").replace(/(^|[\s=:(\[,])-0\.(0+)(?!\d)/g, "$10.$2");
}

function clampNum(v, lo, hi, def) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(lo, Math.min(hi, n));
}

function formatProviderLabel(rawProvider) {
  const key = String(rawProvider || "offline").toLowerCase().trim();
  if (key.includes("offline")) return "Offline Grounded Coach";
  if (key.includes("gemini")) return "Google Gemini Coach";
  if (key.includes("openai") || key.includes("groq") || key.includes("ollama")) {
    return "OpenAI-Compatible Coach";
  }
  return key.replaceAll("_", " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function sanitizeObstacles(raw) {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set(["circle", "rect", "splitter", "step"]);
  return raw
    .filter((o) => o && typeof o === "object" && allowed.has(o.type))
    .map((o) => ({
      type: o.type,
      x: clampNum(o.x, 0.02, 0.95, 0.25),
      y: clampNum(o.y, 0.05, 0.95, 0.5),
      r: clampNum(o.r, 0.03, 0.35, 0.1),
      x0: clampNum(o.x0, 0.02, 0.95, 0.3),
      y0: clampNum(o.y0, 0.02, 0.95, 0.45),
      x1: clampNum(o.x1, 0.05, 0.98, 0.55),
      y1: clampNum(o.y1, 0.05, 0.98, 0.55),
    }));
}

export function sanitizeParsedQuery(raw, fallbackFamily = null) {
  if (!raw || typeof raw !== "object") return null;
  const famCand = VALID_FAMILIES.has(raw.family) ? raw.family : fallbackFamily;
  const family = VALID_FAMILIES.has(famCand) ? famCand : "kinematics_equation";
  const meta = FAMILY_META[family] || FAMILY_META.kinematics_equation;

  const cleanAssumptions = {};
  const srcA = raw.assumptions && typeof raw.assumptions === "object" && !Array.isArray(raw.assumptions)
    ? raw.assumptions
    : state.assumptions;
  for (const [k, v] of Object.entries(srcA || {})) {
    cleanAssumptions[String(k)] = Boolean(v);
  }

  const conf = Number(raw.confidence);
  return {
    family,
    confidence: Number.isFinite(conf) ? Math.max(0, Math.min(1, conf)) : 0.95,
    parser_mode: String(raw.parser_mode || "").trim() || "live_lab",
    assumptions: cleanAssumptions,
    params:
      raw.params && typeof raw.params === "object" && !Array.isArray(raw.params)
        ? { ...raw.params }
        : {},
    obstacles: sanitizeObstacles(raw.obstacles),
    concept_twist: String(raw.concept_twist || "").trim() || meta.concept_twist,
    broken_shortcut: String(raw.broken_shortcut || "").trim() || meta.broken_shortcut,
    textbook_ref: String(raw.textbook_ref || "").trim() || meta.textbook_ref,
    unsupported_reason: raw.unsupported_reason ? String(raw.unsupported_reason) : null,
    raw_query: String(raw.raw_query || "").trim() || meta.label,
  };
}

function synthesizeContextFromState() {
  if (state.activeView === "01" && state.s1?.lastParsed) {
    return {
      parsed: sanitizeParsedQuery(state.s1.lastParsed),
      solverData: state.s1.lastSolverData ?? null,
    };
  }
  if (state.activeView === "05") {
    const twists = state.s5?.twists || [];
    const prob = twists[state.s5?.activeIndex || 0];
    if (prob && state.s5?.checked) {
      const fam = ENDPOINT_TO_FAMILY[prob.endpoint] || "kinematics_equation";
      return {
        parsed: sanitizeParsedQuery({
          family: fam,
          confidence: 1.0,
          parser_mode: "quiz_verified",
          assumptions: { ...state.assumptions },
          params: prob.payload || {},
          concept_twist: prob.options?.[prob.correct_index] || prob.title,
          broken_shortcut: prob.tempting_shortcut,
          textbook_ref: prob.book_ref,
          raw_query: prob.prompt,
        }),
        solverData: state.s5.lastSolvedData ?? null,
      };
    }
    return { parsed: null, solverData: null };
  }
  if (state.activeView === "labs") {
    const bay = state.activeBay || "02";
    const sub =
      bay === "02"
        ? state.bay02Mode
        : bay === "03"
        ? state.bay03Mode
        : state.bay04Mode;
    let fam = BAY_SUB_TO_FAMILY[`${bay}:${sub}`] || "kinematics_equation";
    if (bay === "03" && sub === "separation" && state.s3?.use_falkner_skan) {
      fam = "falkner_skan";
    }
    return {
      parsed: sanitizeParsedQuery({
        family: fam,
        confidence: 1.0,
        parser_mode: "live_lab",
        assumptions: { ...state.assumptions },
        params: {},
      }),
      solverData: state.activeCoachContext?.solverData ?? null,
    };
  }
  return { parsed: null, solverData: null };
}

function applyRichAndKatex(containerEl, rawText) {
  if (!containerEl) return;
  containerEl.innerHTML = formatRichText(rawText || "");
  if (typeof document.createTreeWalker !== "function" || typeof document.createDocumentFragment !== "function") {
    return;
  }
  const walker = document.createTreeWalker(containerEl, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) {
    if (!node.parentElement) continue;
    if (node.parentElement.closest?.("code, .katex, .coach-math-inline, .coach-math-display, .coach-math-fallback")) continue;
    if (node.nodeValue && node.nodeValue.includes("$")) {
      textNodes.push(node);
    }
  }
  for (const tn of textNodes) {
    const str = tn.nodeValue || "";
    const re = /\$\$([^$]+?)\$\$|\$([^\s$][^$\n]*?[^\s$]|[^\s$])\$/g;
    let lastIdx = 0;
    let match;
    let matchedAny = false;
    const frag = document.createDocumentFragment();
    while ((match = re.exec(str)) !== null) {
      const isDisplay = Boolean(match[1]);
      const tex = (match[1] ?? match[2] ?? "").trim();
      if (!tex || /^\d[\d,.\s]*$/.test(tex)) continue;
      matchedAny = true;
      if (match.index > lastIdx) {
        frag.appendChild(document.createTextNode(str.slice(lastIdx, match.index)));
      }
      const mathEl = document.createElement(isDisplay ? "div" : "span");
      mathEl.className = isDisplay ? "coach-math-block" : "coach-math-inline";
      renderTex(mathEl, tex, isDisplay);
      frag.appendChild(mathEl);
      lastIdx = re.lastIndex;
    }
    if (matchedAny) {
      if (lastIdx < str.length) {
        frag.appendChild(document.createTextNode(str.slice(lastIdx)));
      }
      tn.parentNode?.replaceChild(frag, tn);
    }
  }
}

function getBrokenAssumptionLabels(assumptions) {
  const src = assumptions && typeof assumptions === "object" ? assumptions : state.assumptions;
  const broken = [];
  for (const [key, label, , hazardFlag] of ROCKER_DEFS) {
    const val = Boolean(src[key]);
    const isBroken = hazardFlag ? val : !val;
    if (isBroken) {
      broken.push({ key, label: hazardFlag ? label : `Non-${label}` });
    }
  }
  return broken;
}

async function defaultApiPost(url, payload) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json.data;
}

export function initCoachDrawer(ctx = {}) {
  const host = document.getElementById("coachDrawerHost");
  if (!host) return;

  if (typeof host._coachCleanup === "function") {
    host._coachCleanup();
  }

  const activeBus = ctx.bus || bus;
  const postFn = ctx.apiPost || defaultApiPost;

  let currentParsed = sanitizeParsedQuery(state.activeCoachContext?.parsedQuery) || null;
  let currentSolverData = state.activeCoachContext?.solverData ?? null;
  let lastReply = null;

  const isQuizLocked = () => state.activeView === "05" && !state.s5?.checked;
  const isOpen = () =>
    host.classList.contains("open") || host.getAttribute("aria-hidden") === "false";

  const clearDrawerDom = () => {
    host.classList.remove("open");
    host.setAttribute("aria-hidden", "true");
    host.innerHTML = "";
  };

  const renderContextBox = () => {
    const ctxBox = host.querySelector("#coachDrawerContext");
    if (!ctxBox) return;

    if (isQuizLocked()) {
      ctxBox.innerHTML = `
        <div class="coach-quiz-lock-card">
          <strong>Predict First Mode Active:</strong> Select an option (A–D) and click
          <em>"Check Prediction &amp; Prove on Canvas"</em> to unlock solver-grounded coaching without spoilers.
        </div>
      `;
      return;
    }

    if (!currentParsed) {
      ctxBox.innerHTML = `
        <div class="coach-context-box">
          <div class="coach-context-family">No Active Solver Scenario</div>
          <div style="font-size:12px;color:var(--ink-secondary);line-height:1.45;">
            Run any Lab (2A–4D) or translate a problem in Station 01 to ground answers to exact residuals.
          </div>
        </div>
      `;
      return;
    }

    const meta = FAMILY_META[currentParsed.family] || {};
    const broken = getBrokenAssumptionLabels(currentParsed.assumptions);
    const chipsHtml = broken.length
      ? broken
          .map(
            (b) =>
              `<span class="coach-assumption-chip coach-chip-broken" data-assumption="${esc(b.key)}">${esc(b.label)}</span>`
          )
          .join("")
      : `<span class="coach-assumption-chip coach-chip-ok">All ideal assumptions hold</span>`;

    ctxBox.innerHTML = `
      <div class="coach-context-box">
        <div class="coach-context-header">
          <span class="coach-context-family">${esc(meta.label || currentParsed.family.replaceAll("_", " "))}</span>
          <span class="coach-citation-text">${esc(currentParsed.textbook_ref)}</span>
        </div>
        <div class="coach-assumption-chips" aria-label="Broken Physics Assumptions">${chipsHtml}</div>
        <div class="coach-context-trap"><strong>Shortcut Trap:</strong> ${esc(currentParsed.broken_shortcut)}</div>
      </div>
    `;
  };

  const renderReply = (reply) => {
    const replyEl = host.querySelector("#coachDrawerReply");
    if (!replyEl) return;
    if (!reply) {
      replyEl.innerHTML = "";
      return;
    }

    replyEl.innerHTML = "";
    const cell = document.createElement("div");
    cell.className = "diag-cell";

    const provRow = document.createElement("div");
    provRow.className = "coach-provider-row";

    const provBadge = document.createElement("span");
    provBadge.className = "coach-provider-badge";
    provBadge.textContent = formatProviderLabel(reply.provider_used);
    provRow.appendChild(provBadge);

    if (reply.textbook_citation) {
      const cite = document.createElement("span");
      cite.className = "coach-citation-text";
      cite.textContent = reply.textbook_citation;
      provRow.appendChild(cite);
    }

    const ansBody = document.createElement("div");
    ansBody.className = "coach-answer-body";
    ansBody.style.marginTop = "8px";
    applyRichAndKatex(ansBody, clampNegZeroText(reply.answer || ""));

    cell.appendChild(provRow);
    cell.appendChild(ansBody);

    const facts = Array.isArray(reply.grounded_facts) ? reply.grounded_facts : [];
    const details = document.createElement("details");
    details.className = "coach-facts-details";

    const summary = document.createElement("summary");
    summary.className = "coach-facts-summary";
    summary.textContent = "View Grounded Telemetry Facts";
    details.appendChild(summary);

    const ul = document.createElement("ul");
    ul.className = "coach-facts-list";
    if (facts.length) {
      for (const f of facts) {
        const li = document.createElement("li");
        li.textContent = clampNegZeroText(f);
        ul.appendChild(li);
      }
    } else {
      const li = document.createElement("li");
      li.textContent = "No numerical telemetry residuals returned for this scope.";
      ul.appendChild(li);
    }
    details.appendChild(ul);
    cell.appendChild(details);

    replyEl.appendChild(cell);
  };

  const ask = async (questionText) => {
    const replyEl = host.querySelector("#coachDrawerReply");
    if (!replyEl) return;
    if (isQuizLocked()) {
      renderContextBox();
      replyEl.innerHTML = `<div class="warning-line">Quiz prediction locked — submit A–D first to unlock solver-grounded coaching.</div>`;
      return;
    }

    if (!currentParsed) {
      const fallback = synthesizeContextFromState();
      currentParsed = fallback.parsed;
      currentSolverData = fallback.solverData;
      renderContextBox();
    }

    const validParsed = sanitizeParsedQuery(currentParsed);
    if (!validParsed) {
      replyEl.innerHTML = `<div class="warning-line">Solve or run a physics lab first so the Doubt Coach can anchor to exact solver residuals.</div>`;
      return;
    }

    const cfg = loadLLMConfig();
    state.llmConfig = cfg;

    replyEl.innerHTML = `<div class="diag-cell" style="color:var(--ink-secondary);font-size:12px;">Inspecting active solver residuals...</div>`;
    try {
      const reply = await postFn(
        "/api/coach",
        {
          question: questionText,
          parsed: validParsed,
          solver_data: currentSolverData,
          llm_config: cfg,
        },
        "coach"
      );
      lastReply = reply;
      renderReply(reply);
    } catch (err) {
      if (err?.name === "AbortError") return;
      replyEl.innerHTML = `<div class="warning-line">Coach error: ${esc(err?.message || String(err))}</div>`;
    }
  };

  const openDrawer = (payload = {}) => {
    const candidateParsed = payload?.parsedQuery || state.activeCoachContext?.parsedQuery;
    if (candidateParsed) {
      currentParsed = sanitizeParsedQuery(candidateParsed);
      currentSolverData =
        payload?.solverData ?? state.activeCoachContext?.solverData ?? currentSolverData;
    } else {
      const synth = synthesizeContextFromState();
      currentParsed = synth.parsed;
      currentSolverData = payload?.solverData ?? synth.solverData;
    }

    const cfg = loadLLMConfig();
    state.llmConfig = cfg;
    const defaultPrompt =
      payload?.suggestedPrompt || "Why doesn't the standard shortcut hold here?";

    host.classList.add("open");
    host.setAttribute("aria-hidden", "false");
    host.innerHTML = `
      <div class="coach-drawer-header">
        <span class="coach-drawer-title">Solver-Grounded Doubt Coach</span>
        <div class="coach-drawer-actions">
          <span class="coach-provider-badge" id="coachDrawerProviderBadge">${esc(formatProviderLabel(cfg.provider))}</span>
          <button type="button" class="coach-close-btn" id="coachDrawerClose" aria-label="Close Doubt Coach">&times;</button>
        </div>
      </div>
      <div id="coachDrawerContext"></div>
      <div class="coach-chips-row" id="coachDrawerChips" role="group" aria-label="Quick Coach Prompts"></div>
      <div class="field-group">
        <div class="field-label-row" style="font-size:12px;"><span>Ask a Conceptual Question</span></div>
        <textarea class="text-input" id="coachDrawerQuestion" rows="3" style="font-size:12.5px;line-height:1.45;">${esc(defaultPrompt)}</textarea>
      </div>
      <button type="button" class="btn-machined btn-primary" id="coachDrawerSubmit" style="font-size:12.5px;">Ask Coach (Grounded to Residuals)</button>
      <div id="coachDrawerReply" class="coach-drawer-reply"></div>
    `;

    renderContextBox();
    if (lastReply && !isQuizLocked()) {
      renderReply(lastReply);
    }

    const chipsHost = host.querySelector("#coachDrawerChips");
    if (chipsHost) {
      PROMPT_CHIPS.forEach((chipText) => {
        const chipBtn = document.createElement("button");
        chipBtn.type = "button";
        chipBtn.className = "coach-chip-btn";
        chipBtn.textContent = chipText;
        chipBtn.disabled = isQuizLocked();
        chipBtn.onclick = () => {
          const qInput = host.querySelector("#coachDrawerQuestion");
          if (qInput) qInput.value = chipText;
          ask(chipText);
        };
        chipsHost.appendChild(chipBtn);
      });
    }

    const closeBtn = host.querySelector("#coachDrawerClose");
    if (closeBtn) closeBtn.onclick = clearDrawerDom;

    const qEl = host.querySelector("#coachDrawerQuestion");
    const submitBtn = host.querySelector("#coachDrawerSubmit");
    const triggerSubmit = () => {
      const q = qEl?.value.trim() || "";
      if (q) return ask(q);
      return null;
    };
    if (submitBtn) {
      submitBtn.disabled = isQuizLocked();
      submitBtn.onclick = triggerSubmit;
    }
    if (qEl) {
      qEl.onkeydown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          triggerSubmit();
        }
      };
      try {
        qEl.focus({ preventScroll: true });
      } catch (_) {}
    }
  };

  const onCloseEvent = () => {
    lastReply = null;
    if (!state.activeCoachContext?.parsedQuery) {
      currentParsed = null;
      currentSolverData = null;
    }
    clearDrawerDom();
  };

  const onSolverUpdated = (payload = {}) => {
    const pq = payload?.parsedQuery || state.activeCoachContext?.parsedQuery || null;
    if (pq) {
      currentParsed = sanitizeParsedQuery(pq, payload?.family);
    }
    if (payload?.solverData !== undefined) {
      currentSolverData = payload.solverData;
    } else if (state.activeCoachContext?.solverData !== undefined) {
      currentSolverData = state.activeCoachContext.solverData;
    }
    if (isOpen()) {
      renderContextBox();
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape" && isOpen()) {
      clearDrawerDom();
    }
  };

  const unsubOpen = activeBus.on("coach:open", openDrawer);
  const unsubClose = activeBus.on("coach:close", onCloseEvent);
  const unsubSolver = activeBus.on("solver:updated", onSolverUpdated);
  document.addEventListener("keydown", onKeyDown);

  host._coachCleanup = () => {
    unsubOpen?.();
    unsubClose?.();
    unsubSolver?.();
    document.removeEventListener("keydown", onKeyDown);
  };
}
