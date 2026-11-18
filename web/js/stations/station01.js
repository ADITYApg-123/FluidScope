/**
 * Station 01: AI Text-to-Visual Translator & Solver-Grounded Doubt Coach.
 * Wave 1 Agent C upgrade: kinematics_equation classification truth sync + assumptionCauses,
 * fluidscope_llm_cfg persistence, rich KaTeX Doubt Coach UI with Grounded Telemetry Facts
 * and 3 contextual prompt chips, complete ParsedPhysicsQuery solver:updated emission,
 * lab:navigate routing (preserving falkner_skan), and >= 12px typography throughout.
 */
import { bus, loadLLMConfig, persistLLMConfig } from "../core/store.js";
import { fmtNum } from "../core/color_scales.js";
import { formatRichText, renderTex } from "../math_ui.js";
import { displaySolvedFamily } from "./scene_mapper.js";

const SAMPLE_PROMPTS = [
  {
    label: "Ex 3.10 Equation",
    text: "Compare streamline, pathline and streakline for unsteady velocity u = x/(t + t0), v = v0 at t0 = 1, t = 2",
  },
  {
    label: "Hydraulic Jump",
    text: "A 6.1 m wide rectangular apron carries 11.32 m^3/s of water at 6.1 m/s and forms a hydraulic jump.",
  },
  {
    label: "Splitter LBM Wake",
    text: "Simulate 2D flow past a circular cylinder with a horizontal splitter plate behind it at Re = 110",
  },
  {
    label: "Forced Vortex Trap",
    text: "Check Bernoulli trap in a forced vortex with omega = 12 between inner radius 0.1 m and outer radius 0.4 m",
  },
  {
    label: "3D Impeller (Limit Test)",
    text: "Compute 3D supersonic oblique shock inside a centrifugal compressor impeller blade passage",
  },
];

const COACH_PROMPT_CHIPS = [
  "Why did Bernoulli fail?",
  "Check this shortcut trap",
  "Show exact governing formula",
];

const FAMILY_TO_LAB = {
  kinematics_equation: ["02", "kinematics"],
  vortex_flow: ["02", "vortex"],
  rotating_vessel: ["02", "vessel"],
  potential_superposition: ["02", "potential"],
  bl_separation: ["03", "separation"],
  falkner_skan: ["03", "separation"],
  couette_poiseuille: ["03", "couette"],
  two_layer_poiseuille: ["03", "twolayer"],
  slip_herschel_bulkley: ["03", "slip_hb"],
  lbm_tunnel: ["04", "lbm"],
  hydraulic_jump: ["04", "jump"],
  sudden_expansion: ["04", "expansion"],
  accelerating_tank: ["04", "tank"],
};

const FAMILY_AUDIT_CTX = {
  vortex_flow: "radial_euler",
  hydraulic_jump: "specific_force",
  accelerating_tank: "frame_g_eff",
  bl_separation: "boundary_layer",
  falkner_skan: "boundary_layer",
};

const VALID_FAMILIES = new Set([
  ...Object.keys(FAMILY_TO_LAB),
  "unsupported_3d",
]);

