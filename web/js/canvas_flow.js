/**
 * 60fps HTML5 Canvas 2D Fluid Flow & Physics Schematic Visualizer.
 * Features conformal aspect-ratio locking, screen-space tangent vector arrows,
 * live cursor telemetry probing, theme-aware drafting palette, and rich schematics.
 */
export class FlowCanvasEngine {
  constructor(canvasEl, hudEl) {
    this.canvas = canvasEl;
    this.hud = hudEl;
    this.ctx = canvasEl.getContext("2d");
    this.scene = null;
    this.particles = [];
    this.mouseWorld = null;
    this.rafId = null;
    this.pad = { left: 60, right: 20, top: 18, bottom: 44 };

    this._initEvents();
    if (typeof ResizeObserver !== "undefined") {
      this._ro = new ResizeObserver(() => this._render());
      this._ro.observe(this.canvas);
    }
    this._startLoop();
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
        vectorInk: "rgba(148, 163, 184, 0.48)",
        tracerRgb: "147, 197, 253",
        solidFill: "#1E293B",
        solidStroke: "#64748B",
        fluidFill: "rgba(56, 189, 248, 0.16)",
        fluidStroke: "#38BDF8",
        primary: "#58A6FF",
        teal: "#2DD4BF",
        amber: "#F59E0B",
        coral: "#F87171",
        ok: "#3FB950",
        pillBg: "rgba(15, 23, 42, 0.90)",
        pillBorder: "#334155",
        pillInk: "#F1F5F9",
        heatPosRgb: "245, 158, 11",
        heatNegRgb: "248, 113, 113",
      };
    }
    return {
      bg: "#FCFBF9",
      grid: "#E8E4DC",
      axis: "#C8C1B4",
      frame: "#9CA3AF",
      tickInk: "#4B5563",
      labelInk: "#111827",
      vectorInk: "rgba(55, 65, 81, 0.45)",
      tracerRgb: "29, 78, 216",
      solidFill: "#E2E8F0",
      solidStroke: "#334155",
      fluidFill: "rgba(29, 78, 216, 0.12)",
      fluidStroke: "#1D4ED8",
      primary: "#1D4ED8",
      teal: "#0F766E",
      amber: "#D97706",
      coral: "#DC2626",
      ok: "#15803D",
      pillBg: "rgba(255, 255, 255, 0.94)",
      pillBorder: "#CBD5E1",
      pillInk: "#0F172A",
      heatPosRgb: "217, 119, 6",
      heatNegRgb: "37, 99, 235",
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
      // Automatically map legacy dark-mode bright inks onto readable high-contrast inks in Light Mode
      if (c === "#d9e2ec" || c === "#f0f6fc") return "#0F172A";
      if (c === "#e6a23c") return "#B45309";
      if (c === "#e05a47") return "#DC2626";
      if (c === "#58b368") return "#15803D";
      if (c === "#9fb3c8" || c === "#7f8ea3") return "#475569";
    }
    return col;
  }

  _initEvents() {
    this.canvas.addEventListener("mousemove", (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      this.mouseWorld = this._pixelToWorld(px, py);
      this._updateProbeHud();
    });
    this.canvas.addEventListener("mouseleave", () => {
      this.mouseWorld = null;
      this._updateProbeHud();
    });
  }

  setScene(scene) {
    this.scene = scene;
    this._seedParticles(180);
    this._updateProbeHud();
  }

  _getTransform() {
    const cw = this.canvas.clientWidth || 600;
    const ch = this.canvas.clientHeight || 400;
    const availW = Math.max(40, cw - this.pad.left - this.pad.right);
    const availH = Math.max(40, ch - this.pad.top - this.pad.bottom);

    const bounds = this.scene?.bounds || [0, 1, 0, 1];
    const [xmin, xmax, ymin, ymax] = bounds;
    const worldW = Math.max(1e-9, xmax - xmin);
    const worldH = Math.max(1e-9, ymax - ymin);

    const aspectLock = Boolean(this.scene?.aspectLock);
    let scaleX = availW / worldW;
    let scaleY = availH / worldH;
    let ox = this.pad.left;
    let oy = this.pad.top;
    let boxW = availW;
    let boxH = availH;

    if (aspectLock) {
      const uniform = Math.min(scaleX, scaleY);
      scaleX = uniform;
      scaleY = uniform;
      boxW = worldW * uniform;
      boxH = worldH * uniform;
      ox = this.pad.left + (availW - boxW) * 0.5;
      oy = this.pad.top + (availH - boxH) * 0.5;
    }

    return {
      cw,
      ch,
      xmin,
      xmax,
      ymin,
      ymax,
      worldW,
      worldH,
      scaleX,
      scaleY,
      ox,
      oy,
      boxW,
      boxH,
    };
  }

  _worldToPixel(wx, wy, tr = null) {
    const t = tr || this._getTransform();
    const px = t.ox + (wx - t.xmin) * t.scaleX;
    const py = t.oy + (t.ymax - wy) * t.scaleY;
    return [px, py];
  }

  _pixelToWorld(px, py) {
    if (!this.scene?.bounds) return null;
    const t = this._getTransform();
    const wx = t.xmin + (px - t.ox) / t.scaleX;
    const wy = t.ymax - (py - t.oy) / t.scaleY;
    if (wx < t.xmin || wx > t.xmax || wy < t.ymin || wy > t.ymax) return null;
    return [wx, wy];
  }

  _insideObstacle(wx, wy) {
    if (this.scene?.cylinderRadius) {
      const a = this.scene.cylinderRadius;
      if (wx * wx + wy * wy <= a * a * 1.03) return true;
    }
    if (this.scene?.solidRects?.length) {
      for (const [rx0, ry0, rw, rh] of this.scene.solidRects) {
        if (wx >= rx0 && wx <= rx0 + rw && wy >= ry0 && wy <= ry0 + rh) return true;
      }
    }
    return false;
  }

  _sampleField(wx, wy) {
    const f = this.scene?.field;
    if (!f || !f.xs?.length || !f.ys?.length) return null;
    const xs = f.xs;
    const ys = f.ys;
    const nx = xs.length;
    const ny = ys.length;
    const xmin = xs[0], xmax = xs[nx - 1];
    const ymin = ys[0], ymax = ys[ny - 1];
    if (wx < xmin || wx > xmax || wy < ymin || wy > ymax) return null;

    const fx = ((wx - xmin) / Math.max(1e-9, xmax - xmin)) * (nx - 1);
    const fy = ((wy - ymin) / Math.max(1e-9, ymax - ymin)) * (ny - 1);
    const i0 = Math.max(0, Math.min(nx - 2, Math.floor(fx)));
    const j0 = Math.max(0, Math.min(ny - 2, Math.floor(fy)));
    const tx = fx - i0;
    const ty = fy - j0;

    const interp = (grid) => {
      if (!grid) return 0;
      const g00 = grid[j0]?.[i0];
      const g10 = grid[j0]?.[i0 + 1];
      const g01 = grid[j0 + 1]?.[i0];
      const g11 = grid[j0 + 1]?.[i0 + 1];
      if ([g00, g10, g01, g11].some((v) => v === null || v === undefined || !Number.isFinite(v))) {
        return null;
      }
      return (1 - tx) * (1 - ty) * g00 + tx * (1 - ty) * g10 + (1 - tx) * ty * g01 + tx * ty * g11;
    };

    const u = interp(f.U);
    const v = interp(f.V);
    const vort = f.vorticity ? interp(f.vorticity) : null;
    const cp = f.cp ? interp(f.cp) : null;
    if (u === null || v === null) return null;
    return { u, v, speed: Math.hypot(u, v), vort, cp };
  }

  _seedParticles(count) {
    this.particles = [];
    if (!this.scene?.bounds) return;
    const [xmin, xmax, ymin, ymax] = this.scene.bounds;
    for (let i = 0; i < count; i++) {
      let x = xmin + Math.random() * (xmax - xmin);
      let y = ymin + Math.random() * (ymax - ymin);
      if (this._insideObstacle(x, y)) {
        x = xmin + 0.05 * (xmax - xmin);
      }
      this.particles.push({
        x,
        y,
        life: Math.floor(Math.random() * 110),
        maxLife: 80 + Math.floor(Math.random() * 80),
      });
    }
  }

  _updateProbeHud() {
    if (!this.hud) return;
    if (!this.mouseWorld) {
      if (this.scene) {
        this.hud.textContent =
          this.scene.defaultHud || "Move cursor over the flow field to inspect live velocity and vorticity";
      }
      return;
    }
    const [wx, wy] = this.mouseWorld;
    const sample = this._sampleField(wx, wy);
    if (!sample) {
      this.hud.textContent = `X: ${wx.toFixed(2)} | Y: ${wy.toFixed(2)} | Schematic region (no velocity grid at cursor)`;
      return;
    }
    const vortTxt = sample.vort !== null ? ` | Ωz: ${sample.vort.toFixed(2)} s⁻¹` : "";
    const cpTxt = sample.cp !== null ? ` | Cp: ${sample.cp.toFixed(2)}` : "";
    this.hud.textContent =
      `X: ${wx.toFixed(2)} | Y: ${wy.toFixed(2)} | u: ${sample.u.toFixed(2)} | v: ${sample.v.toFixed(2)} | |V|: ${sample.speed.toFixed(2)}${vortTxt}${cpTxt}`;
  }

  _startLoop() {
    const tick = () => {
      this._render();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  _drawArrow(ctx, x0, y0, x1, y1, headLen = 5, color = null, width = 1.15) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const mag = Math.hypot(dx, dy);
    if (mag < 2) return;
    const ang = Math.atan2(dy, dx);
    if (color) ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x1 - headLen * Math.cos(ang - 0.52), y1 - headLen * Math.sin(ang - 0.52));
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - headLen * Math.cos(ang + 0.52), y1 - headLen * Math.sin(ang + 0.52));
    ctx.stroke();
  }

  _drawPill(ctx, px, py, text, color, align = "center") {
    const pal = this._palette();
    ctx.save();
    ctx.font = '600 10.5px "IBM Plex Sans", sans-serif';
    const w = ctx.measureText(text).width + 12;
    const h = 20;
    let bx = px - w * 0.5;
    if (align === "left") bx = px;
    else if (align === "right") bx = px - w;
    const by = py - h * 0.5;
    ctx.fillStyle = pal.pillBg;
    ctx.strokeStyle = color || pal.pillBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(bx, by, w, h, 4) : ctx.rect(bx, by, w, h);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color || pal.pillInk;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, bx + w * 0.5, by + h * 0.5 + 0.5);
    ctx.restore();
  }

  _render() {
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

    if (!this.scene) return;

    const tr = this._getTransform();
    const { xmin, xmax, ymin, ymax, ox, oy, boxW, boxH, scaleX, scaleY } = tr;
    const nTicks = 5;

    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, boxW, boxH);
    ctx.clip();

    // 1. Subtle vorticity / Cp heatmap cells
    if (this.scene.field?.vorticity || this.scene.field?.cp) {
      const f = this.scene.field;
      const scalar = f.cp || f.vorticity;
      const ny = scalar.length;
      const nx = scalar[0].length;
      let maxAbs = 0;
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const val = scalar[j][i];
          if (val !== null && Number.isFinite(val)) {
            maxAbs = Math.max(maxAbs, Math.abs(val));
          }
        }
      }
      const scaleMax = f.cp ? 2.5 : Math.max(0.25, Math.min(20.0, maxAbs * 0.75));
      for (let j = 0; j < ny - 1; j++) {
        for (let i = 0; i < nx - 1; i++) {
          const val = scalar[j][i];
          if (val === null || !Number.isFinite(val)) continue;
          const norm = Math.max(-1, Math.min(1, val / scaleMax));
          if (Math.abs(norm) < 0.04) continue;
          ctx.fillStyle =
            norm > 0
              ? `rgba(${pal.heatPosRgb}, ${(norm * 0.22).toFixed(3)})`
              : `rgba(${pal.heatNegRgb}, ${(Math.abs(norm) * 0.22).toFixed(3)})`;
          const [px0, py1] = this._worldToPixel(f.xs[i], f.ys[j], tr);
          const [px1, py0] = this._worldToPixel(f.xs[i + 1], f.ys[j + 1], tr);
          ctx.fillRect(px0, py0, Math.abs(px1 - px0) + 0.8, Math.abs(py1 - py0) + 0.8);
        }
      }
    }

    // 2. Calibrated drafting grid
    ctx.strokeStyle = pal.grid;
    ctx.lineWidth = 1;
    for (let k = 0; k <= nTicks; k++) {
      const wx = xmin + (k / nTicks) * (xmax - xmin);
      const wy = ymin + (k / nTicks) * (ymax - ymin);
      const [px] = this._worldToPixel(wx, ymin, tr);
      const [, py] = this._worldToPixel(xmin, wy, tr);
      ctx.beginPath(); ctx.moveTo(px, oy); ctx.lineTo(px, oy + boxH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox, py); ctx.lineTo(ox + boxW, py); ctx.stroke();
    }

    // Origin axes if inside view
    ctx.strokeStyle = pal.axis;
    ctx.lineWidth = 1.2;
    if (xmin < 0 && xmax > 0) {
      const [zx] = this._worldToPixel(0, ymin, tr);
      ctx.beginPath(); ctx.moveTo(zx, oy); ctx.lineTo(zx, oy + boxH); ctx.stroke();
    }
    if (ymin < 0 && ymax > 0) {
      const [, zy] = this._worldToPixel(xmin, 0, tr);
      ctx.beginPath(); ctx.moveTo(ox, zy); ctx.lineTo(ox + boxW, zy); ctx.stroke();
    }

    // 3. Screen-space tangent velocity arrows WITH arrowheads (compensated for scaleX vs scaleY!)
    if (this.scene.field?.xs && !this.scene.hideVectors) {
      const f = this.scene.field;
      const stepX = Math.max(1, Math.floor(f.xs.length / 13));
      const stepY = Math.max(1, Math.floor(f.ys.length / 13));
      const baseLen = Math.min(boxW, boxH) * 0.048;
      ctx.strokeStyle = pal.vectorInk;
      for (let j = 1; j < f.ys.length - 1; j += stepY) {
        for (let i = 1; i < f.xs.length - 1; i += stepX) {
          const wx = f.xs[i];
          const wy = f.ys[j];
          if (this._insideObstacle(wx, wy)) continue;
          const u = f.U[j]?.[i];
          const v = f.V[j]?.[i];
          if (u === null || v === null || u === undefined || v === undefined) continue;
          const spd = Math.hypot(u, v);
          if (spd < 1e-4) continue;
          // Screen-space tangent vector (compensating anisotropic scaleX vs scaleY!)
          const sx = u * scaleX;
          const sy = -v * scaleY;
          const sMag = Math.hypot(sx, sy);
          if (sMag < 1e-6) continue;
          const len = baseLen * Math.min(1.35, 0.45 + Math.log1p(spd) * 0.55);
          const [px, py] = this._worldToPixel(wx, wy, tr);
          this._drawArrow(
            ctx,
            px,
            py,
            px + (sx / sMag) * len,
            py + (sy / sMag) * len,
            Math.max(3.5, Math.min(5.5, len * 0.35)),
            pal.vectorInk,
            1.1
          );
        }
      }
    }

    // 4. 60fps Advected Tracer Particles (skip obstacles cleanly)
    const domainDiag = Math.hypot(xmax - xmin, ymax - ymin);
    const dtStep = 0.008 * domainDiag;
    if (this.scene.field?.xs) {
      for (const p of this.particles) {
        const s = this._sampleField(p.x, p.y);
        if (!s || s.speed < 1e-4 || p.life >= p.maxLife || this._insideObstacle(p.x, p.y)) {
          p.x = xmin + Math.random() * (xmax - xmin);
          p.y = ymin + Math.random() * (ymax - ymin);
          p.life = 0;
          continue;
        }
        const prevX = p.x;
        const prevY = p.y;
        const cap = Math.min(s.speed, 6.0);
        p.x += (s.u / s.speed) * cap * dtStep;
        p.y += (s.v / s.speed) * cap * dtStep;
        p.life += 1;

        if (p.x < xmin || p.x > xmax || p.y < ymin || p.y > ymax || this._insideObstacle(p.x, p.y)) {
          p.life = p.maxLife;
          continue;
        }
        const [ax, ay] = this._worldToPixel(prevX, prevY, tr);
        const [bx, by] = this._worldToPixel(p.x, p.y, tr);
        const alpha = Math.sin((p.life / p.maxLife) * Math.PI) * 0.65;
        ctx.strokeStyle = `rgba(${pal.tracerRgb}, ${alpha.toFixed(2)})`;
        ctx.lineWidth = 1.35;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      }
    }

    // 5. Shaded Horizontal Plug Bands (e.g. Herschel-Bulkley yield core)
    if (this.scene.hBands) {
      for (const hb of this.scene.hBands) {
        const [, py1] = this._worldToPixel(xmin, hb.yMax, tr);
        const [, py0] = this._worldToPixel(xmin, hb.yMin, tr);
        ctx.save();
        ctx.fillStyle = hb.fill || "rgba(217, 119, 6, 0.14)";
        ctx.fillRect(ox, py1, boxW, Math.max(2, py0 - py1));
        ctx.restore();
      }
    }

    // 6. Scaled fluid body polygons & schematic walls
    if (this.scene.fluidPoly?.length >= 3) {
      ctx.save();
      ctx.fillStyle = this.scene.fluidFill || pal.fluidFill;
      ctx.strokeStyle = this._resolveColor(this.scene.fluidStroke, pal.fluidStroke);
      ctx.lineWidth = 2.1;
      ctx.beginPath();
      this.scene.fluidPoly.forEach(([wx, wy], i) => {
        const [px, py] = this._worldToPixel(wx, wy, tr);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    if (this.scene.wallPolys?.length) {
      for (const wp of this.scene.wallPolys) {
        if (!wp || wp.length < 2) continue;
        ctx.save();
        ctx.fillStyle = pal.solidFill;
        ctx.strokeStyle = pal.solidStroke;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        wp.forEach(([wx, wy], i) => {
          const [px, py] = this._worldToPixel(wx, wy, tr);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        if (wp.length >= 3) {
          ctx.closePath();
          ctx.fill();
        }
        ctx.stroke();
        ctx.restore();
      }
    }

    // Overlays: Vortex Core, Stokes Loop, Cylinder, LBM Obstacles
    if (this.scene.vortexCoreRadius) {
      const r = this.scene.vortexCoreRadius;
      const [cx, cy] = this._worldToPixel(0, 0, tr);
      const rx = r * scaleX;
      const ry = r * scaleY;
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = pal.amber;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (this.scene.stokesLoop) {
      const [lx, ly] = this.scene.stokesLoop.center;
      const lr = this.scene.stokesLoop.radius;
      const [cx, cy] = this._worldToPixel(lx, ly, tr);
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = pal.ok;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(cx, cy, lr * scaleX, lr * scaleY, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (this.scene.cylinderRadius) {
      const a = this.scene.cylinderRadius;
      const [cx, cy] = this._worldToPixel(0, 0, tr);
      ctx.save();
      ctx.fillStyle = pal.solidFill;
      ctx.strokeStyle = pal.solidStroke;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.ellipse(cx, cy, a * scaleX, a * scaleY, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    if (this.scene.solidRects?.length) {
      ctx.fillStyle = pal.solidFill;
      ctx.strokeStyle = pal.solidStroke;
      ctx.lineWidth = 0.8;
      for (const [rx0, ry0, rw, rh] of this.scene.solidRects) {
        const [px0, py1] = this._worldToPixel(rx0, ry0, tr);
        const [px1, py0] = this._worldToPixel(rx0 + rw, ry0 + rh, tr);
        ctx.fillRect(px0, py0, Math.max(2, px1 - px0), Math.max(2, py1 - py0));
      }
    }

    const drawCurve = (pts, color, width, dash = []) => {
      if (!pts || pts.length < 2) return;
      ctx.save();
      ctx.setLineDash(dash);
      ctx.strokeStyle = this._resolveColor(color, pal.primary);
      ctx.lineWidth = width;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      pts.forEach(([wx, wy], idx) => {
        const [px, py] = this._worldToPixel(wx, wy, tr);
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
      ctx.restore();
    };

    // Dashed Schematic Guides (e.g. still water line H0, tilted isobars, dry base)
    if (this.scene.dashedGuides?.length) {
      for (const g of this.scene.dashedGuides) {
        drawCurve(g.pts, g.color || pal.tickInk, g.width || 1.5, g.dash || [5, 4]);
      }
    }

    if (this.scene.naiveLine?.length >= 2) {
      drawCurve(this.scene.naiveLine, pal.coral, 2.2, [6, 4]);
    }

    if (this.scene.orificeJet?.length >= 2) {
      drawCurve(this.scene.orificeJet, pal.fluidStroke, 3.0, []);
    }

    // Fluid Element square (initial + deformed)
    const drawPoly = (pts, color, dashed, fillAlpha = 0) => {
      if (!pts || pts.length < 3) return;
      ctx.save();
      if (dashed) ctx.setLineDash([4, 3]);
      const col = this._resolveColor(color, pal.amber);
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      pts.forEach(([wx, wy], i) => {
        const [px, py] = this._worldToPixel(wx, wy, tr);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
      if (fillAlpha > 0) {
        ctx.fillStyle = `rgba(217, 119, 6, ${fillAlpha})`;
        ctx.fill();
      }
      ctx.stroke();
      ctx.restore();
    };

    if (this.scene.initialElement) drawPoly(this.scene.initialElement, pal.tickInk, true, 0);
    if (this.scene.deformedElement) drawPoly(this.scene.deformedElement, pal.amber, false, 0.22);

    // 7. Analytical Trajectories
    drawCurve(this.scene.streamline, this.scene.streamlineColor || pal.primary, 2.4, []);
    drawCurve(this.scene.pathline, this.scene.pathlineColor || pal.amber, 2.6, []);
    drawCurve(this.scene.streakline, this.scene.streaklineColor || pal.coral, 2.4, [7, 4]);
    drawCurve(this.scene.spiralCurve, this.scene.spiralColor || pal.amber, 2.4, []);

    // Eddies / Roller Circular Indicators
    if (this.scene.eddies?.length) {
      for (const ed of this.scene.eddies) {
        const [cx, cy] = this._worldToPixel(ed.cx, ed.cy, tr);
        const rx = ed.rx * scaleX;
        const ry = ed.ry * scaleY;
        const col = this._resolveColor(ed.color, pal.coral);
        ctx.save();
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.6;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0.2, Math.PI * 1.75);
        ctx.stroke();
        ctx.setLineDash([]);
        const tipAng = ed.ccw ? 0.2 : Math.PI * 1.75;
        const tx = cx + rx * Math.cos(tipAng);
        const ty = cy + ry * Math.sin(tipAng);
        const dx = (ed.ccw ? 1 : -1) * Math.sin(tipAng);
        const dy = (ed.ccw ? -1 : 1) * Math.cos(tipAng);
        this._drawArrow(ctx, tx - dx * 5, ty - dy * 5, tx, ty, 5.5, col, 1.8);
        ctx.restore();
      }
    }

    // Thick Schematic Force/Velocity Vector Overlays
    if (this.scene.vectorsOverlay?.length) {
      for (const vo of this.scene.vectorsOverlay) {
        const [x0, y0] = this._worldToPixel(vo.x0, vo.y0, tr);
        const [x1, y1] = this._worldToPixel(vo.x0 + vo.dx, vo.y0 + vo.dy, tr);
        const col = this._resolveColor(vo.color, pal.coral);
        this._drawArrow(ctx, x0, y0, x1, y1, 7, col, 2.4);
        if (vo.label) {
          this._drawPill(ctx, (x0 + x1) * 0.5, y1 - 14, vo.label, col);
        }
      }
    }

    // Horizontal reference guides (interface, plug limits, rim)
    if (this.scene.hLines) {
      for (const hl of this.scene.hLines) {
        const [, py] = this._worldToPixel(xmin, hl.y, tr);
        const col = this._resolveColor(hl.color, pal.amber);
        ctx.save();
        if (hl.dashed) ctx.setLineDash([5, 4]);
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(ox, py); ctx.lineTo(ox + boxW, py); ctx.stroke();
        if (hl.label) {
          ctx.fillStyle = col;
          ctx.font = '600 10.5px "IBM Plex Mono", monospace';
          ctx.textAlign = "left";
          ctx.textBaseline = "alphabetic";
          ctx.fillText(hl.label, ox + 10, py - 6);
        }
        ctx.restore();
      }
    }

    // Potential stagnation points (sitting flush on cylinder!)
    if (this.scene.stagnationPoints) {
      for (const [sx, sy] of this.scene.stagnationPoints) {
        const [px, py] = this._worldToPixel(sx, sy, tr);
        ctx.fillStyle = pal.coral;
        ctx.strokeStyle = pal.bg;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    // Seed / Injection point marker
    if (this.scene.seedPoint) {
      const [sx, sy] = this._worldToPixel(this.scene.seedPoint[0], this.scene.seedPoint[1], tr);
      ctx.strokeStyle = pal.amber;
      ctx.fillStyle = pal.bg;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(sx, sy, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Callout annotations pinned to world coords
    if (this.scene.annotations?.length) {
      for (const ann of this.scene.annotations) {
        const [px, py] = this._worldToPixel(ann.x, ann.y, tr);
        this._drawPill(ctx, px, py, ann.text, this._resolveColor(ann.color, pal.pillBorder), ann.align || "center");
      }
    }

    // Hover crosshair inside canvas
    if (this.mouseWorld) {
      const [mx, my] = this._worldToPixel(this.mouseWorld[0], this.mouseWorld[1], tr);
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = pal.amber;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(mx, oy); ctx.lineTo(mx, oy + boxH);
      ctx.moveTo(ox, my); ctx.lineTo(ox + boxW, my);
      ctx.stroke();
      ctx.restore();
    }

    // Empty / Unspoiled Quiz / Honest Scope Overlay Box (auto-wraps subtitle cleanly)
    if (this.scene.emptyMessage) {
      ctx.save();
      const col = this.scene.emptyTone === "primary" ? pal.primary : pal.coral;
      const bw = Math.min(boxW - 24, 460);
      const subText = this.scene.emptySub || "SymPy Governing Auditor & Textbook Guardrails Active";
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
      const bx = ox + (boxW - bw) * 0.5;
      const by = oy + (boxH - bh) * 0.5;
      ctx.fillStyle = pal.pillBg;
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.5;
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeRect(bx, by, bw, bh);
      ctx.fillStyle = col;
      ctx.font = '600 12px "Space Grotesk", "IBM Plex Sans", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(this.scene.emptyMessage, ox + boxW * 0.5, by + 23);
      ctx.fillStyle = pal.tickInk;
      ctx.font = '11px "IBM Plex Sans", sans-serif';
      subLines.forEach((line, li) => {
        ctx.fillText(line, ox + boxW * 0.5, by + 42 + li * 16);
      });
      ctx.restore();
    }

    ctx.restore();

    // 8. Outer Axis Frame, Ticks, and Explicit X/Y Axis Titles
    ctx.strokeStyle = pal.frame;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(ox, oy, boxW, boxH);

    ctx.fillStyle = pal.tickInk;
    ctx.font = '10.5px "IBM Plex Mono", monospace';
    ctx.textAlign = "center";
    for (let k = 0; k <= nTicks; k++) {
      const wx = xmin + (k / nTicks) * (xmax - xmin);
      const [px] = this._worldToPixel(wx, ymin, tr);
      ctx.fillText(this._fmt(wx), px, oy + boxH + 15);
    }
    ctx.textAlign = "right";
    for (let k = 0; k <= nTicks; k++) {
      const wy = ymin + (k / nTicks) * (ymax - ymin);
      const [, py] = this._worldToPixel(xmin, wy, tr);
      ctx.fillText(this._fmt(wy), ox - 7, py + 3.5);
    }

    // Axis Titles
    ctx.fillStyle = pal.labelInk;
    ctx.font = '600 11.5px "IBM Plex Sans", sans-serif';
    ctx.textAlign = "center";
    ctx.fillText(this.scene.xLabel || "x (m)", ox + boxW * 0.5, ch - 10);

    ctx.save();
    ctx.translate(15, oy + boxH * 0.5);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText(this.scene.yLabel || "y (m)", 0, 0);
    ctx.restore();
  }

  _fmt(v) {
    const av = Math.abs(v);
    if (av < 1e-6) return "0";
    if (av >= 100) return v.toFixed(0);
    if (av >= 10) return v.toFixed(1);
    return v.toFixed(2);
  }
}
