/**
 * Precision 2D Comparison Plot Canvas (True Governing Physics vs. Naive Formula + Axis-Aware Crosshair Probe).
 */
export class CurvePlotEngine {
  constructor(canvasEl, hudEl) {
    this.canvas = canvasEl;
    this.hud = hudEl;
    this.ctx = canvasEl.getContext("2d");
    this.spec = null;
    this.hoverFrac = null; // Normalized [0..1] along active probeAxis ("x" from left->right, "y" from top->bottom)
    this.pad = { left: 68, right: 20, top: 20, bottom: 44 };

    this.canvas.addEventListener("mousemove", (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const plotW = Math.max(40, this.canvas.clientWidth - this.pad.left - this.pad.right);
      const plotH = Math.max(40, this.canvas.clientHeight - this.pad.top - this.pad.bottom);
      const axis = this.spec?.probeAxis === "y" ? "y" : "x";
      const frac = axis === "y" ? 1 - (py - this.pad.top) / plotH : (px - this.pad.left) / plotW;
      if (frac >= 0 && frac <= 1) {
        this.hoverFrac = frac;
        this.render();
      }
    });
    this.canvas.addEventListener("mouseleave", () => {
      this.hoverFrac = null;
      this.render();
    });

    window.addEventListener("resize", () => this.render());
    if (typeof ResizeObserver !== "undefined") {
      this._ro = new ResizeObserver(() => this.render());
      this._ro.observe(this.canvas);
    }
  }