function esc(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function fmt(v, d = 3) {
  if (v === null || v === undefined || v === "") return "-";
  return fmtNum(v, d);
}

function clampNegZeroText(str) {
  return String(str ?? "").replace(/(^|[\s=:(\[,])-0\.(0+)(?!\d)/g, "$10.$2");
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

function clampNum(v, lo, hi, def) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(lo, Math.min(hi, n));
}

function sanitizeParsedQuery(parsed, state) {
  if (!parsed || typeof parsed !== "object") return null;
  const family = VALID_FAMILIES.has(parsed.family) ? parsed.family : "kinematics_equation";
  const cleanAssumptions = {};
  const srcA =
    parsed.assumptions && typeof parsed.assumptions === "object" && !Array.isArray(parsed.assumptions)
      ? parsed.assumptions
      : state.assumptions;
  for (const [k, v] of Object.entries(srcA || {})) {
    cleanAssumptions[String(k)] = Boolean(v);
  }
  const obstacles = Array.isArray(parsed.obstacles)
    ? parsed.obstacles
        .filter((o) => o && typeof o === "object" && ["circle", "rect", "splitter", "step"].includes(o.type))
        .map((o) => ({
          type: o.type,
          x: clampNum(o.x, 0.02, 0.95, 0.25),
          y: clampNum(o.y, 0.05, 0.95, 0.5),
          r: clampNum(o.r, 0.03, 0.35, 0.1),
          x0: clampNum(o.x0, 0.02, 0.95, 0.3),
          y0: clampNum(o.y0, 0.02, 0.95, 0.45),
          x1: clampNum(o.x1, 0.05, 0.98, 0.55),
          y1: clampNum(o.y1, 0.05, 0.98, 0.55),
        }))
    : [];
  const conf = Number(parsed.confidence);
  return {
    family,
    confidence: Number.isFinite(conf) ? Math.max(0, Math.min(1, conf)) : 0.9,
    parser_mode: String(parsed.parser_mode || "").trim() || "offline_deterministic",
    assumptions: cleanAssumptions,
    params:
      parsed.params && typeof parsed.params === "object" && !Array.isArray(parsed.params)
        ? { ...parsed.params }
        : {},
    obstacles,
    concept_twist:
      String(parsed.concept_twist || "").trim() ||
      `Physics diagnosis for ${family.replaceAll("_", " ")}.`,
    broken_shortcut:
      String(parsed.broken_shortcut || "").trim() ||
      "Verify hidden textbook assumptions before applying simplified formulas.",
    textbook_ref:
      String(parsed.textbook_ref || "").trim() || "Som, Biswas & Chakraborty (3rd Ed.)",
    unsupported_reason: parsed.unsupported_reason ? String(parsed.unsupported_reason) : null,
    raw_query: String(parsed.raw_query || "").trim() || state.s1?.text || "",
  };
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

function syncAssumptionsFromSolver(parsed, solverData, state) {
  Object.assign(
    state.assumptions,
    {
      steady: true,
      incompressible: true,
      inviscid: true,
      irrotational: true,
      no_slip: true,
      newtonian: true,
      inertial_frame: true,
      adverse_pressure_gradient: false,
      irreversible_jump: false,
    },
    parsed?.assumptions || {}
  );

  // Override classification flags directly from solver_data.classification whenever present
  if (solverData?.classification && typeof solverData.classification === "object") {
    const cls = solverData.classification;
    const pr = solverData.point_probe || {};
    if (cls.steady !== undefined) state.assumptions.steady = Boolean(cls.steady);
    if (cls.incompressible !== undefined) {
      state.assumptions.incompressible = Boolean(cls.incompressible);
    }
    if (cls.irrotational !== undefined) {
      state.assumptions.irrotational = Boolean(cls.irrotational);
    }
    if (parsed && typeof parsed === "object") {
      parsed.assumptions = {
        ...(parsed.assumptions || {}),
        steady: state.assumptions.steady,
        incompressible: state.assumptions.incompressible,
        irrotational: state.assumptions.irrotational,
      };
    }
    state.assumptionCauses = {
      steady: state.assumptions.steady ? "∂V/∂t = 0" : "∂V/∂t ≠ 0",
      incompressible:
        pr.divergence !== null && pr.divergence !== undefined
          ? `∇·V = ${fmt(pr.divergence, 3)} s⁻¹`
          : state.assumptions.incompressible
          ? "∇·V = 0.000 s⁻¹"
          : "∇·V ≠ 0",
      irrotational:
        pr.vorticity_z !== null && pr.vorticity_z !== undefined
          ? `Ωz = ${fmt(pr.vorticity_z, 3)} s⁻¹`
          : state.assumptions.irrotational
          ? "Ωz = 0.000 s⁻¹"
          : "Ωz ≠ 0",
    };
  } else if (parsed?.family === "vortex_flow" && solverData) {
    const irrot = Boolean(solverData.bernoulli_globally_valid);
    state.assumptions.irrotational = irrot;
    if (parsed.assumptions) parsed.assumptions.irrotational = irrot;
    state.assumptionCauses = {
      steady: "∂V/∂t = 0",
      incompressible: "∇·V = 0.000 s⁻¹",
      irrotational: irrot
        ? "Ωz = 0.000 s⁻¹ (r > 0)"
        : `Ωz = ${fmt(solverData.probes?.vorticity_r1 ?? 2 * (parsed.params?.omega || 0), 3)} s⁻¹`,
    };
  } else if (parsed?.family === "rotating_vessel" && solverData) {
    state.assumptions.irrotational = false;
    state.assumptionCauses = {
      steady: "∂V/∂t = 0",
      incompressible: "∇·V = 0.000 s⁻¹",
      irrotational: `Ωz = ${fmt(2 * (solverData.omega || 0), 3)} s⁻¹`,
    };
  } else {
    state.assumptionCauses = {
      steady: state.assumptions.steady ? "∂V/∂t = 0" : "∂V/∂t ≠ 0",
      incompressible: state.assumptions.incompressible ? "∇·V = 0.000 s⁻¹" : "∇·V ≠ 0",
      irrotational: state.assumptions.irrotational ? "Ωz = 0.000 s⁻¹" : "Ωz ≠ 0",
    };
  }
}

export function renderStation01(ctx) {
  const {
    state,
    apiPost,
    renderRockers,
    refreshAudit,
    setConceptBanner,
    clearSecondaryControls,
    setDrawerMetrics,
    setDrawerCards,
    openLab,
  } = ctx;

  const activeBus = ctx.bus || bus;
  clearSecondaryControls();
  state.llmConfig = loadLLMConfig();

  if (!state.s1) {
    state.s1 = {
      text: SAMPLE_PROMPTS[0].text,
      lastParsed: null,
      lastSolverData: null,
      lastCoach: null,
    };
  }

  const host = document.getElementById("bayControls");
  host.innerHTML = `
    <section class="panel-bay">
      <div class="bay-header">
        <span>AI Problem Translator</span>
        <span class="tag-mono" style="font-size:12px;">Neuro-Symbolic</span>
      </div>
      <div class="preset-row" id="s1Samples"></div>
      <div class="field-group">
        <div class="field-label-row" style="font-size:12px;"><span>Paste Exam Question, u/v Equation, or 2D Shape</span></div>
        <textarea class="text-input" id="txtProblem" rows="4" style="resize:vertical;line-height:1.45;font-size:13px;"></textarea>
      </div>
      <button type="button" class="btn-machined btn-primary" id="btnParseSolve" style="width:100%;font-size:12.5px;">Translate &amp; Visualize Physics</button>
      <div id="s1ParsedCard"></div>
    </section>

    <section class="panel-bay">
      <div class="bay-header">
        <span>Solver-Grounded Doubt Coach</span>
        <span class="coach-provider-badge" id="s1CoachModeTag">${esc(formatProviderLabel(state.llmConfig.provider))}</span>
      </div>
      <div class="coach-chips-row" id="s1CoachChips" role="group" aria-label="Quick Coach Prompts"></div>
      <div class="field-group">
        <input class="text-input" id="txtDoubt" style="font-size:13px;" placeholder="Ask: Why didn't Bernoulli or streamlines match?" value="Why didn't the naive shortcut hold here?" />
      </div>
      <button type="button" class="btn-machined" id="btnAskCoach" style="width:100%;font-size:12.5px;">Ask Coach (Grounded to Residuals)</button>
      <details class="s1-llm-config" id="s1LlmConfigDetails">
        <summary class="s1-llm-summary" id="s1LlmSummary">AI Engine Settings (${esc(formatProviderLabel(state.llmConfig.provider))})</summary>
        <div class="s1-llm-body">
          <div class="field-group">
            <div class="field-label-row" style="font-size:12px;"><span>Provider Mode</span></div>
            <select class="select-input" id="s1SelLlmProv" style="font-size:12.5px;">
              <option value="offline">Offline Deterministic (No Key)</option>
              <option value="gemini">Google Gemini (google-genai)</option>
              <option value="openai_compatible">OpenAI / Groq / Ollama REST</option>
            </select>
          </div>
          <div class="field-group">
            <div class="field-label-row" style="font-size:12px;"><span>Model Name</span></div>
            <input class="text-input" id="s1InLlmModel" style="font-size:12.5px;" placeholder="gemini-2.5-flash / gpt-4o-mini" />
          </div>
          <div class="field-group">
            <div class="field-label-row" style="font-size:12px;"><span>API Key (Optional / Env var)</span></div>
            <input type="password" class="text-input" id="s1InLlmKey" style="font-size:12.5px;" placeholder="Optional key..." />
          </div>
          <div class="field-group">
            <div class="field-label-row" style="font-size:12px;"><span>Base URL</span></div>
            <input class="text-input" id="s1InLlmUrl" style="font-size:12.5px;" placeholder="https://api.openai.com/v1" />
          </div>
          <button type="button" class="btn-machined btn-primary" id="s1SaveLlmBtn" style="font-size:12px;">Save AI Settings</button>
        </div>
      </details>
      <div id="s1CoachReply" class="coach-reply-area"></div>
    </section>
  `;

  const syncTopAiBadge = () => {
    const badge = document.getElementById("aiEngineBadge");
    if (badge) {
      badge.textContent =
        state.llmConfig.provider === "offline"
          ? "AI: Offline"
          : `AI: ${String(state.llmConfig.provider || "").toUpperCase()}`;
    }
    const tag = document.getElementById("s1CoachModeTag");
    if (tag) tag.textContent = formatProviderLabel(state.llmConfig.provider);
    const sum = document.getElementById("s1LlmSummary");
    if (sum) sum.textContent = `AI Engine Settings (${formatProviderLabel(state.llmConfig.provider)})`;
  };

  const selProv = document.getElementById("s1SelLlmProv");
  const inModel = document.getElementById("s1InLlmModel");
  const inKey = document.getElementById("s1InLlmKey");
  const inUrl = document.getElementById("s1InLlmUrl");
  const saveCfgBtn = document.getElementById("s1SaveLlmBtn");
  if (selProv) selProv.value = state.llmConfig.provider || "offline";
  if (inModel) inModel.value = state.llmConfig.model || "";
  if (inKey) inKey.value = state.llmConfig.api_key || "";
  if (inUrl) inUrl.value = state.llmConfig.base_url || "https://api.openai.com/v1";

  const saveLlmFromUi = () => {
    state.llmConfig = persistLLMConfig({
      provider: selProv?.value || "offline",
      api_key: inKey?.value || "",
      model: inModel?.value || "",
      base_url: inUrl?.value || "https://api.openai.com/v1",
    });
    syncTopAiBadge();
  };
  if (selProv) selProv.onchange = saveLlmFromUi;
  if (saveCfgBtn) saveCfgBtn.onclick = saveLlmFromUi;

  const txtProblemEl = document.getElementById("txtProblem");
  if (txtProblemEl) txtProblemEl.value = state.s1.text;

  const smp = document.getElementById("s1Samples");
  if (smp) {
    SAMPLE_PROMPTS.forEach((sp) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn-machined";
      b.style.fontSize = "12px";
      b.textContent = sp.label;
      b.onclick = () => {
        const tp = document.getElementById("txtProblem");
        if (tp) tp.value = sp.text;
        state.s1.text = sp.text;
        runParseAndSolve();
      };
      smp.appendChild(b);
    });
  }

  const renderParsedCard = (parsed) => {
    const card = document.getElementById("s1ParsedCard");
    if (!parsed || !card) return;
    const unsupported = parsed.family === "unsupported_3d";
    card.innerHTML = "";
    const cell = document.createElement("div");
    cell.className = "diag-cell";
    cell.style.marginTop = "8px";
    cell.style.borderColor = unsupported ? "var(--coral-border)" : "var(--accent-border)";

    const addDiv = (cls, txt, css = "") => {
      if (!txt) return;
      const el = document.createElement("div");
      if (cls) el.className = cls;
      if (css) el.style.cssText = css;
      el.textContent = txt;
      cell.appendChild(el);
    };

    addDiv("diag-key", `Routed Solver (${parsed.parser_mode || "deterministic"})`, "font-size:12px;");
    addDiv(`diag-val ${unsupported ? "coral" : "accent"}`, String(parsed.family || "").replaceAll("_", " "), "font-size:14px;");
    addDiv("", parsed.concept_twist || "", "font-size:12.5px;margin-top:4px;color:var(--ink-primary);line-height:1.45;");
    addDiv("", parsed.broken_shortcut || "", "font-size:12px;margin-top:4px;color:var(--coral-ink);line-height:1.4;");
    addDiv("", parsed.textbook_ref || "", "font-size:12px;margin-top:4px;color:var(--ink-muted);");
    if (parsed.unsupported_reason) {
      addDiv("warning-line", parsed.unsupported_reason, "margin-top:6px;font-size:12px;");
    }

    const labTarget = FAMILY_TO_LAB[parsed.family];
    if (labTarget) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn-machined btn-primary";
      btn.id = "btnOpenLiveLab";
      btn.style.cssText = "margin-top:8px;width:100%;font-size:12px;";
      btn.textContent = "Open in Live Lab \u2192";
      btn.onclick = () => {
        if (parsed.family === "falkner_skan" && state.s3) {
          state.s3.use_falkner_skan = true;
          const bVal = Number(parsed.params?.beta);
          if (Number.isFinite(bVal)) state.s3.beta_fs = bVal;
        }
        const navPayload = sanitizeParsedQuery(parsed, state) || parsed;
        if (activeBus && typeof activeBus.emit === "function") {
          activeBus.emit("lab:navigate", {
            bay: labTarget[0],
            mode: labTarget[1],
            payload: navPayload,
            autoSolve: true,
          });
        } else if (typeof openLab === "function") {
          openLab(labTarget[0], labTarget[1]);
        }
      };
      cell.appendChild(btn);
    }

    card.appendChild(cell);
  };

  const renderCoachReply = (reply) => {
    const box = document.getElementById("s1CoachReply");
    if (!box) return;
    if (!reply) {
      box.innerHTML = "";
      return;
    }
    box.innerHTML = "";
    const cell = document.createElement("div");
    cell.className = "diag-cell";
    cell.style.marginTop = "8px";

    const provRow = document.createElement("div");
    provRow.className = "coach-provider-row";

    const provBadge = document.createElement("span");
    provBadge.className = "coach-provider-badge";
    provBadge.textContent = formatProviderLabel(reply.provider_used || state.llmConfig.provider);
    provRow.appendChild(provBadge);

    if (reply.textbook_citation) {
      const cite = document.createElement("span");
      cite.className = "coach-citation-text";
      cite.textContent = reply.textbook_citation;
      provRow.appendChild(cite);
    }

    const ans = document.createElement("div");
    ans.className = "coach-answer-body";
    ans.style.cssText = "margin-top:8px;color:var(--ink-primary);font-size:12.5px;line-height:1.58;";
    applyRichAndKatex(ans, clampNegZeroText(reply.answer || ""));

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
      li.textContent = "No numerical telemetry facts returned for this scope.";
      ul.appendChild(li);
    }
    details.appendChild(ul);

    cell.appendChild(provRow);
    cell.appendChild(ans);
    cell.appendChild(details);
    box.appendChild(cell);
  };

  const applyParsedBannerAndCards = (parsed) => {
    if (!parsed) return;
    if (parsed.family !== "unsupported_3d") {
      if (parsed.concept_twist && setConceptBanner) {
        setConceptBanner(
          `<strong>AI Routed Diagnosis (${esc(parsed.family.replaceAll("_", " "))}):</strong> ${esc(parsed.concept_twist)}`,
          parsed.broken_shortcut
            ? `Broken Shortcut: ${esc(parsed.broken_shortcut)}${parsed.textbook_ref ? " (" + esc(parsed.textbook_ref) + ")" : ""}`
            : "Inspect verified equations and flow lines.",
          parsed.broken_shortcut ? "trap" : "insight"
        );
      }
      const grid = document.querySelector("#drawerBody .diag-grid");
      if (grid) {
        const extraCards = [
          { k: "AI Concept Twist", v: parsed.concept_twist, tone: "amber" },
          { k: "Shortcut Trap", v: parsed.broken_shortcut, tone: "coral" },
        ];
        if (parsed.textbook_ref) {
          extraCards.push({ k: "Textbook Citation", v: parsed.textbook_ref });
        }
        for (const c of extraCards) {
          if (!c.v) continue;
          const cell = document.createElement("div");
          cell.className = "diag-cell";
          const kEl = document.createElement("div");
          kEl.className = "diag-key";
          kEl.style.fontSize = "12px";
          kEl.textContent = c.k;
          const vEl = document.createElement("div");
          vEl.className = `diag-val ${c.tone || ""}`;
          vEl.style.fontSize = "12.5px";
          vEl.textContent = c.v;
          cell.appendChild(kEl);
          cell.appendChild(vEl);
          grid.appendChild(cell);
        }
      }
    } else {
      setDrawerMetrics([{ k: "Scope", v: "Outside 2D/1D", color: "var(--coral)" }]);
      setDrawerCards([
        { k: "Honest Gap Notice", v: parsed.unsupported_reason || "Outside built 2D/1D solvers", tone: "coral" },
      ]);
    }
  };

  const emitSolverUpdated = (parsed, solverData) => {
    if (!activeBus || typeof activeBus.emit !== "function" || !parsed) return;
    const validParsed = sanitizeParsedQuery(parsed, state);
    if (!validParsed) return;
    const labTarget = FAMILY_TO_LAB[validParsed.family];
    activeBus.emit("solver:updated", {
      bay: labTarget?.[0] || "01",
      sub: labTarget?.[1] || "translator",
      family: validParsed.family,
      payload: validParsed.params,
      parsedQuery: validParsed,
      solverData: solverData ?? null,
      suggestedPrompt: state.s1?.text || validParsed.raw_query,
    });
  };

  const runCoach = async (overrideQ = null) => {
    const qEl = document.getElementById("txtDoubt");
    const box = document.getElementById("s1CoachReply");
    if (!qEl || !box) return;
    if (overrideQ) qEl.value = overrideQ;
    const q = qEl.value.trim();
    if (!q) return;

    state.llmConfig = loadLLMConfig();
    box.innerHTML = `<div class="diag-cell" style="margin-top:8px;color:var(--ink-secondary);font-size:12px;">Reading active solver residuals...</div>`;
    try {
      const reply = await apiPost(
        "/api/coach",
        {
          question: q,
          parsed: sanitizeParsedQuery(state.s1.lastParsed, state),
          solver_data: state.s1.lastSolverData,
          llm_config: state.llmConfig,
        },
        "coach"
      );
      state.s1.lastCoach = reply;
      renderCoachReply(reply);
    } catch (err) {
      if (err?.name === "AbortError") return;
      box.innerHTML = `<div class="warning-line" style="margin-top:8px;font-size:12px;">Coach error: ${esc(err?.message || String(err))}</div>`;
    }
  };

  const chipsHost = document.getElementById("s1CoachChips");
  if (chipsHost) {
    COACH_PROMPT_CHIPS.forEach((chipText) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "coach-chip-btn";
      btn.textContent = chipText;
      btn.onclick = () => runCoach(chipText);
      chipsHost.appendChild(btn);
    });
  }

  const runParseAndSolve = async () => {
    const raw = document.getElementById("txtProblem")?.value.trim() || "";
    if (!raw) return;
    state.s1.text = raw;
    state.llmConfig = loadLLMConfig();
    const hud = document.getElementById("flowProbeHud");
    if (hud) hud.textContent = "Translating text \u2192 exact solver kernel...";
    try {
      const out = await apiPost(
        "/api/parse_and_solve",
        {
          text: raw,
          llm_config: state.llmConfig,
        },
        "activeLab"
      );
      state.s1.lastParsed = out.parsed;
      state.s1.lastSolverData = out.solver_data;

      syncAssumptionsFromSolver(out.parsed, out.solver_data, state);
      renderRockers();
      const auditCtx = FAMILY_AUDIT_CTX[out.parsed?.family] || "ns_x";
      await refreshAudit(auditCtx);

      renderParsedCard(out.parsed);
      displaySolvedFamily(out.parsed.family, out.solver_data, ctx);
      applyParsedBannerAndCards(out.parsed);
      emitSolverUpdated(out.parsed, out.solver_data);
      await runCoach();
    } catch (err) {
      if (err?.name === "AbortError") return;
      const errHud = document.getElementById("flowProbeHud");
      if (errHud) errHud.textContent = `Parse/solve error: ${err?.message || String(err)}`;
    }
  };

  document.getElementById("btnParseSolve").onclick = runParseAndSolve;
  document.getElementById("btnAskCoach").onclick = () => runCoach();

  if (state.s1.lastParsed) {
    syncAssumptionsFromSolver(state.s1.lastParsed, state.s1.lastSolverData, state);
    renderRockers();
    const auditCtx = FAMILY_AUDIT_CTX[state.s1.lastParsed?.family] || "ns_x";
    refreshAudit(auditCtx);
    renderParsedCard(state.s1.lastParsed);
    displaySolvedFamily(state.s1.lastParsed.family, state.s1.lastSolverData, ctx);
    applyParsedBannerAndCards(state.s1.lastParsed);
    emitSolverUpdated(state.s1.lastParsed, state.s1.lastSolverData);
    renderCoachReply(state.s1.lastCoach);
  } else {
    runParseAndSolve();
  }
}
