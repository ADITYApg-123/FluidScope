/**
 * Station 01: AI Text-to-Visual Translator & Solver-Grounded Doubt Coach.
 */
import { formatRichText } from "../math_ui.js";
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

function esc(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
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

  clearSecondaryControls();

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
        <span class="tag-mono">Neuro-Symbolic</span>
      </div>
      <div class="preset-row" id="s1Samples"></div>
      <div class="field-group">
        <div class="field-label-row"><span>Paste Exam Question, u/v Equation, or 2D Shape</span></div>
        <textarea class="text-input" id="txtProblem" rows="4" style="resize:vertical;line-height:1.45;"></textarea>
      </div>
      <button class="btn-machined btn-primary" id="btnParseSolve" style="width:100%;">Translate &amp; Visualize Physics</button>
      <div id="s1ParsedCard"></div>
    </section>

    <section class="panel-bay">
      <div class="bay-header">
        <span>Solver-Grounded Doubt Coach</span>
        <span class="tag-mono" id="s1CoachModeTag">${esc(state.llmConfig.provider.toUpperCase())}</span>
      </div>
      <div class="field-group">
        <input class="text-input" id="txtDoubt" placeholder="Ask: Why didn't Bernoulli or streamlines match?" value="Why didn't the naive shortcut hold here?" />
      </div>
      <button class="btn-machined" id="btnAskCoach" style="width:100%;">Ask Coach (Grounded to Residuals)</button>
      <div id="s1CoachReply" class="coach-reply-area"></div>
    </section>
  `;

  const txtProblemEl = document.getElementById("txtProblem");
  txtProblemEl.value = state.s1.text;

  const smp = document.getElementById("s1Samples");
  SAMPLE_PROMPTS.forEach((sp) => {
    const b = document.createElement("button");
    b.className = "btn-machined";
    b.textContent = sp.label;
    b.onclick = () => {
      document.getElementById("txtProblem").value = sp.text;
      state.s1.text = sp.text;
      runParseAndSolve();
    };
    smp.appendChild(b);
  });

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

    addDiv("diag-key", `Routed Solver (${parsed.parser_mode || "deterministic"})`);
    addDiv(`diag-val ${unsupported ? "coral" : "accent"}`, String(parsed.family || "").replaceAll("_", " "));
    addDiv("", parsed.concept_twist || "", "font-size:12px;margin-top:4px;color:var(--ink-primary);line-height:1.45;");
    addDiv("", parsed.broken_shortcut || "", "font-size:11.5px;margin-top:4px;color:var(--coral);line-height:1.4;");
    addDiv("", parsed.textbook_ref || "", "font-size:11px;margin-top:4px;color:var(--ink-muted);");
    if (parsed.unsupported_reason) {
      addDiv("warning-line", parsed.unsupported_reason, "margin-top:6px;");
    }

    const labTarget = FAMILY_TO_LAB[parsed.family];
    if (labTarget && typeof openLab === "function") {
      const btn = document.createElement("button");
      btn.className = "btn-machined btn-xs";
      btn.style.marginTop = "8px";
      btn.style.width = "100%";
      btn.textContent = "Tune in Interactive Physics Lab \u2192";
      btn.onclick = () => openLab(labTarget[0], labTarget[1]);
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

    const key = document.createElement("div");
    key.className = "diag-key";
    key.textContent = `${String(reply.provider_used || "").toUpperCase()}${reply.textbook_citation ? " \u00b7 " + reply.textbook_citation : ""}`;

    const ans = document.createElement("div");
    ans.className = "coach-answer-body";
    ans.style.cssText = "margin-top:6px;color:var(--ink-primary);font-size:12.5px;line-height:1.55;";
    ans.innerHTML = formatRichText(reply.answer || "");

    cell.appendChild(key);
    cell.appendChild(ans);
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
            : ""
        );
      }
      // Append conceptual synthesis cards alongside displaySolvedFamily's quantitative solver cards
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
          kEl.textContent = c.k;
          const vEl = document.createElement("div");
          vEl.className = `diag-val ${c.tone || ""}`;
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

  const runCoach = async () => {
    const qEl = document.getElementById("txtDoubt");
    const box = document.getElementById("s1CoachReply");
    if (!qEl || !box) return;
    const q = qEl.value.trim();
    if (!q) return;
    box.innerHTML = `<div class="diag-cell" style="margin-top:8px;color:var(--ink-muted);font-size:12px;">Reading active solver residuals...</div>`;
    try {
      const reply = await apiPost(
        "/api/coach",
        {
          question: q,
          parsed: state.s1.lastParsed,
          solver_data: state.s1.lastSolverData,
          llm_config: state.llmConfig,
        },
        "coach"
      );
      state.s1.lastCoach = reply;
      renderCoachReply(reply);
    } catch (err) {
      if (err.name === "AbortError") return;
      box.innerHTML = `<div class="warning-line" style="margin-top:8px;">Coach error: ${esc(err.message)}</div>`;
    }
  };

  const runParseAndSolve = async () => {
    const raw = document.getElementById("txtProblem").value.trim();
    if (!raw) return;
    state.s1.text = raw;
    document.getElementById("flowProbeHud").textContent = "Translating text \u2192 exact solver kernel...";
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
        out.parsed.assumptions || {}
      );
      renderRockers();
      await refreshAudit();

      renderParsedCard(out.parsed);
      displaySolvedFamily(out.parsed.family, out.solver_data, ctx);
      applyParsedBannerAndCards(out.parsed);
      runCoach();
    } catch (err) {
      if (err.name === "AbortError") return;
      document.getElementById("flowProbeHud").textContent = `Parse/solve error: ${err.message}`;
    }
  };

  document.getElementById("btnParseSolve").onclick = runParseAndSolve;
  document.getElementById("btnAskCoach").onclick = runCoach;

  if (state.s1.lastParsed) {
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
      state.s1.lastParsed.assumptions || {}
    );
    renderRockers();
    refreshAudit();
    renderParsedCard(state.s1.lastParsed);
    displaySolvedFamily(state.s1.lastParsed.family, state.s1.lastSolverData, ctx);
    applyParsedBannerAndCards(state.s1.lastParsed);
    renderCoachReply(state.s1.lastCoach);
  } else {
    runParseAndSolve();
  }
}