  _isDark() {
    return document.documentElement.getAttribute("data-theme") === "dark";
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
        shadeFill: "rgba(248, 113, 113, 0.16)",
        boxBg: "rgba(15, 23, 42, 0.92)",
      };
    }
    return {
      bg: "#FCFBF9",
      grid: "#E8E4DC",
      axis: "#C8C1B4",
      frame: "#9CA3AF",
      tickInk: "#4B5563",
      labelInk: "#111827",
      primary: "#1D4ED8",
      teal: "#0F766E",
      amber: "#D97706",
      coral: "#DC2626",
      ok: "#15803D",
      shadeFill: "rgba(220, 38, 38, 0.11)",
      boxBg: "rgba(255, 255, 255, 0.95)",
    };
  }

  _resolveColor(col, fallback) {
    const pal = this._palette();
    if (!col) return fallback || pal.primary;
    const c = String(col).toLowerCase();
    if (c === "primary") return pal.primary;
    if (c === "teal") return pal.teal;
    if (c === "amber") return pal.amber;
    if (c === "coral" || c === "trap") return pal.coral;
    if (c === "ok") return pal.ok;
    if (!this._isDark()) {
      if (c === "#d9e2ec" || c === "#f0f6fc") return "#0F172A";
      if (c === "#e6a23c") return "#1D4ED8"; // Re-map primary true-physics amber on white paper to blueprint cobalt unless explicitly ochre
      if (c === "#e05a47") return "#DC2626";
      if (c === "#58b368") return "#15803D";
      if (c === "#9fb3c8" || c === "#7f8ea3") return "#475569";
    }
    return col;
  }

  setPlot(spec) {
    this.spec = spec;
    this.render();
  }

  render() {
    const dpr = window.devicePixelRatio || 1;
    const cw = this.canvas.clientWidth;
    const ch = this.canvas.clientHeight;
    if (cw === 0 || ch === 0) return;

    if (this.canvas.width !== Math.floor(cw * dpr) || this.canvas.height !== Math.floor(ch * dpr)) {
      this.canvas.width = Math.floor(cw * dpr);
      this.canvas.height = Math.floor(ch * dpr);
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
        ctx.strokeRect(this.pad.left, this.pad.top, plotW, plotH);
        const col = this.spec.emptyTone === "primary" ? pal.primary : pal.coral;
        const bw = Math.min(plotW - 24, 440);
        const subText = this.spec.emptySub || "Refine query with 2D equations (u=..., v=...) or 2D geometry";
        ctx.font = '11px "IBM Plex Sans", sans-serif';
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

        const bh = 44 + subLines.length * 16;
        const bx = this.pad.left + (plotW - bw) * 0.5;
        const by = this.pad.top + (plotH - bh) * 0.5;
        ctx.fillStyle = pal.boxBg;
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.4;
        ctx.strokeRect(bx, by, bw, bh);
        ctx.fillStyle = col;
        ctx.font = '600 12px "Space Grotesk", "IBM Plex Sans", sans-serif';
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(this.spec.emptyMessage, this.pad.left + plotW * 0.5, by + 23);
        ctx.fillStyle = pal.tickInk;
        ctx.font = '11px "IBM Plex Sans", sans-serif';
        subLines.forEach((line, li) => {
          ctx.fillText(line, this.pad.left + plotW * 0.5, by + 42 + li * 16);
        });
        ctx.restore();
      }
      return;
    }

    let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
    for (const s of this.spec.series) {
      for (let i = 0; i < s.x.length; i++) {
        const vx = s.x[i], vy = s.y[i];
        if (!Number.isFinite(vx) || !Number.isFinite(vy)) continue;
        xmin = Math.min(xmin, vx);
        xmax = Math.max(xmax, vx);
        ymin = Math.min(ymin, vy);
        ymax = Math.max(ymax, vy);
      }
    }
    if (!Number.isFinite(xmin) || !Number.isFinite(ymin)) return;

    if (this.spec.bounds) {
      if (Number.isFinite(this.spec.bounds.xmin)) xmin = this.spec.bounds.xmin;
      if (Number.isFinite(this.spec.bounds.xmax)) xmax = this.spec.bounds.xmax;
      if (Number.isFinite(this.spec.bounds.ymin)) ymin = this.spec.bounds.ymin;
      if (Number.isFinite(this.spec.bounds.ymax)) ymax = this.spec.bounds.ymax;
    }

    if (Math.abs(xmax - xmin) < 1e-9) { xmin -= 1; xmax += 1; }
    if (Math.abs(ymax - ymin) < 1e-9) { ymin -= 1; ymax += 1; }

    if (this.spec.probeAxis === "y") {
      const xSpan = xmax - xmin;
      if (!this.spec.bounds?.xmin) xmin -= 0.08 * xSpan;
      if (!this.spec.bounds?.xmax) xmax += 0.08 * xSpan;
    } else {
      const ySpan = ymax - ymin;
      if (!this.spec.bounds?.ymin) ymin -= 0.08 * ySpan;
      if (!this.spec.bounds?.ymax) ymax += 0.08 * ySpan;
    }

    const toPx = (wx, wy) => [
      this.pad.left + ((wx - xmin) / (xmax - xmin)) * plotW,
      this.pad.top + (1 - (wy - ymin) / (ymax - ymin)) * plotH,
    ];

    ctx.save();
    ctx.beginPath();
    ctx.rect(this.pad.left, this.pad.top, plotW, plotH);
    ctx.clip();

    // Grid
    ctx.strokeStyle = pal.grid;
    ctx.lineWidth = 1;
    const nt = 5;
    for (let k = 0; k <= nt; k++) {
      const gx = this.pad.left + (k / nt) * plotW;
      const gy = this.pad.top + (k / nt) * plotH;
      ctx.beginPath(); ctx.moveTo(gx, this.pad.top); ctx.lineTo(gx, this.pad.top + plotH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(this.pad.left, gy); ctx.lineTo(this.pad.left + plotW, gy); ctx.stroke();
    }

    // Origin Zero Axes
    ctx.strokeStyle = pal.axis;
    ctx.lineWidth = 1.2;
    if (ymin < 0 && ymax > 0) {
      const [, zy] = toPx(xmin, 0);
      ctx.beginPath(); ctx.moveTo(this.pad.left, zy); ctx.lineTo(this.pad.left + plotW, zy); ctx.stroke();
    }
    if (xmin < 0 && xmax > 0) {
      const [zx] = toPx(0, ymin);
      ctx.beginPath(); ctx.moveTo(zx, this.pad.top); ctx.lineTo(zx, this.pad.top + plotH); ctx.stroke();
    }

    // Horizontal shaded bands (e.g. Plug flow core)
    if (this.spec.hBands) {
      for (const hb of this.spec.hBands) {
        const [, py1] = toPx(xmin, hb.yMax);
        const [, py0] = toPx(xmin, hb.yMin);
        ctx.fillStyle = hb.fill || "rgba(217, 119, 6, 0.14)";
        ctx.fillRect(this.pad.left, py1, plotW, Math.max(2, py0 - py1));
      }
    }

    // Shade divergence band between series[0] (True) and series[1] (Naive)
    if (this.spec.shadeDiff && this.spec.series.length >= 2) {
      const s0 = this.spec.series[0];
      const s1 = this.spec.series[1];
      if (s0.x.length === s1.x.length && s0.x.length > 1) {
        ctx.fillStyle = pal.shadeFill;
        ctx.beginPath();
        let started = false;
        s0.x.forEach((vx, idx) => {
          const vy = s0.y[idx];
          if (!Number.isFinite(vx) || !Number.isFinite(vy)) return;
          const [px, py] = toPx(vx, vy);
          if (!started) { ctx.moveTo(px, py); started = true; }
          else ctx.lineTo(px, py);
        });
        for (let idx = s1.x.length - 1; idx >= 0; idx--) {
          const vx = s1.x[idx], vy = s1.y[idx];
          if (!Number.isFinite(vx) || !Number.isFinite(vy)) continue;
          const [px, py] = toPx(vx, vy);
          ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
      }
    }

    // Reference Vertical Markers
    if (this.spec.vMarkers) {
      for (const m of this.spec.vMarkers) {
        if (m.x < xmin || m.x > xmax) continue;
        const [mx] = toPx(m.x, ymin);
        const col = this._resolveColor(m.color, pal.tickInk);
        ctx.save();
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.25;
        ctx.beginPath(); ctx.moveTo(mx, this.pad.top); ctx.lineTo(mx, this.pad.top + plotH); ctx.stroke();
        ctx.restore();
        if (m.label) {
          ctx.fillStyle = col;
          ctx.font = '600 10px "IBM Plex Mono", monospace';
          ctx.textAlign = mx > this.pad.left + plotW - 70 ? "right" : "left";
          const lx = mx > this.pad.left + plotW - 70 ? mx - 4 : mx + 4;
          ctx.fillText(m.label, lx, this.pad.top + 13);
        }
      }
    }

    // Reference Horizontal Markers
    if (this.spec.hMarkers) {
      for (const m of this.spec.hMarkers) {
        if (m.y < ymin || m.y > ymax) continue;
        const [, my] = toPx(xmin, m.y);
        const col = this._resolveColor(m.color, pal.amber);
        ctx.save();
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.25;
        ctx.beginPath(); ctx.moveTo(this.pad.left, my); ctx.lineTo(this.pad.left + plotW, my); ctx.stroke();
        ctx.restore();
        if (m.label) {
          ctx.fillStyle = col;
          ctx.font = '600 10px "IBM Plex Mono", monospace';
          ctx.textAlign = "left";
          ctx.fillText(m.label, this.pad.left + 8, my - 5);
        }
      }
    }

    // Plot Series
    for (const s of this.spec.series) {
      ctx.save();
      ctx.strokeStyle = this._resolveColor(s.color, pal.primary);
      ctx.lineWidth = s.width || 2.3;
      ctx.lineJoin = "round";
      if (s.dashed) ctx.setLineDash([6, 4]);
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < s.x.length; i++) {
        if (!Number.isFinite(s.x[i]) || !Number.isFinite(s.y[i])) {
          started = false;
          continue;
        }
        const [px, py] = toPx(s.x[i], s.y[i]);
        if (!started) { ctx.moveTo(px, py); started = true; }
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Hover Crosshair Line (Vertical for probeAxis="x", Horizontal for probeAxis="y")
    const axis = this.spec.probeAxis === "y" ? "y" : "x";
    if (this.hoverFrac !== null && this.hud) {
      if (axis === "y") {
        const wy = ymin + this.hoverFrac * (ymax - ymin);
        const [, hy] = toPx(xmin, wy);
        ctx.save();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = pal.amber;
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(this.pad.left, hy); ctx.lineTo(this.pad.left + plotW, hy); ctx.stroke();
        ctx.restore();

        const parts = [`${this.spec.yShort || "y"}: ${this._fmt(wy)}`];
        for (const s of this.spec.series) {
          const val = this._interpSeries(s.y, s.x, wy);
          parts.push(val !== null ? `${s.name}: ${this._fmt(val)}` : `${s.name}: —`);
        }
        this.hud.textContent = parts.join(" | ");
      } else {
        const wx = xmin + this.hoverFrac * (xmax - xmin);
        const [hx] = toPx(wx, ymin);
        ctx.save();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = pal.amber;
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(hx, this.pad.top); ctx.lineTo(hx, this.pad.top + plotH); ctx.stroke();
        ctx.restore();

        const parts = [`${this.spec.xShort || "x"}: ${this._fmt(wx)}`];
        for (const s of this.spec.series) {
          const val = this._interpSeries(s.x, s.y, wx);
          parts.push(val !== null ? `${s.name}: ${this._fmt(val)}` : `${s.name}: —`);
        }
        this.hud.textContent = parts.join(" | ");
      }
    } else if (this.hud) {
      this.hud.textContent = this.spec.defaultHud || "Hover over the curve to inspect exact values";
    }

    ctx.restore();

    // Outer Frame, Numeric Ticks, and Explicit X & Y Axis Labels
    ctx.strokeStyle = pal.frame;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(this.pad.left, this.pad.top, plotW, plotH);

    ctx.fillStyle = pal.tickInk;
    ctx.font = '10.5px "IBM Plex Mono", monospace';
    ctx.textAlign = "center";
    for (let k = 0; k <= nt; k++) {
      const vx = xmin + (k / nt) * (xmax - xmin);
      const [px] = toPx(vx, ymin);
      ctx.fillText(this._fmt(vx), px, this.pad.top + plotH + 15);
    }

    ctx.textAlign = "right";
    for (let k = 0; k <= nt; k++) {
      const vy = ymin + (k / nt) * (ymax - ymin);
      const [, py] = toPx(xmin, vy);
      ctx.fillText(this._fmt(vy), this.pad.left - 7, py + 3.5);
    }

    // X Axis Title
    ctx.fillStyle = pal.labelInk;
    ctx.font = '600 11.5px "IBM Plex Sans", sans-serif';
    ctx.textAlign = "center";
    ctx.fillText(this.spec.xLabel || "", this.pad.left + plotW * 0.5, ch - 10);

    // Y Axis Title (rotated -90 deg)
    if (this.spec.yLabel) {
      ctx.save();
      ctx.translate(15, this.pad.top + plotH * 0.5);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "center";
      ctx.fillText(this.spec.yLabel, 0, 0);
      ctx.restore();
    }
  }

  _interpSeries(indArr, depArr, target) {
    if (!indArr?.length || indArr.length !== depArr?.length) return null;
    for (let i = 0; i < indArr.length - 1; i++) {
      const a0 = indArr[i], a1 = indArr[i + 1];
      if (!Number.isFinite(a0) || !Number.isFinite(a1)) continue;
      if ((target >= a0 && target <= a1) || (target >= a1 && target <= a0)) {
        const span = a1 - a0;
        const frac = Math.abs(span) < 1e-12 ? 0 : (target - a0) / span;
        const d0 = depArr[i], d1 = depArr[i + 1];
        if (!Number.isFinite(d0) || !Number.isFinite(d1)) return null;
        return d0 + frac * (d1 - d0);
      }
    }
    return null;
  }

  _fmt(v) {
    const av = Math.abs(v);
    if (av < 1e-6) return "0";
    if (av >= 10000) return (v / 1000).toFixed(1) + "k";
    if (av >= 100) return v.toFixed(0);
    if (av >= 1) return v.toFixed(2);
    return v.toFixed(3);
  }
}
