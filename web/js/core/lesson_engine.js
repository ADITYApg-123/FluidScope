/**
 * lesson_engine.js  —  Generic Lesson Panel Driver
 *
 * A lesson is an array of step objects:
 *   { idea: string (HTML), show: fn(ctx), highlight?: string (element id) }
 *
 * The engine injects a slide-in panel over the lab, walks through steps,
 * and calls each step's show() to drive the existing lab state + DOM.
 * On the last step "Explore freely →" closes the panel — lab is untouched.
 */

const PANEL_ID = "lessonPanel";
const OVERLAY_ID = "lessonOverlay";

/** Inject panel CSS once */
function ensureStyles() {
  if (document.getElementById("lessonEngineStyles")) return;
  const s = document.createElement("style");
  s.id = "lessonEngineStyles";
  s.textContent = `
    #lessonOverlay {
      position: fixed; inset: 0; z-index: 900;
      background: rgba(0,0,0,0.25);
      opacity: 0; transition: opacity 0.25s;
      pointer-events: none;
    }
    #lessonOverlay.open { opacity: 1; pointer-events: auto; }

    #lessonPanel {
      position: fixed; top: 0; right: 0; bottom: 0;
      width: min(420px, 92vw);
      z-index: 901;
      background: var(--bg-surface, #fff);
      border-left: 1px solid var(--seam, #e2e8f0);
      box-shadow: -4px 0 24px rgba(0,0,0,0.12);
      display: flex; flex-direction: column;
      transform: translateX(100%);
      transition: transform 0.28s cubic-bezier(.4,0,.2,1);
      font-family: var(--font-sans, system-ui, sans-serif);
    }
    #lessonPanel.open { transform: translateX(0); }

    #lessonPanel .ls-header {
      display: flex; align-items: center; gap: 10px;
      padding: 14px 16px 12px;
      border-bottom: 1px solid var(--seam, #e2e8f0);
      flex-shrink: 0;
    }
    #lessonPanel .ls-title {
      font-size: 13px; font-weight: 700; letter-spacing: .04em;
      text-transform: uppercase; color: var(--ink-primary, #0072b2);
      flex: 1;
    }
    #lessonPanel .ls-close {
      background: none; border: none; cursor: pointer;
      font-size: 18px; color: var(--ink-secondary, #64748b);
      padding: 2px 6px; border-radius: 4px;
      transition: background .15s;
    }
    #lessonPanel .ls-close:hover { background: var(--bg-hover, #f1f5f9); }

    #lessonPanel .ls-progress {
      display: flex; gap: 4px; padding: 10px 16px 0;
      flex-shrink: 0;
    }
    #lessonPanel .ls-dot {
      flex: 1; height: 3px; border-radius: 2px;
      background: var(--seam, #e2e8f0);
      transition: background .3s;
    }
    #lessonPanel .ls-dot.done { background: var(--ink-primary, #0072b2); }
    #lessonPanel .ls-dot.active { background: var(--ink-primary, #0072b2); opacity: .5; }

    #lessonPanel .ls-step-label {
      padding: 6px 16px 0;
      font-size: 11px; font-variant-numeric: tabular-nums;
      color: var(--ink-secondary, #64748b);
      flex-shrink: 0;
    }

    #lessonPanel .ls-body {
      flex: 1; overflow-y: auto; padding: 14px 16px;
    }
    #lessonPanel .ls-idea {
      font-size: 14.5px; line-height: 1.65;
      color: var(--ink-body, #1e293b);
    }
    #lessonPanel .ls-idea strong { color: var(--ink-primary, #0072b2); }
    #lessonPanel .ls-idea em { color: var(--ink-secondary, #475569); font-style: normal; }
    #lessonPanel .ls-idea .ls-example {
      margin-top: 10px; padding: 10px 12px;
      background: var(--bg-input, #f8fafc);
      border-left: 3px solid var(--ink-primary, #0072b2);
      border-radius: 0 6px 6px 0;
      font-size: 13.5px; line-height: 1.6;
      color: var(--ink-secondary, #475569);
    }
    #lessonPanel .ls-idea .ls-equation {
      margin: 10px 0;
      font-family: var(--font-mono, monospace);
      font-size: 13px;
      background: var(--bg-input, #f8fafc);
      border: 1px solid var(--seam, #e2e8f0);
      border-radius: 6px; padding: 8px 12px;
      color: var(--ink-body, #1e293b);
    }
    #lessonPanel .ls-watch-hint {
      margin-top: 12px; padding: 9px 12px 9px 32px;
      background: color-mix(in srgb, var(--ink-primary, #0072b2) 8%, transparent);
      border-radius: 6px;
      font-size: 12.5px; line-height: 1.55;
      color: var(--ink-primary, #0072b2);
      position: relative;
    }
    #lessonPanel .ls-watch-hint::before {
      content: "👁";
      position: absolute; left: 10px; top: 9px;
    }

    #lessonPanel .ls-footer {
      padding: 12px 16px 16px;
      border-top: 1px solid var(--seam, #e2e8f0);
      flex-shrink: 0;
      display: flex; justify-content: space-between; align-items: center;
    }
    #lessonPanel .ls-btn-prev {
      background: none; border: 1px solid var(--seam, #e2e8f0);
      border-radius: 6px; padding: 7px 14px;
      font-size: 13px; cursor: pointer; color: var(--ink-secondary, #64748b);
      transition: background .15s;
    }
    #lessonPanel .ls-btn-prev:hover { background: var(--bg-hover, #f1f5f9); }
    #lessonPanel .ls-btn-prev:disabled { opacity: .35; cursor: default; }
    #lessonPanel .ls-btn-next {
      background: var(--ink-primary, #0072b2); color: #fff;
      border: none; border-radius: 6px; padding: 7px 20px;
      font-size: 13px; font-weight: 600; cursor: pointer;
      transition: opacity .15s;
    }
    #lessonPanel .ls-btn-next:hover { opacity: .88; }

    /* highlight ring on canvas or any element */
    .lesson-highlight {
      outline: 2.5px solid var(--ink-primary, #0072b2) !important;
      outline-offset: 3px;
      transition: outline .25s;
    }
  `;
  document.head.appendChild(s);
}

