/**
 * KaTeX rendering helper and XSS-safe rich text formatter for Doubt Coach & diagnostics.
 * Acyclic presentation helper module (zero imports).
 */

function getKatex() {
  if (typeof window !== "undefined" && window.katex) return window.katex;
  if (typeof globalThis !== "undefined" && globalThis.katex) return globalThis.katex;
  return null;
}

function texToReadableFallback(tex) {
  let out = String(tex || "");
  for (let i = 0; i < 2; i += 1) {
    out = out.replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, "$1/$2");
  }
  return out
    .replaceAll("\\frac", "")
    .replace(/\\partial\s+/g, "∂")
    .replaceAll("\\partial", "∂")
    .replaceAll("\\rho", "ρ")
    .replaceAll("\\mu", "μ")
    .replaceAll("\\nu", "ν")
    .replaceAll("\\tau", "τ")
    .replaceAll("\\theta", "θ")
    .replaceAll("\\alpha", "α")
    .replaceAll("\\beta", "β")
    .replaceAll("\\omega", "ω")
    .replaceAll("\\Omega_z", "Ωz")
    .replaceAll("\\Omega", "Ω")
    .replaceAll("\\Gamma", "Γ")
    .replaceAll("\\Delta", "Δ")
    .replaceAll("\\nabla^2", "∇²")
    .replaceAll("\\nabla", "∇")
    .replaceAll("\\infty", "∞")
    .replaceAll("\\cdot", "·")
    .replaceAll("\\left(", "(")
    .replaceAll("\\right)", ")")
    .replaceAll("\\big|", "|")
    .replaceAll("\\implies", "⇒")
    .replaceAll("\\neq", "≠")
    .replaceAll("\\le", "≤")
    .replaceAll("\\ge", "≥")
    .replaceAll("\\qquad", "   ")
    .replaceAll("\\quad", "  ")
    .replaceAll("\\text{const globally}", "const globally")
    .replaceAll("\\text{const}", "const")
    .replaceAll("\\text{wall}", "wall")
    .replaceAll("\\text{solid}", "solid")
    .replaceAll("\\text{frame}", "frame")
    .replaceAll("\\text{", "")
    .replaceAll("\\mathbf{", "")
    .replaceAll("}", "")
    .replaceAll("{", "");
}

export function renderTex(el, tex, displayMode = false) {
  if (!el) return;
  const katex = getKatex();
  if (katex && typeof katex.render === "function") {
    try {
      katex.render(String(tex || ""), el, {
        displayMode: Boolean(displayMode),
        throwOnError: false,
        strict: false,
        trust: false,
      });
      return;
    } catch (_) {
      // Fall back to readable text below
    }
  }
  el.textContent = texToReadableFallback(tex);
}

