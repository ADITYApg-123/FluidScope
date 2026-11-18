/**
 * Omnipresent Slide-Over Doubt Coach Drawer (#coachDrawerHost).
 * Wave 0 baseline scaffold (owned by Agent C in Wave 1).
 */
import { bus, state } from "../core/store.js";
import { formatRichText } from "../math_ui.js";

function esc(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function initCoachDrawer(ctx) {
  const host = document.getElementById("coachDrawerHost");
  if (!host) return;

  let currentParsed = null;
  let currentSolverData = null;

  const closeDrawer = () => {
    host.setAttribute("aria-hidden", "true");
    host.innerHTML = "";
  };

  const ask = async (questionText) => {
    const replyEl = host.querySelector("#coachDrawerReply");
    if (!replyEl) return;
    if (!currentParsed) {
      replyEl.innerHTML = `<div class="warning-line">Solve or run a lab first so the Doubt Coach can ground its explanation to exact solver residuals.</div>`;
      return;
    }
    replyEl.innerHTML = `<div class="diag-cell" style="color:var(--ink-muted);font-size:12px;">Inspecting active solver residuals...</div>`;
    try {
      const reply = await ctx.apiPost(
        "/api/coach",
        {
          question: questionText,
          parsed: currentParsed,
          solver_data: currentSolverData,
          llm_config: state.llmConfig,
        },
        "coach"
      );
      replyEl.innerHTML = `
        <div class="diag-cell">
          <div class="diag-key">${esc(String(reply.provider_used || "coach").toUpperCase())}${reply.textbook_citation ? ` · ${esc(reply.textbook_citation)}` : ""}</div>
          <div class="coach-answer-body" style="margin-top:6px;font-size:12.5px;line-height:1.55;">${formatRichText(reply.answer || "")}</div>
        </div>
      `;
    } catch (err) {
      if (err.name === "AbortError") return;
      replyEl.innerHTML = `<div class="warning-line">Coach error: ${esc(err.message)}</div>`;
    }
  };

  const openDrawer = (payload = {}) => {
    currentParsed = payload?.parsedQuery || state.activeCoachContext?.parsedQuery || null;
    currentSolverData = payload?.solverData ?? state.activeCoachContext?.solverData ?? null;
    const defaultPrompt = payload?.suggestedPrompt || "Why doesn't the standard shortcut hold here?";

    host.setAttribute("aria-hidden", "false");
    host.innerHTML = `
      <div class="bay-header">
        <span>Solver-Grounded Doubt Coach</span>
        <button type="button" class="btn-machined btn-xs" id="coachDrawerClose">Close</button>
      </div>
      <div class="field-group">
        <div class="field-label-row"><span>Ask a Conceptual Question</span></div>
        <textarea class="text-input" id="coachDrawerQuestion" rows="3">${esc(defaultPrompt)}</textarea>
      </div>
      <button type="button" class="btn-machined btn-primary" id="coachDrawerSubmit">Ask Coach</button>
      <div id="coachDrawerReply"></div>
    `;

    host.querySelector("#coachDrawerClose").onclick = closeDrawer;
    host.querySelector("#coachDrawerSubmit").onclick = () => {
      const q = host.querySelector("#coachDrawerQuestion").value.trim();
      if (q) ask(q);
    };
  };

  bus.on("coach:open", openDrawer);
  bus.on("solver:updated", (payload) => {
    if (payload?.parsedQuery) currentParsed = payload.parsedQuery;
    if (payload?.solverData !== undefined) currentSolverData = payload.solverData;
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && host.getAttribute("aria-hidden") === "false") {
      closeDrawer();
    }
  });
}