/** Remove any existing highlight rings */
function clearHighlight() {
  document.querySelectorAll(".lesson-highlight").forEach((el) =>
    el.classList.remove("lesson-highlight")
  );
}

/** Add a blue ring to one element by id */
function highlightEl(id) {
  clearHighlight();
  if (!id) return;
  const el = document.getElementById(id);
  if (el) {
    el.classList.add("lesson-highlight");
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

export class LessonEngine {
  /**
   * @param {string} labTitle  — shown in panel header
   * @param {Array}  steps     — [{idea:string, show?:fn(ctx), highlight?:string}]
   */
  constructor(labTitle, steps) {
    this.labTitle = labTitle;
    this.steps = steps;
    this.current = 0;
    this._ctx = null;
    this._panel = null;
    this._overlay = null;
  }

  /** Open the lesson panel and drive the first step */
  open(ctx) {
    this._ctx = ctx;
    this.current = 0;
    ensureStyles();
    this._buildDOM();
    // animate open
    requestAnimationFrame(() => {
      this._overlay.classList.add("open");
      this._panel.classList.add("open");
    });
    this._applyStep(0);
  }

  /** Close and clean up */
  close() {
    clearHighlight();
    if (this._overlay) this._overlay.classList.remove("open");
    if (this._panel) {
      this._panel.classList.remove("open");
      setTimeout(() => {
        this._overlay?.remove();
        this._panel?.remove();
        this._overlay = null;
        this._panel = null;
      }, 320);
    }
  }

  _buildDOM() {
    // remove old if any
    document.getElementById(OVERLAY_ID)?.remove();
    document.getElementById(PANEL_ID)?.remove();

    // overlay (click to close)
    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.onclick = () => this.close();
    document.body.appendChild(overlay);
    this._overlay = overlay;

    // panel
    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="ls-header">
        <span class="ls-title">📚 ${this.labTitle} · Lesson</span>
        <button class="ls-close" id="lsBtnClose" title="Close lesson">✕</button>
      </div>
      <div class="ls-progress" id="lsProgress"></div>
      <div class="ls-step-label" id="lsStepLabel"></div>
      <div class="ls-body" id="lsBody"></div>
      <div class="ls-footer">
        <button class="ls-btn-prev" id="lsBtnPrev">← Back</button>
        <button class="ls-btn-next" id="lsBtnNext">Next →</button>
      </div>
    `;
    document.body.appendChild(panel);
    this._panel = panel;

    panel.querySelector("#lsBtnClose").onclick = () => this.close();
    panel.querySelector("#lsBtnPrev").onclick = () => this._go(-1);
    panel.querySelector("#lsBtnNext").onclick = () => this._go(+1);

    // stop overlay-click from closing when clicking inside panel
    panel.onclick = (e) => e.stopPropagation();
  }

  _go(dir) {
    const next = this.current + dir;
    if (next < 0 || next > this.steps.length) return;
    if (next === this.steps.length) { this.close(); return; }
    this.current = next;
    this._applyStep(next);
  }

  _applyStep(idx) {
    const step = this.steps[idx];
    const total = this.steps.length;

    // progress dots
    const prog = this._panel.querySelector("#lsProgress");
    prog.innerHTML = this.steps
      .map((_, i) => {
        const cls = i < idx ? "done" : i === idx ? "active" : "";
        return `<div class="ls-dot ${cls}"></div>`;
      })
      .join("");

    // step label
    this._panel.querySelector("#lsStepLabel").textContent =
      `Step ${idx + 1} of ${total}`;

    // idea content
    const body = this._panel.querySelector("#lsBody");
    body.innerHTML = `<div class="ls-idea">${step.idea}</div>`;

    // Render KaTeX math if window.katex is loaded
    if (window.katex && typeof window.katex.renderToString === "function") {
      const cleanTex = (raw) =>
        String(raw || "")
          .replaceAll("&lt;", "<")
          .replaceAll("&gt;", ">")
          .replaceAll("&amp;", "&")
          .replaceAll("&le;", "\\le")
          .replaceAll("&ge;", "\\ge");

      try {
        body.querySelectorAll(".ls-equation, p, .ls-example, .ls-watch-hint").forEach((node) => {
          node.innerHTML = node.innerHTML
            .replace(/\\\((.+?)\\\)/g, (m, tex) => {
              try { return window.katex.renderToString(cleanTex(tex), { displayMode: false, throwOnError: false }); }
              catch (_) { return m; }
            })
            .replace(/\\\[(.+?)\\\]/g, (m, tex) => {
              try { return window.katex.renderToString(cleanTex(tex), { displayMode: true, throwOnError: false }); }
              catch (_) { return m; }
            });
        });
      } catch (_) {}
    }

    // back/next buttons
    const prevBtn = this._panel.querySelector("#lsBtnPrev");
    const nextBtn = this._panel.querySelector("#lsBtnNext");
    prevBtn.disabled = idx === 0;
    const isLast = idx === total - 1;
    nextBtn.textContent = isLast ? "Explore freely →" : "Next →";

    // drive the lab
    if (step.show && this._ctx) {
      try { step.show(this._ctx); } catch (e) { console.warn("[lesson] show() error:", e); }
    }

    // highlight
    setTimeout(() => highlightEl(step.highlight || null), 180);
  }
}
