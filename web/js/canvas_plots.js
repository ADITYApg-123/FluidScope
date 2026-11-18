/**
 * Precision 2D Comparison Plot Canvas (True Governing Physics vs. Naive Formula,
 * Wilkinson/Heckbert niceTicks, Okabe-Ito Palette, Bidirectional Hover & Data Table).
 * Wave 1 — Agent A (Canvas Engines & Scientific Visualization).
 */
import { OKABE_ITO, niceTicks, fmtNum } from "./core/color_scales.js";
import { bus } from "./core/store.js";

function tickDecimals(ticks) {
  if (!ticks || ticks.length < 2) return 1;
  const step = Math.abs(ticks[1] - ticks[0]);
  if (!Number.isFinite(step) || step <= 0) return 1;
  if (step >= 1) return Math.abs(step - Math.round(step)) < 1e-6 ? 0 : 1;
  return Math.min(4, Math.max(1, Math.ceil(-Math.log10(step) - 1e-9)));
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function sampleIndices(length, maxRows = 41) {
  if (length <= 0) return [];
  if (length <= maxRows) {
    return Array.from({ length }, (_, i) => i);
  }
  const out = [];
  const last = length - 1;
  for (let k = 0; k < maxRows; k++) {
    const idx = Math.round((k / (maxRows - 1)) * last);
    if (!out.length || out[out.length - 1] !== idx) out.push(idx);
  }
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

export class CurvePlotEngine {
  constructor(canvasEl, hudEl) {
    this.canvas = canvasEl;
    this.hud = hudEl;
    this.ctx = canvasEl?.getContext ? canvasEl.getContext("2d") : null;
    this.spec = null;
    this.hoverFrac = null; // Normalized [0..1] along active probeAxis ("x" or "y")
    this.externalHover = null; // Synced hover point from FlowCanvasEngine
    this._lastRange = null;
    this.pad = { left: 74, right: 24, top: 20, bottom: 48 };
    this._tableOpen = false;
    this._tableToggleBtn = null;
    this._tableWrap = null;
    this._sawPointerMove = false;

    this._initEvents();
    this._bindTableToggle();
  }

  _getCanvasCoords(e) {
    if (!this.canvas) return [0, 0];
    const rect =
      typeof this.canvas.getBoundingClientRect === "function"
        ? this.canvas.getBoundingClientRect()
        : { left: 0, top: 0 };
    const clientX = Number.isFinite(e.clientX) ? e.clientX : e.offsetX ?? 0;
    const clientY = Number.isFinite(e.clientY) ? e.clientY : e.offsetY ?? 0;
    return [clientX - (rect.left || 0), clientY - (rect.top || 0)];
  }

  _initEvents() {
    if (this.canvas && typeof this.canvas.addEventListener === "function") {
      const handleMove = (e, fromPointer) => {
        if (!fromPointer && this._sawPointerMove) {
          this._sawPointerMove = false;
          return;
        }
        if (fromPointer) this._sawPointerMove = true;

        const [px, py] = this._getCanvasCoords(e);
        const cw = this.canvas.clientWidth || this.canvas.width || 600;
        const ch = this.canvas.clientHeight || this.canvas.height || 400;
        const plotW = Math.max(40, cw - this.pad.left - this.pad.right);
        const plotH = Math.max(40, ch - this.pad.top - this.pad.bottom);
        const axis = this.spec?.probeAxis === "y" ? "y" : "x";
        const fracX = (px - this.pad.left) / plotW;
        const fracY = 1 - (py - this.pad.top) / plotH;
        const frac = axis === "y" ? fracY : fracX;

        if (frac >= 0 && frac <= 1) {
          this.hoverFrac = frac;
          this._emitPlotHover(fracX, fracY, frac, axis);
          this.render();
        } else if (this.hoverFrac !== null) {
          this.hoverFrac = null;
          bus.emit("plot:hover", null);
          this.render();
        }
      };

      const handleLeave = () => {
        if (this.hoverFrac !== null) {
          this.hoverFrac = null;
          bus.emit("plot:hover", null);
        }
        this.render();
      };

      this.canvas.addEventListener("pointermove", (e) => handleMove(e, true));
      this.canvas.addEventListener("mousemove", (e) => handleMove(e, false));
      this.canvas.addEventListener("pointerleave", handleLeave);
      this.canvas.addEventListener("mouseleave", handleLeave);
    }

    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      this._onResize = () => this.render();
      window.addEventListener("resize", this._onResize);
    }
    if (typeof ResizeObserver !== "undefined" && this.canvas) {
      this._ro = new ResizeObserver(() => this.render());
      this._ro.observe(this.canvas);
    }
  }

  _emitPlotHover(fracX, fracY, curveFrac, axis) {
    if (!this.spec?.series?.length) return;
    const range = this._lastRange || this._computeRange();
    if (!range) return;
    const { xmin, xmax, ymin, ymax } = range;
    const ptrWorldX = xmin + Math.max(0, Math.min(1, fracX)) * (xmax - xmin);
    const ptrWorldY = ymin + Math.max(0, Math.min(1, fracY)) * (ymax - ymin);
    const s0 = this.spec.series[0];

    let worldX = ptrWorldX;
    let worldY = ptrWorldY;
    if (axis === "y") {
      worldY = ymin + curveFrac * (ymax - ymin);
      const sx = s0 ? this._interpSeries(s0.y, s0.x, worldY) : null;
      if (sx !== null && Number.isFinite(sx)) worldX = sx;
    } else {
      worldX = xmin + curveFrac * (xmax - xmin);
      const sy = s0 ? this._interpSeries(s0.x, s0.y, worldX) : null;
      if (sy !== null && Number.isFinite(sy)) worldY = sy;
    }

    bus.emit("plot:hover", { worldX, worldY, curveFrac });
  }

  _bindTableToggle() {
    if (typeof document === "undefined") return;
    const btn = document.getElementById("plotDataTableToggle");
    const wrap = document.getElementById("plotDataTableWrap");
    if (btn) this._tableToggleBtn = btn;
    if (wrap) this._tableWrap = wrap;
    if (!btn || !wrap) return;

    if (wrap.classList?.contains("hidden")) {
      this._tableOpen = false;
    } else if (btn.getAttribute("aria-expanded") === "true") {
      this._tableOpen = true;
    }

    if (!btn.dataset.tableBound) {
      btn.dataset.tableBound = "1";
      btn.addEventListener("click", () => this.toggleDataTable());
    }
    this._syncTableToggleUI();
  }

  _syncTableToggleUI() {
    const btn =
      this._tableToggleBtn ||
      (typeof document !== "undefined" ? document.getElementById("plotDataTableToggle") : null);
    const wrap =
      this._tableWrap ||
      (typeof document !== "undefined" ? document.getElementById("plotDataTableWrap") : null);
    if (btn) {
      btn.setAttribute("aria-expanded", String(this._tableOpen));
      btn.textContent = this._tableOpen ? "Hide Plotted Data Table" : "View Plotted Data Table";
    }
    if (wrap?.classList) {
      wrap.classList.toggle("hidden", !this._tableOpen);
    }
  }

  toggleDataTable(forceOpen = null) {
    this._bindTableToggle();
    this._tableOpen = forceOpen === null ? !this._tableOpen : Boolean(forceOpen);
    this._syncTableToggleUI();
    return this._tableOpen;
  }

  _renderDataTable() {
    this._bindTableToggle();
    const wrap =
      this._tableWrap ||
      (typeof document !== "undefined" ? document.getElementById("plotDataTableWrap") : null);
    if (!wrap) return;

    const series = this.spec?.series;
    if (!Array.isArray(series) || !series.length) {
      wrap.innerHTML = `<div class="plot-table-empty">No plotted curve data available for this state.</div>`;
      return;
    }

    const isYAxis = this.spec.probeAxis === "y";
    // Choose reference grid (prefer longest finite series, ties go to series[0])
    let refSeries = series[0];
    let bestCount = -1;
    for (const s of series) {
      const len = Math.min(s.x?.length || 0, s.y?.length || 0);
      if (len > bestCount) {
        bestCount = len;
        refSeries = s;
      }
    }
    const refInd = isYAxis ? refSeries.y || [] : refSeries.x || [];
    const indices = sampleIndices(refInd.length, 41);

    if (!indices.length) {
      wrap.innerHTML = `<div class="plot-table-empty">No numeric samples available.</div>`;
      return;
    }

    const indHeader = isYAxis
      ? this.spec.yLabel || this.spec.xLabel || "y"
      : this.spec.xLabel || "x";

    const headerCells = [
      `<th scope="col" class="num">${escapeHtml(indHeader)}</th>`,
      ...series.map(
        (s, idx) => `<th scope="col" class="num">${escapeHtml(s.name || `Series ${idx + 1}`)}</th>`
      ),
    ].join("");

    const rowsHtml = indices
      .map((ri) => {
        const indVal = refInd[ri];
        const cells = [`<td class="num">${escapeHtml(fmtNum(indVal, 3))}</td>`];
        for (const s of series) {
          const sInd = isYAxis ? s.y : s.x;
          const sDep = isYAxis ? s.x : s.y;
          let depVal = null;
          if (s === refSeries) {
            depVal = sDep?.[ri];
          } else if (
            sInd?.length === refInd.length &&
            sInd[ri] !== undefined &&
            Math.abs(Number(sInd[ri]) - Number(indVal)) < 1e-9
          ) {
            depVal = sDep?.[ri];
          } else {
            depVal = this._interpSeries(sInd, sDep, indVal);
          }
          cells.push(`<td class="num">${escapeHtml(fmtNum(depVal, 3))}</td>`);
        }
        return `<tr>${cells.join("")}</tr>`;
      })
      .join("");

    wrap.innerHTML = `
      <table class="plot-data-table">
        <thead><tr>${headerCells}</tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    `;
  }

  _isDark() {
    if (typeof document === "undefined") return false;
    return document.documentElement?.getAttribute("data-theme") === "dark";
  }

  _palette() {
    if (this._isDark()) {
      return {
        bg: "#090D12",
        grid: "#1B232E",
        axis: "#334155",
        frame: "#475569",
        tickInk: "#94A3B8",
        labelInk: "#E2E8F0",
        primary: "#58A6FF",
        teal: "#2DD4BF",
        amber: "#F59E0B",
        coral: "#F87171",
        ok: "#3FB950",
        secondary: "#A78BFA",
        shadeColor: "#F87171",
        shadeAlpha: 0.20,
        shadeFill: "rgba(248, 113, 113, 0.20)",
        bandFill: "rgba(245, 158, 11, 0.20)",
        boxBg: "rgba(15, 23, 42, 0.94)",
        crosshair: "#F59E0B",
        extCrosshair: "#A78BFA",
      };
    }
    return {
      bg: "#FCFBF9",
      grid: "#E8E4DC",
      axis: "#C8C1B4",
      frame: "#9CA3AF",
      tickInk: "#4B5563",
      labelInk: "#111827",
      primary: OKABE_ITO.blue,
      teal: OKABE_ITO.green,
      amber: OKABE_ITO.vermilion,
      coral: OKABE_ITO.red,
      ok: OKABE_ITO.green,
      secondary: OKABE_ITO.purple,
      shadeColor: OKABE_ITO.red,
      shadeAlpha: 0.14,
      shadeFill: "rgba(185, 28, 28, 0.14)",
      bandFill: "rgba(213, 94, 0, 0.14)",
      boxBg: "rgba(255, 255, 255, 0.96)",
      crosshair: "#B45309",
      extCrosshair: OKABE_ITO.purple,
    };
  }

  _resolveColor(col, fallback) {
    const pal = this._palette();
    if (!col) return fallback || pal.primary;
    const c = String(col).toLowerCase().trim();
    if (c === "primary") return pal.primary;
    if (c === "secondary" || c === "purple") return pal.secondary;
    if (c === "teal") return pal.teal;
    if (c === "amber") return pal.amber;
    if (c === "coral" || c === "trap") return pal.coral;
    if (c === "ok" || c === "stokes") return pal.ok;

    if (this._isDark()) {
      if (c === "#0072b2" || c === "#1d4ed8") return pal.primary;
      if (c === "#d55e00" || c === "#d97706" || c === "#b45309" || c === "#e6a23c") return pal.amber;
      if (c === "#b91c1c" || c === "#dc2626" || c === "#e05a47") return pal.coral;
      if (c === "#009e73" || c === "#15803d") return pal.teal;
      if (c === "#7c3aed") return pal.secondary;
      if (c === "#475569") return "#94A3B8";
    } else {
      if (c === "#d9e2ec" || c === "#f0f6fc") return "#0F172A";
      if (c === "#e6a23c") return "#B45309";
      if (c === "#e05a47") return OKABE_ITO.red;
      if (c === "#58b368") return OKABE_ITO.green;
      if (c === "#9fb3c8" || c === "#7f8ea3") return "#475569";
    }
    return col;
  }

  _resolveTextColor(col, fallback) {
    const pal = this._palette();
    const resolved = this._resolveColor(col, fallback || pal.labelInk);
    const c = String(resolved || "").toLowerCase().trim();
    if (this._isDark()) {
      if (c === "#0072b2" || c === "#1d4ed8" || c === "#1e40af" || c === "#005a8d") return pal.primary;
      if (c === "#d55e00" || c === "#d97706" || c === "#b45309" || c === "#92400e") return pal.amber;
      if (c === "#b91c1c" || c === "#dc2626" || c === "#e05a47" || c === "#991b1b") return pal.coral;
      if (c === "#009e73" || c === "#15803d" || c === "#166534") return pal.ok;
      if (c === "#0f766e") return pal.teal;
      if (c === "#7c3aed" || c === "#5b21b6") return pal.secondary;
      if (c === "#475569" || c === "#334155" || c === "#64748b" || c === "#cbd5e1" || c === "#9ca3af") {
        return pal.tickInk;
      }
      if (c === "#0f172a" || c === "#111827" || c === "#000000") return pal.labelInk;
      return resolved;
    }
    if (c === "#d55e00" || c === "#d97706" || c === "#b45309" || c === "#e69f00" || c === "#e6a23c" || c === "#f59e0b") {
      return "#92400E";
    }
    if (c === "#009e73" || c === "#15803d" || c === "#58b368" || c === "#3fb950" || c === "#34d399") {
      return "#166534";
    }
    if (c === "#dc2626" || c === "#b91c1c" || c === "#e05a47" || c === "#f87171") return "#991B1B";
    if (c === "#0072b2" || c === "#1d4ed8" || c === "#58a6ff" || c === "#38bdf8" || c === "#56b4e9") return "#005A8D";
    if (c === "#7c3aed" || c === "#a78bfa") return "#5B21B6";
    if (c === "#2dd4bf") return "#0F766E";
    if (c === "#cbd5e1" || c === "#9ca3af" || c === "#94a3b8" || c === "#9fb3c8" || c === "#7f8ea3") {
      return "#475569";
    }
    if (c === "#e2e8f0" || c === "#f1f5f9" || c === "#ffffff") return pal.labelInk;
    return resolved;
  }

  setPlot(spec) {
    this.spec = spec;
    this._lastRange = null;
    this._renderDataTable();
    this.render();
  }

  /**
   * Receive synced hover coordinates from FlowCanvasEngine.
   * NEVER emits "plot:hover" onto bus to prevent infinite ping-pong.
   */
  setExternalHover(pt) {
    if (
      !pt ||
      (!Number.isFinite(Number(pt.worldX)) && !Number.isFinite(Number(pt.worldY)))
    ) {
      if (this.externalHover !== null) {
        this.externalHover = null;
        this.render();
      }
      return;
    }
    this.externalHover = {
      worldX: Number.isFinite(Number(pt.worldX)) ? Number(pt.worldX) : null,
      worldY: Number.isFinite(Number(pt.worldY)) ? Number(pt.worldY) : null,
    };
    this.render();
  }

  _computeRange() {
    if (!this.spec || !this.spec.series?.length) return null;
    let xmin = Infinity;
    let xmax = -Infinity;
    let ymin = Infinity;
    let ymax = -Infinity;

    for (const s of this.spec.series) {
      const len = Math.min(s.x?.length || 0, s.y?.length || 0);
      for (let i = 0; i < len; i++) {
        const vx = s.x[i];
        const vy = s.y[i];
        if (!Number.isFinite(vx) || !Number.isFinite(vy)) continue;
        xmin = Math.min(xmin, vx);
        xmax = Math.max(xmax, vx);
        ymin = Math.min(ymin, vy);
        ymax = Math.max(ymax, vy);
      }
    }
    if (!Number.isFinite(xmin) || !Number.isFinite(ymin)) return null;

    if (this.spec.bounds) {
      if (Number.isFinite(this.spec.bounds.xmin)) xmin = this.spec.bounds.xmin;
      if (Number.isFinite(this.spec.bounds.xmax)) xmax = this.spec.bounds.xmax;
      if (Number.isFinite(this.spec.bounds.ymin)) ymin = this.spec.bounds.ymin;
      if (Number.isFinite(this.spec.bounds.ymax)) ymax = this.spec.bounds.ymax;
    }

    if (Math.abs(xmax - xmin) < 1e-9) {
      xmin -= 1;
      xmax += 1;
    }
    if (Math.abs(ymax - ymin) < 1e-9) {
      ymin -= 1;
      ymax += 1;
    }

    if (this.spec.probeAxis === "y") {
      const xSpan = xmax - xmin;
      if (!Number.isFinite(this.spec.bounds?.xmin)) xmin -= 0.08 * xSpan;
      if (!Number.isFinite(this.spec.bounds?.xmax)) xmax += 0.08 * xSpan;
    } else {
      const ySpan = ymax - ymin;
      if (!Number.isFinite(this.spec.bounds?.ymin)) ymin -= 0.08 * ySpan;
      if (!Number.isFinite(this.spec.bounds?.ymax)) ymax += 0.08 * ySpan;
    }

    return { xmin, xmax, ymin, ymax };
  }

  render() {
    if (!this.ctx || !this.canvas) return;
    const dpr = (typeof window !== "undefined" ? window.devicePixelRatio : 1) || 1;
    const cw = this.canvas.clientWidth || this.canvas.width || 0;
    const ch = this.canvas.clientHeight || this.canvas.height || 0;
    if (cw === 0 || ch === 0) return;

    if (this.canvas.clientWidth && this.canvas.clientHeight) {
      if (this.canvas.width !== Math.floor(cw * dpr) || this.canvas.height !== Math.floor(ch * dpr)) {
        this.canvas.width = Math.floor(cw * dpr);
        this.canvas.height = Math.floor(ch * dpr);
      }
    }

    const pal = this._palette();
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, cw, ch);

    const plotW = Math.max(40, cw - this.pad.left - this.pad.right);
    const plotH = Math.max(40, ch - this.pad.top - this.pad.bottom);

    if (!this.spec || !this.spec.series?.length) {
      if (this.hud && this.spec?.defaultHud) {
        this.hud.textContent = this.spec.defaultHud;
      }
      if (this.spec?.emptyMessage) {
        ctx.save();
        ctx.strokeStyle = pal.frame;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(this.pad.left, this.pad.top, plotW, plotH);
        const col = this.spec.emptyTone === "primary" ? pal.primary : pal.coral;
        const bw = Math.min(plotW - 24, 460);
        const subText =
          this.spec.emptySub || "Refine query with 2D equations (u=..., v=...) or 2D geometry";
        ctx.font = '12px "IBM Plex Sans", sans-serif';
        const words = subText.split(/\s+/);
        const subLines = [];
        let cur = "";
        for (const w of words) {
          const test = cur ? `${cur} ${w}` : w;
          if (ctx.measureText(test).width > bw - 28 && cur) {
            subLines.push(cur);
            cur = w;
          } else {
            cur = test;
          }
        }
        if (cur) subLines.push(cur);

        const bh = 48 + subLines.length * 18;
        const bx = this.pad.left + (plotW - bw) * 0.5;
        const by = this.pad.top + (plotH - bh) * 0.5;
        ctx.fillStyle = pal.boxBg;
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(bx, by, bw, bh);
        ctx.fillStyle = this._resolveTextColor(this.spec.emptyTone === "primary" ? "primary" : "coral", pal.labelInk);
        ctx.font = '700 13.5px "Space Grotesk", "IBM Plex Sans", sans-serif';
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(this.spec.emptyMessage, this.pad.left + plotW * 0.5, by + 24);
        ctx.fillStyle = pal.tickInk;
        ctx.font = '12px "IBM Plex Sans", sans-serif';
        subLines.forEach((line, li) => {
          ctx.fillText(line, this.pad.left + plotW * 0.5, by + 44 + li * 18);
        });
        ctx.restore();
      }
      return;
    }

    const range = this._computeRange();
    if (!range) return;
    this._lastRange = range;
    const { xmin, xmax, ymin, ymax } = range;

    const toPx = (wx, wy) => [
      this.pad.left + ((wx - xmin) / (xmax - xmin)) * plotW,
      this.pad.top + (1 - (wy - ymin) / (ymax - ymin)) * plotH,
    ];

    const xTicks = niceTicks(xmin, xmax, 5);
    const yTicks = niceTicks(ymin, ymax, 5);

    ctx.save();
    ctx.beginPath();
    ctx.rect(this.pad.left, this.pad.top, plotW, plotH);
    ctx.clip();

    // 1. Calibrated Grid aligned to Wilkinson/Heckbert niceTicks
    ctx.strokeStyle = pal.grid;
    ctx.lineWidth = 1;
    for (const wx of xTicks) {
      const [gx] = toPx(wx, ymin);
      ctx.beginPath();
      ctx.moveTo(gx, this.pad.top);
      ctx.lineTo(gx, this.pad.top + plotH);
      ctx.stroke();
    }
    for (const wy of yTicks) {
      const [, gy] = toPx(xmin, wy);
      ctx.beginPath();
      ctx.moveTo(this.pad.left, gy);
      ctx.lineTo(this.pad.left + plotW, gy);
      ctx.stroke();
    }

    // Origin Zero Axes
    ctx.strokeStyle = pal.axis;
    ctx.lineWidth = 1.25;
    if (ymin < 0 && ymax > 0) {
      const [, zy] = toPx(xmin, 0);
      ctx.beginPath();
      ctx.moveTo(this.pad.left, zy);
      ctx.lineTo(this.pad.left + plotW, zy);
      ctx.stroke();
    }
    if (xmin < 0 && xmax > 0) {
      const [zx] = toPx(0, ymin);
      ctx.beginPath();
      ctx.moveTo(zx, this.pad.top);
      ctx.lineTo(zx, this.pad.top + plotH);
      ctx.stroke();
    }

    // 2. Horizontal Shaded Bands (e.g., Herschel-Bulkley Solid Plug Zone)
    if (this.spec.hBands?.length) {
      for (const hb of this.spec.hBands) {
        const [, py1] = toPx(xmin, hb.yMax);
        const [, py0] = toPx(xmin, hb.yMin);
        ctx.save();
        if (hb.fill) {
          ctx.fillStyle = hb.fill;
          ctx.globalAlpha = 1;
        } else {
          ctx.globalAlpha = pal.shadeAlpha;
          ctx.fillStyle = this._resolveColor(hb.color, pal.amber);
        }
        ctx.fillRect(this.pad.left, py1, plotW, Math.max(2, py0 - py1));
        if (hb.label) {
          ctx.globalAlpha = 0.98;
          ctx.fillStyle = this._resolveTextColor(hb.color, pal.amber);
          ctx.font = '600 12px "IBM Plex Sans", sans-serif';
          ctx.textAlign = "right";
          ctx.fillText(hb.label, this.pad.left + plotW - 10, (py0 + py1) * 0.5 + 4);
        }
        ctx.restore();
      }
    }

    // 3. Tuned Shaded Difference / Error Band (drawn underneath curves)
    if (this.spec.shadeDiff && this.spec.series.length >= 2) {
      const s0 = this.spec.series[0];
      const s1 = this.spec.series[1];
      if (s0.x?.length > 1 && s0.x.length === s1.x?.length) {
        ctx.save();
        ctx.globalAlpha = pal.shadeAlpha;
        ctx.fillStyle = pal.shadeColor;
        ctx.beginPath();
        let started = false;
        for (let idx = 0; idx < s0.x.length; idx++) {
          const vx = s0.x[idx];
          const vy = s0.y[idx];
          if (!Number.isFinite(vx) || !Number.isFinite(vy)) continue;
          const [px, py] = toPx(vx, vy);
          if (!started) {
            ctx.moveTo(px, py);
            started = true;
          } else {
            ctx.lineTo(px, py);
          }
        }
        for (let idx = s1.x.length - 1; idx >= 0; idx--) {
          const vx = s1.x[idx];
          const vy = s1.y[idx];
          if (!Number.isFinite(vx) || !Number.isFinite(vy)) continue;
          const [px, py] = toPx(vx, vy);
          ctx.lineTo(px, py);
        }
        if (started) {
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }
    }

    // 4. Reference Vertical Markers & Lines (>= 12px font)
    const vGuides = [
      ...(Array.isArray(this.spec.vMarkers) ? this.spec.vMarkers : []),
      ...(Array.isArray(this.spec.vLines) ? this.spec.vLines : []),
    ];
    for (const m of vGuides) {
      if (!Number.isFinite(m.x) || m.x < xmin || m.x > xmax) continue;
      const [mx] = toPx(m.x, ymin);
      const col = this._resolveColor(m.color, pal.tickInk);
      ctx.save();
      if (m.dashed !== false) ctx.setLineDash([5, 4]);
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.35;
      ctx.beginPath();
      ctx.moveTo(mx, this.pad.top);
      ctx.lineTo(mx, this.pad.top + plotH);
      ctx.stroke();
      ctx.restore();
      if (m.label) {
        ctx.save();
        ctx.fillStyle = this._resolveTextColor(m.color, pal.tickInk);
        ctx.font = '600 12px "IBM Plex Mono", monospace';
        const nearRight = mx > this.pad.left + plotW - 105;
        ctx.textAlign = nearRight ? "right" : "left";
        ctx.textBaseline = "alphabetic";
        const lx = nearRight ? mx - 5 : mx + 5;
        ctx.fillText(m.label, lx, this.pad.top + 16);
        ctx.restore();
      }
    }

    // 5. Reference Horizontal Markers & Lines (>= 12px font)
    const hGuides = [
      ...(Array.isArray(this.spec.hMarkers) ? this.spec.hMarkers : []),
      ...(Array.isArray(this.spec.hLines) ? this.spec.hLines : []),
    ];
    for (const m of hGuides) {
      if (!Number.isFinite(m.y) || m.y < ymin || m.y > ymax) continue;
      const [, my] = toPx(xmin, m.y);
      const col = this._resolveColor(m.color, pal.amber);
      ctx.save();
      if (m.dashed !== false) ctx.setLineDash([5, 4]);
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.35;
      ctx.beginPath();
      ctx.moveTo(this.pad.left, my);
      ctx.lineTo(this.pad.left + plotW, my);
      ctx.stroke();
      ctx.restore();
      if (m.label) {
        ctx.save();
        ctx.fillStyle = this._resolveTextColor(m.color, pal.amber);
        ctx.font = '600 12px "IBM Plex Mono", monospace';
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        const ly = my < this.pad.top + 20 ? my + 16 : my - 6;
        ctx.fillText(m.label, this.pad.left + 8, ly);
        ctx.restore();
      }
    }

    // 6. Plot Series (cleanly above all shaded bands with Okabe-Ito strokes)
    for (let si = 0; si < this.spec.series.length; si++) {
      const s = this.spec.series[si];
      const fallbackCol = si === 0 ? pal.primary : si === 1 ? pal.coral : pal.secondary;
      ctx.save();
      ctx.strokeStyle = this._resolveColor(s.color, fallbackCol);
      ctx.lineWidth = s.width || 2.5;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      if (s.dashed) ctx.setLineDash([6, 4]);
      ctx.beginPath();
      let started = false;
      const len = Math.min(s.x?.length || 0, s.y?.length || 0);
      for (let i = 0; i < len; i++) {
        if (!Number.isFinite(s.x[i]) || !Number.isFinite(s.y[i])) {
          started = false;
          continue;
        }
        const [px, py] = toPx(s.x[i], s.y[i]);
        if (!started) {
          ctx.moveTo(px, py);
          started = true;
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.stroke();
      ctx.restore();
    }

    // 7. Optional Annotations
    if (this.spec.annotations?.length) {
      for (const ann of this.spec.annotations) {
        if (!Number.isFinite(ann.x) || !Number.isFinite(ann.y) || !ann.text) continue;
        const [ax, ay] = toPx(ann.x, ann.y);
        const col = this._resolveColor(ann.color, pal.labelInk);
        ctx.save();
        ctx.font = '600 12px "IBM Plex Sans", sans-serif';
        const tw = ctx.measureText(ann.text).width + 12;
        const th = 22;
        let bx = ax - tw * 0.5;
        if (ann.align === "left") bx = ax;
        else if (ann.align === "right") bx = ax - tw;
        const by = ay - th * 0.5;
        ctx.fillStyle = pal.boxBg;
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") ctx.roundRect(bx, by, tw, th, 4);
        else ctx.rect(bx, by, tw, th);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = this._resolveTextColor(ann.color, pal.labelInk);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(ann.text, bx + tw * 0.5, by + th * 0.5 + 0.5);
        ctx.restore();
      }
    }

    // 8. External Synced Crosshair from FlowCanvasEngine
    if (this.externalHover) {
      const ex = this.externalHover.worldX;
      const ey = this.externalHover.worldY;
      const xIn = ex !== null && ex >= xmin && ex <= xmax;
      const yIn = ey !== null && ey >= ymin && ey <= ymax;
      if (xIn || yIn) {
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = pal.extCrosshair;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        let px = null;
        let py = null;
        if (xIn) {
          [px] = toPx(ex, ymin);
          ctx.moveTo(px, this.pad.top);
          ctx.lineTo(px, this.pad.top + plotH);
        }
        if (yIn) {
          [, py] = toPx(xmin, ey);
          ctx.moveTo(this.pad.left, py);
          ctx.lineTo(this.pad.left + plotW, py);
        }
        ctx.stroke();

        // Highlight primary series sample if aligned along active axis
        const s0 = this.spec.series[0];
        if (s0) {
          let dotX = xIn ? ex : null;
          let dotY = yIn ? ey : null;
          if (this.spec.probeAxis === "y" && yIn) {
            const ix = this._interpSeries(s0.y, s0.x, ey);
            if (ix !== null && Number.isFinite(ix)) dotX = ix;
          } else if (this.spec.probeAxis !== "y" && xIn) {
            const iy = this._interpSeries(s0.x, s0.y, ex);
            if (iy !== null && Number.isFinite(iy)) dotY = iy;
          }
          if (dotX !== null && dotY !== null) {
            const [dx, dy] = toPx(dotX, dotY);
            ctx.setLineDash([]);
            ctx.fillStyle = pal.bg;
            ctx.strokeStyle = pal.extCrosshair;
            ctx.lineWidth = 2.2;
            ctx.beginPath();
            ctx.arc(dx, dy, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
        }
        ctx.restore();
      }
    }

    // 9. Local Hover Crosshair + HUD Readout (zero "-0.000")
    const axis = this.spec.probeAxis === "y" ? "y" : "x";
    if (this.hoverFrac !== null) {
      if (axis === "y") {
        const wy = ymin + this.hoverFrac * (ymax - ymin);
        const [, hy] = toPx(xmin, wy);
        ctx.save();
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = pal.crosshair;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(this.pad.left, hy);
        ctx.lineTo(this.pad.left + plotW, hy);
        ctx.stroke();
        ctx.restore();

        if (this.hud) {
          const parts = [`${this.spec.yShort || "y"}: ${this._fmt(wy)}`];
          for (const s of this.spec.series) {
            const val = this._interpSeries(s.y, s.x, wy);
            parts.push(`${s.name}: ${this._fmt(val)}`);
          }
          this.hud.textContent = parts.join(" | ");
        }
      } else {
        const wx = xmin + this.hoverFrac * (xmax - xmin);
        const [hx] = toPx(wx, ymin);
        ctx.save();
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = pal.crosshair;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(hx, this.pad.top);
        ctx.lineTo(hx, this.pad.top + plotH);
        ctx.stroke();
        ctx.restore();

        if (this.hud) {
          const parts = [`${this.spec.xShort || "x"}: ${this._fmt(wx)}`];
          for (const s of this.spec.series) {
            const val = this._interpSeries(s.x, s.y, wx);
            parts.push(`${s.name}: ${this._fmt(val)}`);
          }
          this.hud.textContent = parts.join(" | ");
        }
      }
    } else if (this.hud) {
      this.hud.textContent = this.spec.defaultHud || "Hover over the curve to inspect exact values";
    }

    ctx.restore();

    // 10. Outer Frame, Nice Numeric Ticks (>= 12px), and Explicit X & Y Axis Titles
    ctx.strokeStyle = pal.frame;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(this.pad.left, this.pad.top, plotW, plotH);

    const xDec = tickDecimals(xTicks);
    const yDec = tickDecimals(yTicks);

    ctx.fillStyle = pal.tickInk;
    ctx.font = '12px "IBM Plex Mono", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    for (const vx of xTicks) {
      const [px] = toPx(vx, ymin);
      ctx.fillText(fmtNum(vx, xDec), px, this.pad.top + plotH + 17);
    }

    ctx.textAlign = "right";
    for (const vy of yTicks) {
      const [, py] = toPx(xmin, vy);
      ctx.fillText(fmtNum(vy, yDec), this.pad.left - 8, py + 4);
    }

    // X Axis Title
    ctx.fillStyle = pal.labelInk;
    ctx.font = '600 12.5px "IBM Plex Sans", sans-serif';
    ctx.textAlign = "center";
    ctx.fillText(this.spec.xLabel || "", this.pad.left + plotW * 0.5, ch - 10);

    // Y Axis Title (rotated -90 deg)
    if (this.spec.yLabel) {
      ctx.save();
      ctx.translate(16, this.pad.top + plotH * 0.5);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "center";
      ctx.fillText(this.spec.yLabel, 0, 0);
      ctx.restore();
    }
  }

  _interpSeries(indArr, depArr, target) {
    if (!indArr?.length || indArr.length !== depArr?.length) return null;
    const t = Number(target);
    if (!Number.isFinite(t)) return null;
    for (let i = 0; i < indArr.length - 1; i++) {
      const a0 = indArr[i];
      const a1 = indArr[i + 1];
      if (!Number.isFinite(a0) || !Number.isFinite(a1)) continue;
      if ((t >= a0 && t <= a1) || (t >= a1 && t <= a0)) {
        const span = a1 - a0;
        const frac = Math.abs(span) < 1e-12 ? 0 : (t - a0) / span;
        const d0 = depArr[i];
        const d1 = depArr[i + 1];
        if (!Number.isFinite(d0) || !Number.isFinite(d1)) return null;
        return d0 + frac * (d1 - d0);
      }
    }
    return null;
  }

  _fmt(v, d = null) {
    if (v === null || v === undefined || v === "") return "-";
    const num = Number(v);
    if (!Number.isFinite(num)) return "-";
    if (d !== null) return fmtNum(num, d);
    const av = Math.abs(num);
    if (av >= 10000) return `${fmtNum(num / 1000, 1)}k`;
    if (av >= 100) return fmtNum(num, 1);
    if (av >= 10) return fmtNum(num, 2);
    return fmtNum(num, 3);
  }
}
