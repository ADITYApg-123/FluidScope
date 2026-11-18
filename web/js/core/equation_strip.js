/**
 * Contextual Governing Equation Strip & Bernoulli Verdict Manager.
 * Wave 0 baseline scaffold (owned by Agent B in Wave 1).
 * Imports math_ui.js & store.js without circular dependencies.
 */
import { renderTex } from "../math_ui.js";
import { state } from "./store.js";

export function updateEquationStrip(auditData, contextId = null) {
  const bar = document.getElementById("equationBar");
  const labelEl = bar?.querySelector(".eq-strip-label");
  const row = document.getElementById("eqTermsRow");
  const cross = document.getElementById("eqCrossStream");
  const badge = document.getElementById("bernoulliVerdictBadge");
  if (!row || !auditData) return;

  if (bar) bar.classList.remove("locked");

  const activeCtxId = contextId || auditData.equation_context?.id || state.equationContext || "ns_x";
  const ctxObj = auditData.equation_contexts?.[activeCtxId] || auditData.equation_context;

  if (labelEl) {
    labelEl.textContent = ctxObj?.title || "Governing Equation Audit";
  }

  row.innerHTML = "";
  (auditData.terms || []).forEach((term, idx, arr) => {
    const chip = document.createElement("span");
    chip.className = `eq-term-chip role-${term.role}`;
    chip.title = `${term.label}: ${term.note}`;
    const spanTex = document.createElement("span");
    renderTex(spanTex, term.tex, false);
    chip.appendChild(spanTex);
    row.appendChild(chip);

    if (idx < arr.length - 1) {
      const plus = document.createElement("span");
      plus.style.color = "var(--ink-muted)";
      plus.style.fontFamily = "var(--font-mono)";
      plus.style.fontWeight = "600";
      plus.textContent = term.id === "convective_inertia" ? "=" : "+";
      row.appendChild(plus);
    }
  });

  if (cross) {
    const rightTex =
      (activeCtxId !== "ns_x" && ctxObj?.tex) ||
      auditData.symbolic?.cross_stream_tex ||
      ctxObj?.tex ||
      "";
    cross.innerHTML = "";
    if (rightTex) renderTex(cross, rightTex, false);
  }

  if (badge && auditData.bernoulli_status) {
    badge.textContent = auditData.bernoulli_status.valid_globally
      ? "Bernoulli: Global"
      : auditData.bernoulli_status.valid_along_streamline
      ? "Streamline Only"
      : "Bernoulli Broken";
  }
}

export function setEquationStripLocked(message = "Submit your prediction to unlock the Governing Equation Audit") {
  const bar = document.getElementById("equationBar");
  const labelEl = bar?.querySelector(".eq-strip-label");
  const row = document.getElementById("eqTermsRow");
  const cross = document.getElementById("eqCrossStream");
  const badge = document.getElementById("bernoulliVerdictBadge");
  if (bar) bar.classList.add("locked");
  if (labelEl) labelEl.textContent = "Equation Audit Locked";
  if (row) {
    row.innerHTML = `<span class="eq-term-chip">${String(message)}</span>`;
  }
  if (cross) cross.textContent = "";
  if (badge) badge.textContent = "Locked (Predict First)";
}