function escapeHtml(raw) {
  return String(raw ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderMathSegment(tex, displayMode) {
  const cleanTex = String(tex || "").trim();
  if (!cleanTex) return "";
  const katex = getKatex();
  if (katex && typeof katex.renderToString === "function") {
    try {
      const rendered = katex.renderToString(cleanTex, {
        displayMode: Boolean(displayMode),
        throwOnError: false,
        strict: false,
        trust: false,
      });
      return displayMode
        ? `<div class="coach-math-display">${rendered}</div>`
        : `<span class="coach-math-inline">${rendered}</span>`;
    } catch (_) {
      // Fall back safely below
    }
  }
  const safeFallback = escapeHtml(texToReadableFallback(cleanTex));
  return displayMode
    ? `<div class="coach-math-display"><code class="coach-math-fallback">${safeFallback}</code></div>`
    : `<span class="coach-math-inline">${safeFallback}</span>`;
}

function formatInlineProse(rawSegment) {
  const codeTokens = [];
  const withCodeTokens = String(rawSegment || "").replace(/`([^`\n]+?)`/g, (_, code) => {
    const idx = codeTokens.length;
    codeTokens.push(
      `<code style="font-family:var(--font-mono);background:var(--bg-sub);padding:1px 5px;border-radius:3px;font-size:12px;">${escapeHtml(code)}</code>`
    );
    return `\u0000CODE_${idx}\u0000`;
  });

  let safe = escapeHtml(withCodeTokens);
  safe = safe.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  safe = safe.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, "$1<em>$2</em>");
  safe = safe.replace(/\u0000CODE_(\d+)\u0000/g, (_, idx) => codeTokens[Number(idx)] || "");
  return safe;
}

function tokenizeMathSegments(input) {
  const mathTokens = [];
  const pushMath = (tex, displayMode) => {
    const idx = mathTokens.length;
    mathTokens.push(renderMathSegment(tex, displayMode));
    return `\u0000MATH_${idx}\u0000`;
  };

  let tokenized = input.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => pushMath(tex, true));
  tokenized = tokenized.replace(/\\\[([\s\S]+?)\\\]/g, (_, tex) => pushMath(tex, true));
  tokenized = tokenized.replace(/\\\(([\s\S]+?)\\\)/g, (_, tex) => pushMath(tex, false));
  tokenized = tokenized.replace(/(?<!\\)\$(?!\s)([^$\n]+?)(?<!\s)\$/g, (_, tex) => pushMath(tex, false));
  tokenized = tokenized.replaceAll("\\$", "$");
  return { tokenized, mathTokens };
}

function restoreMathSegments(html, mathTokens) {
  return html.replace(/\u0000MATH_(\d+)\u0000/g, (_, idx) => mathTokens[Number(idx)] || "");
}

/**
 * Format a single inline line with XSS-safe Markdown + KaTeX math ($...$, \(...\)) without <p> wrappers.
 */
export function formatInlineRichText(text) {
  const input = String(text ?? "").replaceAll("\u0000", "");
  if (!input.trim()) return "";
  const { tokenized, mathTokens } = tokenizeMathSegments(input);
  return restoreMathSegments(formatInlineProse(tokenized), mathTokens);
}

/**
 * Format Markdown bold (**...**), italic (*...*), inline code (`...`), bullets, paragraphs,
 * and inline/display KaTeX math ($...$, $$...$$, \(...\), \[...\]) safely (XSS-escaped first).
 */
export function formatRichText(text) {
  const input = String(text ?? "").replaceAll("\u0000", "");
  if (!input.trim()) return "";

  const { tokenized, mathTokens } = tokenizeMathSegments(input);

  const blocks = tokenized.split(/\n{2,}/);
  const htmlBlocks = blocks
    .map((block) => {
      const lines = block.split("\n").filter((l) => l.trim().length > 0);
      if (lines.length === 0) return "";

      const out = [];
      let listMode = null; // "ul" | "ol" | null
      let listItems = [];
      let paraLines = [];

      const flushList = () => {
        if (!listMode || listItems.length === 0) return;
        out.push(`<${listMode}>${listItems.map((li) => `<li>${li}</li>`).join("")}</${listMode}>`);
        listMode = null;
        listItems = [];
      };

      const flushPara = () => {
        if (paraLines.length === 0) return;
        const joined = paraLines.join("<br>");
        out.push(`<p>${joined}</p>`);
        paraLines = [];
      };

      for (const line of lines) {
        const ulMatch = line.match(/^\s*[-*•]\s+(.*)$/);
        const olMatch = line.match(/^\s*\d+\.\s+(.*)$/);
        if (ulMatch) {
          flushPara();
          if (listMode && listMode !== "ul") flushList();
          listMode = "ul";
          listItems.push(formatInlineProse(ulMatch[1]));
        } else if (olMatch) {
          flushPara();
          if (listMode && listMode !== "ol") flushList();
          listMode = "ol";
          listItems.push(formatInlineProse(olMatch[1]));
        } else {
          flushList();
          paraLines.push(formatInlineProse(line));
        }
      }
      flushList();
      flushPara();
      return out.join("");
    })
    .filter(Boolean)
    .join("");

  return restoreMathSegments(htmlBlocks, mathTokens);
}

export function renderAuditBar(auditData) {
  const row = document.getElementById("eqTermsRow");
  const cross = document.getElementById("eqCrossStream");
  if (!row || !auditData) return;

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

  if (cross && auditData.symbolic?.cross_stream_tex) {
    cross.innerHTML = "";
    renderTex(cross, auditData.symbolic.cross_stream_tex, false);
  }
}
