/**
 * KaTeX rendering helper and safe rich text formatter for Doubt Coach & diagnostics.
 */
export function renderTex(el, tex, displayMode = false) {
  if (!el) return;
  if (window.katex && typeof window.katex.render === "function") {
    try {
      window.katex.render(tex, el, { displayMode, throwOnError: false });
      return;
    } catch (_) {
      // Fall back to readable text below
    }
  }
  el.textContent = String(tex || "")
    .replaceAll("\\frac", "")
    .replaceAll("\\partial", "∂")
    .replaceAll("\\rho", "ρ")
    .replaceAll("\\mu", "μ")
    .replaceAll("\\Omega_z", "Ωz")
    .replaceAll("\\nabla^2", "∇²")
    .replaceAll("\\cdot", "·")
    .replaceAll("\\left(", "(")
    .replaceAll("\\right)", ")")
    .replaceAll("\\big|", "|")
    .replaceAll("\\implies", "⇒")
    .replaceAll("\\neq", "≠")
    .replaceAll("\\quad", "  ")
    .replaceAll("\\text{const globally}", "const globally")
    .replaceAll("\\text{wall}", "wall")
    .replaceAll("\\text{solid}", "solid")
    .replaceAll("\\text{", "")
    .replaceAll("}", "")
    .replaceAll("{", "");
}

function escapeHtml(raw) {
  return String(raw ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Format Markdown bold (**...**), italic (*...*), inline code (`...`), and paragraphs safely.
 */
export function formatRichText(text) {
  const safe = escapeHtml(text || "");
  const formatted = safe
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*\n]+?)\*/g, "<em>$1</em>")
    .replace(/`([^`\n]+?)`/g, '<code style="font-family:var(--font-mono);background:var(--bg-sub);padding:1px 4px;border-radius:3px;">$1</code>');

  return formatted
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function renderAuditBar(auditData) {
  const row = document.getElementById("eqTermsRow");
  const cross = document.getElementById("eqCrossStream");
  if (!row || !auditData) return;

  row.innerHTML = "";
  auditData.terms.forEach((term, idx) => {
    const chip = document.createElement("span");
    chip.className = `eq-term-chip role-${term.role}`;
    chip.title = `${term.label}: ${term.note}`;
    const spanTex = document.createElement("span");
    renderTex(spanTex, term.tex, false);
    chip.appendChild(spanTex);
    row.appendChild(chip);

    if (idx < auditData.terms.length - 1) {
      const plus = document.createElement("span");
      plus.style.color = "var(--ink-muted)";
      plus.style.fontFamily = "var(--font-mono)";
      plus.style.fontWeight = "600";
      plus.textContent = term.id === "convective_inertia" ? "=" : "+";
      row.appendChild(plus);
    }
  });

  if (cross && auditData.symbolic?.cross_stream_tex) {
    cross.innerHTML = "";
    renderTex(cross, auditData.symbolic.cross_stream_tex, false);
  }
}
