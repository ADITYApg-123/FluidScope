/**
 * Contextual Governing Equation Strip & Bernoulli Verdict Manager.
 * Imports math_ui.js & store.js without circular dependencies.
 */
import { renderTex } from "../math_ui.js";
import { state } from "./store.js";

const EQUATION_CONTEXT_META = {
  ns_x: {
    label: "Navier–Stokes x-Momentum",
    tex: "",
    subtitle: "Term-by-term local inertia, convective inertia, pressure, viscous, and frame balance (Ch. 4 & Ch. 8).",
  },
  radial_euler: {
    label: "Radial Euler & Crocco (Eq. 4.43)",
    tex: "\\frac{\\partial p}{\\partial r} = \\rho \\frac{v_\\theta^2}{r}, \\qquad \\frac{\\partial H}{\\partial n} = \\frac{V}{g}\\,\\Omega_z",
    subtitle: "Outward pressure rise balances centrifugal acceleration; total head H varies across streamlines iff Ωz ≠ 0.",
  },
  specific_force: {
    label: "Specific Energy vs Force",
    tex: "E_s = h + \\frac{q^2}{2gh^2}, \\qquad F_s = \\frac{q^2}{gh} + \\frac{h^2}{2} = \\text{const}",
    subtitle: "Across hydraulic jumps and sudden expansions, integral momentum (Fs) holds while mechanical energy dissipates.",
  },
  frame_g_eff: {
    label: "Non-Inertial Frame (g_eff)",
    tex: "\\nabla p = \\rho\\left(\\mathbf{g} - \\mathbf{a}_{\\text{frame}}\\right), \\qquad \\tan\\theta = \\frac{a_x}{g + a_z}",
    subtitle: "Effective gravity g_eff = g + az drops to zero in free fall (az = -g), flattening the meniscus and halting efflux.",
  },
  boundary_layer: {
    label: "Boundary Layer & Separation",
    tex: "u\\frac{\\partial u}{\\partial x} + v\\frac{\\partial u}{\\partial y} = -\\frac{1}{\\rho}\\frac{dp}{dx} + \\nu\\frac{\\partial^2 u}{\\partial y^2}, \\qquad \\left.\\mu\\frac{\\partial^2 u}{\\partial y^2}\\right|_w = \\frac{dp}{dx}",
    subtitle: "Adverse pressure gradient dp/dx > 0 enforces positive wall curvature and an interior inflection point ahead of separation.",
  },
};

export function updateEquationStrip(auditData, contextId = null) {
  const bar = document.getElementById("equationBar");
  const labelEl = bar?.querySelector(".eq-strip-label");
  const row = document.getElementById("eqTermsRow");
  const cross = document.getElementById("eqCrossStream");
  const badge = document.getElementById("bernoulliVerdictBadge");
  if (!row || !auditData) return;

  if (bar) bar.classList.remove("locked");

  const rawEqCtx = auditData.equation_context;
  const ctxIdFromAudit = typeof rawEqCtx === "string" ? rawEqCtx : rawEqCtx?.id;
  const activeCtxId = contextId || ctxIdFromAudit || state.equationContext || "ns_x";
  const ctxObj =
    (auditData.equation_contexts && auditData.equation_contexts[activeCtxId]) ||
    (rawEqCtx && typeof rawEqCtx === "object" ? rawEqCtx : null);
  const meta = EQUATION_CONTEXT_META[activeCtxId] || null;

  if (bar) {
    bar.dataset.equationContext = activeCtxId;
  }

  if (labelEl) {
    labelEl.textContent = meta?.label || ctxObj?.title || "Governing Equation Audit";
    labelEl.title = ctxObj?.subtitle || meta?.subtitle || "";
  }

  row.innerHTML = "";
  (auditData.terms || []).forEach((term, idx, arr) => {
    const isDim = term.active === false || term.highlight === "dim" || term.role === "dim";
    const isAlert = !isDim && (term.highlight === "alert" || term.role === "coral");

    const chip = document.createElement("span");
    chip.className = isDim
      ? "eq-term-chip role-dim highlight-dim"
      : isAlert
      ? "eq-term-chip role-alert highlight-alert"
      : "eq-term-chip role-active highlight-active";
    chip.dataset.termId = term.id || "";
    chip.dataset.highlight = isDim ? "dim" : isAlert ? "alert" : "active";
    chip.title = `${term.label}: ${term.note}`;

    const spanTex = document.createElement("span");
    renderTex(spanTex, term.tex, false);
    chip.appendChild(spanTex);
    row.appendChild(chip);

    if (idx < arr.length - 1) {
      const op = document.createElement("span");
      op.className = "eq-operator";
      op.textContent = term.id === "convective_inertia" ? "=" : "+";
      row.appendChild(op);
    }
  });

  if (cross) {
    const rightTex =
      activeCtxId !== "ns_x"
        ? ctxObj?.tex || meta?.tex || auditData.symbolic?.cross_stream_tex || ""
        : auditData.symbolic?.cross_stream_tex || ctxObj?.tex || "";
    cross.innerHTML = "";
    if (rightTex) {
      renderTex(cross, rightTex, false);
    }
  }

  if (badge && auditData.bernoulli_status) {
    badge.classList.remove("verdict-global", "verdict-streamline", "verdict-broken", "verdict-locked");
    if (auditData.bernoulli_status.valid_globally) {
      badge.textContent = "Bernoulli: Global";
      badge.classList.add("verdict-global");
      badge.title = auditData.bernoulli_status.verdict || "Globally valid (Constant H everywhere)";
    } else if (auditData.bernoulli_status.valid_along_streamline) {
      badge.textContent = "Streamline Only";
      badge.classList.add("verdict-streamline");
      badge.title =
        auditData.bernoulli_status.verdict ||
        "Valid along a single streamline only (Rotational: H varies across streamlines)";
    } else {
      badge.textContent = "Bernoulli Broken";
      badge.classList.add("verdict-broken");
      badge.title = auditData.bernoulli_status.verdict || "Broken: Do NOT apply standard constant-head Bernoulli";
    }
  }
}

export function setEquationStripLocked(
  message = "Submit your prediction to unlock the Governing Equation Audit"
) {
  const bar = document.getElementById("equationBar");
  const labelEl = bar?.querySelector(".eq-strip-label");
  const row = document.getElementById("eqTermsRow");
  const cross = document.getElementById("eqCrossStream");
  const badge = document.getElementById("bernoulliVerdictBadge");

  if (bar) {
    bar.classList.add("locked");
    bar.dataset.equationContext = "locked";
  }
  if (labelEl) {
    labelEl.textContent = "Equation Audit Locked";
    labelEl.title = "Prediction required before revealing active governing equation terms";
  }
  if (row) {
    row.innerHTML = "";
    const lockedChip = document.createElement("span");
    lockedChip.className = "eq-term-chip eq-strip-locked";
    lockedChip.textContent = String(
      message || "Submit your prediction to unlock the Governing Equation Audit"
    );
    row.appendChild(lockedChip);
  }
  if (cross) {
    cross.textContent = "";
  }
  if (badge) {
    badge.classList.remove("verdict-global", "verdict-streamline", "verdict-broken");
    badge.classList.add("verdict-locked");
    badge.textContent = "Locked (Predict First)";
    badge.title = "Submit your prediction to unlock the Bernoulli & assumption audit";
  }
}
