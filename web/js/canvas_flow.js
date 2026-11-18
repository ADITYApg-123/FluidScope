/**
 * HTML5 Canvas 2D Fluid Flow & Physics Schematic Visualizer.
 * Wave 1 — Agent A: Okabe-Ito trajectories, 256-stop diverging/sequential heatmaps,
 * solid cell outlines, Wilkinson/Heckbert niceTicks + fmtNum, Play/Pause + reduced motion,
 * interactive draggable handles, LBM obstacle drawing, and bidirectional hover sync.
 */
import {
  OKABE_ITO,
  niceTicks,
  fmtNum,
  sampleDivergingVorticity,
  sampleSequentialSpeed,
  sampleDivergingCp,
} from "./core/color_scales.js";
import { bus } from "./core/store.js";

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function round4(v) {
  return Number(v.toFixed(4));
}

function tickDecimals(ticks) {
  if (!ticks || ticks.length < 2) return 1;
  const step = Math.abs(ticks[1] - ticks[0]);
  if (!Number.isFinite(step) || step <= 0) return 1;
  if (step >= 1) return Math.abs(step - Math.round(step)) < 1e-6 ? 0 : 1;
  return Math.min(4, Math.max(1, Math.ceil(-Math.log10(step) - 1e-9)));
}

export class FlowCanvasEngine {
  constructor(canvasEl, hudEl) {
    this.canvas = canvasEl;
    this.hud = hudEl;
    this.ctx = canvasEl?.getContext ? canvasEl.getContext("2d") : null;
    this.scene = null;
    this.particles = [];
    this.mouseWorld = null;
    this.externalHover = null;
    this.rafId = null;
    this.pad = { left: 66, right: 24, top: 20, bottom: 48 };

    // Playback & prefers-reduced-motion state
    this._reducedMotion = false;
    this._paused = false;
    this._mql = null;
    this._onMqlChange = null;
    this._playPauseBtn = null;

    // Interactive draggable handles
    this.interactiveHandles = [];
    this._onDragCommit = null;
    this._hoveredHandleId = null;
    this._dragState = null;

    // LBM obstacle draw mode
    this._drawTool = null; // null | "circle" | "rect" | "splitter"
    this._onObstacleAdded = null;
    this._drawDraft = null;

    // Event deduplication flags (supports both PointerEvent and synthetic MouseEvent)
    this._sawPointerMove = false;
    this._sawPointerDown = false;
    this._sawPointerUp = false;

    this._initMotionPreferences();
    this._initEvents();

    if (typeof ResizeObserver !== "undefined" && this.canvas) {
      this._ro = new ResizeObserver(() => this.render());
      this._ro.observe(this.canvas);
    }

    if (this._paused) {
      this.render();
    } else {
      this._startLoop();
    }
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
        vectorInk: "rgba(148, 163, 184, 0.84)",
        tracerRgb: "147, 197, 253",
        solidFill: "#1E293B",
        solidStroke: "#94A3B8",
        fluidFill: "rgba(56, 189, 248, 0.16)",
        fluidStroke: "#38BDF8",
        primary: "#58A6FF",
        streamline: "#38BDF8",
        pathline: "#F59E0B",
        streakline: "#F87171",
        stokes: "#34D399",
        secondary: "#A78BFA",
        teal: "#2DD4BF",
        amber: "#F59E0B",
        coral: "#F87171",
        ok: "#3FB950",
        pillBg: "rgba(15, 23, 42, 0.94)",
        pillBorder: "#475569",
        pillInk: "#F1F5F9",
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
      vectorInk: "rgba(100, 116, 139, 0.84)",
      tracerRgb: "0, 114, 178",
      solidFill: "#E2E8F0",
      solidStroke: "#334155",
      fluidFill: "rgba(0, 114, 178, 0.12)",
      fluidStroke: OKABE_ITO.blue,
      primary: OKABE_ITO.blue,
      streamline: OKABE_ITO.blue,
      pathline: OKABE_ITO.vermilion,
      streakline: OKABE_ITO.red,
      stokes: OKABE_ITO.green,
      secondary: OKABE_ITO.purple,
      teal: "#0F766E",
      amber: OKABE_ITO.vermilion,
      coral: OKABE_ITO.red,
      ok: OKABE_ITO.green,
      pillBg: "rgba(255, 255, 255, 0.96)",
      pillBorder: "#CBD5E1",
      pillInk: "#0F172A",
      crosshair: "#D97706",
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
      if (c === "#009e73" || c === "#15803d") return pal.stokes;
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

  _initMotionPreferences() {
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      this._mql = window.matchMedia("(prefers-reduced-motion: reduce)");
      this._reducedMotion = Boolean(this._mql?.matches);
      if (this._reducedMotion) {
        this._paused = true;
      }
      this._onMqlChange = (e) => {
        this._reducedMotion = Boolean(e.matches);
        this.setPaused(Boolean(e.matches));
      };
      if (typeof this._mql?.addEventListener === "function") {
        this._mql.addEventListener("change", this._onMqlChange);
      } else if (typeof this._mql?.addListener === "function") {
        this._mql.addListener(this._onMqlChange);
      }
    }
    this._bindPlayPauseButton();
  }

  _bindPlayPauseButton() {
    if (typeof document === "undefined") return null;
    const btn = document.getElementById("flowPlayPauseBtn");
    if (!btn) return null;
    if (this._playPauseBtn !== btn) {
      this._playPauseBtn = btn;
      if (!btn.dataset.flowEngineBound) {
        btn.dataset.flowEngineBound = "1";
        btn.addEventListener("click", () => this.togglePlayback());
      }
    }
    this._syncPlayPauseBtn();
    return btn;
  }

  _syncPlayPauseBtn() {
    const btn =
      this._playPauseBtn ||
      (typeof document !== "undefined" ? document.getElementById("flowPlayPauseBtn") : null);
    if (!btn) return;
    btn.setAttribute("aria-pressed", String(this._paused));
    btn.textContent = this._paused ? "Play" : "Pause";
    btn.title = this._paused ? "Resume particle motion" : "Pause particle motion";
  }

  isPaused() {
    return Boolean(this._paused);
  }

  setPaused(paused) {
    const next = Boolean(paused);
    this._paused = next;
    this._syncPlayPauseBtn();
    if (next) {
      if (this.rafId !== null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(this.rafId);
      }
      this.rafId = null;
      this.render();
    } else {
      this._startLoop();
    }
    return this._paused;
  }

  togglePlayback() {
    return this.setPaused(!this._paused);
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

  _updateCursor() {
    if (!this.canvas?.style) return;
    if (this._dragState) {
      this.canvas.style.cursor = "grabbing";
    } else if (this._hoveredHandleId && !this._drawTool) {
      this.canvas.style.cursor = "grab";
    } else {
      this.canvas.style.cursor = "crosshair";
    }
  }

  _initEvents() {
    if (!this.canvas || typeof this.canvas.addEventListener !== "function") return;

    const handleDown = (e, fromPointer) => {
      if (!fromPointer && this._sawPointerDown) {
        this._sawPointerDown = false;
        return;
      }
      if (fromPointer) this._sawPointerDown = true;

      const [px, py] = this._getCanvasCoords(e);

      // Priority 1: Active LBM Obstacle Draw Tool
      if (this._drawTool && this.scene?.bounds) {
        const wClamped = this._pixelToWorldClamped(px, py);
        if (wClamped) {
          this._drawDraft = {
            tool: this._drawTool,
            startX: wClamped[0],
            startY: wClamped[1],
            curX: wClamped[0],
            curY: wClamped[1],
          };
          if (fromPointer && typeof this.canvas.setPointerCapture === "function" && e.pointerId !== undefined) {
            try { this.canvas.setPointerCapture(e.pointerId); } catch (_) {}
          }
          this.render();
          return;
        }
      }

      // Priority 2: Interactive Drag Handles
      if (this.interactiveHandles.length && this.scene?.bounds) {
        const hit = this._hitTestHandle(px, py);
        if (hit) {
          this._dragState = { handleId: hit.id };
          this._hoveredHandleId = hit.id;
          this._updateCursor();
          if (fromPointer && typeof this.canvas.setPointerCapture === "function" && e.pointerId !== undefined) {
            try { this.canvas.setPointerCapture(e.pointerId); } catch (_) {}
          }
          const wClamped = this._pixelToWorldClamped(px, py);
          if (wClamped) {
            this._applyHandleDrag(hit, wClamped[0], wClamped[1], "drag");
          }
          return;
        }
      }
    };

    const handleMove = (e, fromPointer) => {
      if (!fromPointer && this._sawPointerMove) {
        this._sawPointerMove = false;
        return;
      }
      if (fromPointer) this._sawPointerMove = true;

      const [px, py] = this._getCanvasCoords(e);

      // Active LBM draw preview
      if (this._drawDraft && this.scene?.bounds) {
        const wClamped = this._pixelToWorldClamped(px, py);
        if (wClamped) {
          this._drawDraft.curX = wClamped[0];
          this._drawDraft.curY = wClamped[1];
          this.mouseWorld = wClamped;
          this._updateProbeHud();
          this.render();
        }
        return;
      }

      // Active interactive handle drag
      if (this._dragState && this.scene?.bounds) {
        const h = this.interactiveHandles.find((item) => item.id === this._dragState.handleId);
        const wClamped = this._pixelToWorldClamped(px, py);
        if (h && wClamped) {
          this.mouseWorld = wClamped;
          this._applyHandleDrag(h, wClamped[0], wClamped[1], "drag");
          this._updateProbeHud();
        }
        return;
      }

      // Hover probing + handle cursor feedback
      const worldPt = this._pixelToWorld(px, py);
      if (worldPt) {
        this.mouseWorld = worldPt;
        bus.emit("flow:hover", { worldX: worldPt[0], worldY: worldPt[1] });
      } else if (this.mouseWorld !== null) {
        this.mouseWorld = null;
        bus.emit("flow:hover", null);
      }

      if (!this._drawTool && this.interactiveHandles.length && this.scene?.bounds) {
        const hit = this._hitTestHandle(px, py);
        const nextHoverId = hit ? hit.id : null;
        if (nextHoverId !== this._hoveredHandleId) {
          this._hoveredHandleId = nextHoverId;
          this._updateCursor();
          if (this._paused) this.render();
        }
      } else if (this._hoveredHandleId !== null) {
        this._hoveredHandleId = null;
        this._updateCursor();
      }

      this._updateProbeHud();
      if (this._paused) this.render();
    };

    const handleUp = (e, fromPointer) => {
      if (!fromPointer && this._sawPointerUp) {
        this._sawPointerUp = false;
        return;
      }
      if (fromPointer) this._sawPointerUp = true;

      const [px, py] = this._getCanvasCoords(e);

      if (this._drawDraft && this.scene?.bounds) {
        const wClamped = this._pixelToWorldClamped(px, py);
        if (wClamped) {
          this._drawDraft.curX = wClamped[0];
          this._drawDraft.curY = wClamped[1];
        }
        const primitive = this._finalizeDrawDraft(this._drawDraft);
        this._drawDraft = null;
        this.render();
        if (primitive && typeof this._onObstacleAdded === "function") {
          this._onObstacleAdded(primitive);
        }
      }

      if (this._dragState) {
        const h = this.interactiveHandles.find((item) => item.id === this._dragState.handleId);
        const wClamped = this._pixelToWorldClamped(px, py);
        this._dragState = null;
        this._updateCursor();
        if (h && wClamped) {
          this._applyHandleDrag(h, wClamped[0], wClamped[1], "commit");
        } else if (h) {
          this._emitHandleDrag(h, "commit");
        }
      }

      if (fromPointer && typeof this.canvas.releasePointerCapture === "function" && e.pointerId !== undefined) {
        try { this.canvas.releasePointerCapture(e.pointerId); } catch (_) {}
      }
    };

    this.canvas.addEventListener("pointerdown", (e) => handleDown(e, true));
    this.canvas.addEventListener("mousedown", (e) => handleDown(e, false));
    this.canvas.addEventListener("pointermove", (e) => handleMove(e, true));
    this.canvas.addEventListener("mousemove", (e) => handleMove(e, false));
    this.canvas.addEventListener("pointerup", (e) => handleUp(e, true));
    this.canvas.addEventListener("mouseup", (e) => handleUp(e, false));
    this.canvas.addEventListener("pointercancel", () => {
      this._drawDraft = null;
      this._dragState = null;
      this._updateCursor();
      this.render();
    });
    this.canvas.addEventListener("mouseleave", () => {
      if (this.mouseWorld !== null) {
        this.mouseWorld = null;
        bus.emit("flow:hover", null);
      }
      this._hoveredHandleId = null;
      this._updateCursor();
      this._updateProbeHud();
      if (this._paused) this.render();
    });
  }

  setScene(scene) {
    this.scene = scene;
    this._bindPlayPauseButton();
    this._seedParticles(180);
    this._updateProbeHud();
    this.render();
  }

  setInteractiveHandles(handles, onDragCommit = null) {
    this.interactiveHandles = Array.isArray(handles)
      ? handles.map((h) => ({ ...h }))
      : [];
    this._onDragCommit = typeof onDragCommit === "function" ? onDragCommit : null;
    if (this._dragState && !this.interactiveHandles.some((h) => h.id === this._dragState.handleId)) {
      this._dragState = null;
    }
    this._updateCursor();
    this.render();
  }

  setDrawMode(toolOrNull, onObstacleAdded = null) {
    const allowed = new Set(["circle", "rect", "splitter"]);
    this._drawTool = toolOrNull && allowed.has(toolOrNull) ? toolOrNull : null;
    this._onObstacleAdded = typeof onObstacleAdded === "function" ? onObstacleAdded : null;
    this._drawDraft = null;
    this._updateCursor();
    this.render();
  }

  /**
   * Receive synced hover coordinates from CurvePlotEngine.
   * NEVER emits "flow:hover" onto bus to prevent infinite event ping-pong.
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
      curveFrac: pt.curveFrac,
    };
    this.render();
  }

  _getTransform() {
    const cw = this.canvas?.clientWidth || this.canvas?.width || 600;
    const ch = this.canvas?.clientHeight || this.canvas?.height || 400;
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

  _pixelToWorldClamped(px, py) {
    if (!this.scene?.bounds) return null;
    const t = this._getTransform();
    const wx = clamp(t.xmin + (px - t.ox) / t.scaleX, t.xmin, t.xmax);
    const wy = clamp(t.ymax - (py - t.oy) / t.scaleY, t.ymin, t.ymax);
    return [wx, wy];
  }

  _getHandleCenter(h) {
    if (Array.isArray(h.fixedCenter) && h.fixedCenter.length >= 2) {
      return [Number(h.fixedCenter[0]) || 0, Number(h.fixedCenter[1]) || 0];
    }
    if (h.kind === "ring") {
      return [Number(h.x ?? 0), Number(h.y ?? 0)];
    }
    if (h.id === "stokes_rim" && this.scene?.stokesLoop?.center) {
      return [this.scene.stokesLoop.center[0], this.scene.stokesLoop.center[1]];
    }
    return null;
  }

  _hitTestHandle(px, py) {
    if (!this.interactiveHandles.length || !this.scene?.bounds) return null;
    const tr = this._getTransform();
    let bestPoint = null;
    let bestPointDist = 15;
    let bestRing = null;
    let bestRingDist = 13;

    for (const h of this.interactiveHandles) {
      if (h.kind === "ring") {
        const [cxW, cyW] = this._getHandleCenter(h) || [0, 0];
        const [cx, cy] = this._worldToPixel(cxW, cyW, tr);
        const r = Math.max(0.01, Number(h.r ?? 0.2));
        const rx = Math.max(4, r * tr.scaleX);
        const ry = Math.max(4, r * tr.scaleY);
        const normDist = Math.hypot((px - cx) / rx, (py - cy) / ry);
        const rimDist = Math.abs(normDist - 1) * ((rx + ry) * 0.5);
        const gripDist = Math.hypot(px - (cx + rx), py - cy);
        const d = Math.min(rimDist, gripDist);
        if (d <= bestRingDist) {
          bestRingDist = d;
          bestRing = h;
        }
      } else {
        const [hx, hy] = this._worldToPixel(Number(h.x ?? 0), Number(h.y ?? 0), tr);
        const d = Math.hypot(px - hx, py - hy);
        if (d <= bestPointDist) {
          bestPointDist = d;
          bestPoint = h;
        }
      }
    }
    return bestPoint || bestRing;
  }

  _applyHandleDrag(h, wx, wy, phase) {
    const tr = this._getTransform();
    if (h.kind === "ring") {
      const [cx, cy] = this._getHandleCenter(h) || [0, 0];
      const minR = Number.isFinite(h.minR) ? h.minR : 0.02;
      const maxR = Number.isFinite(h.maxR) ? h.maxR : Math.max(tr.worldW, tr.worldH);
      const r = clamp(Math.hypot(wx - cx, wy - cy), minR, maxR);
      h.x = cx;
      h.y = cy;
      h.r = r;
      if (h.id === "stokes_rim" && this.scene?.stokesLoop) {
        this.scene.stokesLoop.radius = r;
      }
    } else {
      h.x = wx;
      h.y = wy;
      const center = this._getHandleCenter(h);
      if (center) {
        const minR = Number.isFinite(h.minR) ? h.minR : 0.05;
        h.r = Math.max(minR, Math.hypot(wx - center[0], wy - center[1]));
        if (h.id === "stokes_rim" && this.scene?.stokesLoop) {
          this.scene.stokesLoop.radius = h.r;
        }
      }
      if (h.id === "seed" && this.scene) {
        this.scene.seedPoint = [wx, wy];
      }
      if (h.id === "stokes_center") {
        if (this.scene?.stokesLoop) {
          this.scene.stokesLoop.center = [wx, wy];
        }
        const rimHandle = this.interactiveHandles.find((item) => item.id === "stokes_rim");
        if (rimHandle) {
          rimHandle.fixedCenter = [wx, wy];
          rimHandle.x = wx + Number(rimHandle.r ?? 0.2);
          rimHandle.y = wy;
        }
      }
    }
    this._emitHandleDrag(h, phase);
    this.render();
  }

  _emitHandleDrag(h, phase) {
    const payload = {
      handleId: h.id,
      x: h.x,
      y: h.y,
      r: h.r,
      phase,
    };
    if (typeof this._onDragCommit === "function") {
      this._onDragCommit(payload);
    }
    bus.emit("flow:drag", payload);
  }

  _finalizeDrawDraft(draft) {
    const bounds = this.scene?.bounds || [0, 1, 0, 1];
    const b1 = Math.abs(bounds[1]) > 1e-9 ? bounds[1] : 1;
    const b3 = Math.abs(bounds[3]) > 1e-9 ? bounds[3] : 1;

    if (draft.tool === "circle") {
      const worldR = Math.hypot(draft.curX - draft.startX, draft.curY - draft.startY);
      const x = clamp(draft.startX / b1, 0.02, 0.95);
      const y = clamp(draft.startY / b3, 0.05, 0.95);
      const r = clamp(worldR / b3, 0.03, 0.35);
      return {
        type: "circle",
        x: round4(x),
        y: round4(y),
        r: round4(r),
      };
    }

    if (draft.tool === "rect") {
      const nxA = draft.startX / b1;
      const nxB = draft.curX / b1;
      const nyA = draft.startY / b3;
      const nyB = draft.curY / b3;
      const x0 = clamp(Math.min(nxA, nxB), 0.02, 0.95);
      const x1 = clamp(Math.max(nxA, nxB), Math.max(0.05, x0 + 0.02), 0.98);
      const y0 = clamp(Math.min(nyA, nyB), 0.02, 0.95);
      const y1 = clamp(Math.max(nyA, nyB), Math.max(0.05, y0 + 0.02), 0.98);
      return {
        type: "rect",
        x0: round4(x0),
        y0: round4(y0),
        x1: round4(x1),
        y1: round4(y1),
      };
    }

    if (draft.tool === "splitter") {
      const nxA = draft.startX / b1;
      const nxB = draft.curX / b1;
      const x0 = clamp(Math.min(nxA, nxB), 0.02, 0.95);
      const x1 = clamp(Math.max(nxA, nxB), Math.max(0.05, x0 + 0.03), 0.98);
      const cyNorm = clamp(draft.startY / b3, 0.06, 0.94);
      const halfThick = 0.02;
      const y0 = clamp(cyNorm - halfThick, 0.02, 0.95);
      const y1 = clamp(cyNorm + halfThick, Math.max(0.05, y0 + 0.02), 0.98);
      return {
        type: "splitter",
        x0: round4(x0),
        y0: round4(y0),
        x1: round4(x1),
        y1: round4(y1),
      };
    }

    return null;
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
    const f = this.scene?.field;
    if (f?.solid?.length && f.xs?.length > 1 && f.ys?.length > 1) {
      const nx = f.xs.length;
      const ny = f.ys.length;
      const xmin = f.xs[0], xmax = f.xs[nx - 1];
      const ymin = f.ys[0], ymax = f.ys[ny - 1];
      if (wx >= xmin && wx <= xmax && wy >= ymin && wy <= ymax) {
        const i = Math.round(((wx - xmin) / Math.max(1e-9, xmax - xmin)) * (nx - 1));
        const j = Math.round(((wy - ymin) / Math.max(1e-9, ymax - ymin)) * (ny - 1));
        if (f.solid[j]?.[i]) return true;
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
      this.hud.textContent = `X: ${fmtNum(wx, 2)} | Y: ${fmtNum(wy, 2)} | Schematic region (no velocity grid at cursor)`;
      return;
    }
    const vortTxt = sample.vort !== null ? ` | Ωz: ${fmtNum(sample.vort, 2)} s⁻¹` : "";
    const cpTxt = sample.cp !== null ? ` | Cp: ${fmtNum(sample.cp, 2)}` : "";
    this.hud.textContent =
      `X: ${fmtNum(wx, 2)} | Y: ${fmtNum(wy, 2)} | u: ${fmtNum(sample.u, 2)} | v: ${fmtNum(sample.v, 2)} | |V|: ${fmtNum(sample.speed, 2)}${vortTxt}${cpTxt}`;
  }

  _startLoop() {
    if (this._paused) return;
    if (this.rafId !== null) return;
    if (typeof requestAnimationFrame !== "function") {
      this.render();
      return;
    }
    const tick = () => {
      if (this._paused) {
        this.rafId = null;
        return;
      }
      this.render();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  _drawArrow(ctx, x0, y0, x1, y1, headLen = 5, color = null, width = 1.25) {
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
    ctx.font = '600 12px "IBM Plex Sans", sans-serif';
    const w = ctx.measureText(text).width + 14;
    const h = 22;
    let bx = px - w * 0.5;
    if (align === "left") bx = px;
    else if (align === "right") bx = px - w;
    const by = py - h * 0.5;
    ctx.fillStyle = pal.pillBg;
    ctx.strokeStyle = color ? this._resolveColor(color, pal.pillBorder) : pal.pillBorder;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") ctx.roundRect(bx, by, w, h, 4);
    else ctx.rect(bx, by, w, h);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color ? this._resolveTextColor(color, pal.pillInk) : pal.pillInk;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, bx + w * 0.5, by + h * 0.5 + 0.5);
    ctx.restore();
  }

  _renderScalarHeatmap(ctx, tr, isDark) {
    const f = this.scene?.field;
    if (!f || !f.xs?.length || !f.ys?.length) return;
    const mode = this.scene.scalarMode || (f.cp ? "cp" : f.vorticity ? "vorticity" : null);
    if (!mode) return;

    const ny = f.ys.length;
    const nx = f.xs.length;
    const isRichField = Boolean(this.scene.scalarMode || f.solid);

    if (mode === "speed") {
      if (!f.speed && (!f.U || !f.V)) return;
      let maxSpd = 0;
      const spdGrid = f.speed || Array.from({ length: ny }, (_, j) =>
        Array.from({ length: nx }, (__, i) => {
          if (f.solid?.[j]?.[i]) return null;
          const u = f.U?.[j]?.[i];
          const v = f.V?.[j]?.[i];
          if (u === null || v === null || !Number.isFinite(u) || !Number.isFinite(v)) return null;
          return Math.hypot(u, v);
        })
      );
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const val = spdGrid[j]?.[i];
          if (val !== null && Number.isFinite(val)) {
            maxSpd = Math.max(maxSpd, val);
          }
        }
      }
      const scaleMax = Math.max(0.25, maxSpd);
      ctx.save();
      for (let j = 0; j < ny - 1; j++) {
        for (let i = 0; i < nx - 1; i++) {
          if (f.solid?.[j]?.[i]) continue;
          const val = spdGrid[j]?.[i];
          if (val === null || !Number.isFinite(val)) continue;
          const t = clamp(val / scaleMax, 0, 1);
          ctx.globalAlpha = isDark ? 0.24 + 0.58 * t : 0.78;
          ctx.fillStyle = sampleSequentialSpeed(val, scaleMax);
          const [px0, py1] = this._worldToPixel(f.xs[i], f.ys[j], tr);
          const [px1, py0] = this._worldToPixel(f.xs[i + 1], f.ys[j + 1], tr);
          ctx.fillRect(px0, py0, Math.abs(px1 - px0) + 0.8, Math.abs(py1 - py0) + 0.8);
        }
      }
      ctx.restore();
      return;
    }

    const scalar = mode === "cp" ? f.cp : f.vorticity;
    if (!scalar?.length) return;
    let maxAbs = 0;
    for (let j = 0; j < scalar.length; j++) {
      for (let i = 0; i < (scalar[j]?.length || 0); i++) {
        if (f.solid?.[j]?.[i]) continue;
        const val = scalar[j][i];
        if (val !== null && Number.isFinite(val)) {
          maxAbs = Math.max(maxAbs, Math.abs(val));
        }
      }
    }
    if (maxAbs < 1e-7) return;

    const scaleMax = mode === "cp" ? 2.5 : Math.max(0.25, Math.min(20.0, maxAbs * 0.75));
    ctx.save();
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        if (f.solid?.[j]?.[i]) continue;
        const val = scalar[j]?.[i];
        if (val === null || !Number.isFinite(val)) continue;
        const norm = clamp(val / scaleMax, -1, 1);
        const absNorm = Math.abs(norm);
        if (!isRichField && absNorm < 0.04) continue;
        ctx.globalAlpha = isRichField
          ? isDark
            ? 0.06 + 0.78 * Math.pow(absNorm, 0.75)
            : 0.45 + 0.42 * absNorm
          : absNorm * (isDark ? 0.34 : 0.28);
        ctx.fillStyle =
          mode === "cp"
            ? sampleDivergingCp(val, scaleMax)
            : sampleDivergingVorticity(val, scaleMax);
        const [px0, py1] = this._worldToPixel(f.xs[i], f.ys[j], tr);
        const [px1, py0] = this._worldToPixel(f.xs[i + 1], f.ys[j + 1], tr);
        ctx.fillRect(px0, py0, Math.abs(px1 - px0) + 0.8, Math.abs(py1 - py0) + 0.8);
      }
    }
    ctx.restore();
  }

  _renderInteractiveHandles(ctx, tr, pal) {
    if (!this.interactiveHandles.length) return;
    for (const h of this.interactiveHandles) {
      const isActive =
        this._dragState?.handleId === h.id || this._hoveredHandleId === h.id;
      const col = this._resolveColor(h.color, pal.amber);

      if (h.kind === "ring") {
        const [cxW, cyW] = this._getHandleCenter(h) || [0, 0];
        const [cx, cy] = this._worldToPixel(cxW, cyW, tr);
        const r = Math.max(0.01, Number(h.r ?? 0.2));
        const rx = r * tr.scaleX;
        const ry = r * tr.scaleY;

        ctx.save();
        // Subtle outer glow on active/hovered ring
        ctx.strokeStyle = col;
        ctx.globalAlpha = isActive ? 0.32 : 0.16;
        ctx.lineWidth = isActive ? 7 : 5;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();

        // Crisp ring outline
        ctx.globalAlpha = 0.95;
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = isActive ? 2.4 : 1.8;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();

        // Right-rim draggable grip knob
        ctx.setLineDash([]);
        const gx = cx + rx;
        const gy = cy;
        ctx.fillStyle = pal.bg;
        ctx.strokeStyle = col;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(gx, gy, isActive ? 7 : 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        if (h.label) {
          this._drawPill(ctx, gx + 10, gy - 14, h.label, col, "left");
        }
      } else {
        const [hx, hy] = this._worldToPixel(Number(h.x ?? 0), Number(h.y ?? 0), tr);
        ctx.save();
        ctx.fillStyle = col;
        ctx.globalAlpha = isActive ? 0.28 : 0.18;
        ctx.beginPath();
        ctx.arc(hx, hy, isActive ? 13 : 10, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 1.0;
        ctx.fillStyle = pal.bg;
        ctx.strokeStyle = col;
        ctx.lineWidth = isActive ? 2.8 : 2.3;
        ctx.beginPath();
        ctx.arc(hx, hy, isActive ? 7 : 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(hx, hy, 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        if (h.label) {
          this._drawPill(ctx, hx, hy - 18, h.label, col, "center");
        }
      }
    }
  }

  _renderDrawPreview(ctx, tr, pal) {
    if (!this._drawDraft) return;
    const d = this._drawDraft;
    const bounds = this.scene?.bounds || [0, 1, 0, 1];
    const b1 = Math.abs(bounds[1]) > 1e-9 ? bounds[1] : 1;
    const b3 = Math.abs(bounds[3]) > 1e-9 ? bounds[3] : 1;

    ctx.save();
    ctx.strokeStyle = pal.primary;
    ctx.fillStyle = this._isDark() ? "rgba(88, 166, 255, 0.20)" : "rgba(0, 114, 178, 0.18)";
    ctx.lineWidth = 2.0;
    ctx.setLineDash([5, 4]);

    if (d.tool === "circle") {
      const [cx, cy] = this._worldToPixel(d.startX, d.startY, tr);
      const worldR = Math.hypot(d.curX - d.startX, d.curY - d.startY);
      const rClamped = clamp(worldR / b3, 0.03, 0.35) * b3;
      const rx = rClamped * tr.scaleX;
      const ry = rClamped * tr.scaleY;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      this._drawPill(ctx, cx, cy - ry - 14, `r=${fmtNum(rClamped / b3, 2)}`, pal.primary);
      return;
    }

    if (d.tool === "rect") {
      const [px0, py1] = this._worldToPixel(Math.min(d.startX, d.curX), Math.min(d.startY, d.curY), tr);
      const [px1, py0] = this._worldToPixel(Math.max(d.startX, d.curX), Math.max(d.startY, d.curY), tr);
      const wPx = Math.max(6, px1 - px0);
      const hPx = Math.max(6, py1 - py0);
      ctx.fillRect(px0, py0, wPx, hPx);
      ctx.strokeRect(px0, py0, wPx, hPx);
      ctx.restore();
      const nw = Math.abs(d.curX - d.startX) / b1;
      const nh = Math.abs(d.curY - d.startY) / b3;
      this._drawPill(ctx, px0 + wPx * 0.5, py0 - 14, `${fmtNum(nw, 2)}×${fmtNum(nh, 2)}`, pal.primary);
      return;
    }

    if (d.tool === "splitter") {
      const halfThick = 0.02 * b3;
      const [px0, py1] = this._worldToPixel(Math.min(d.startX, d.curX), d.startY - halfThick, tr);
      const [px1, py0] = this._worldToPixel(Math.max(d.startX, d.curX), d.startY + halfThick, tr);
      const wPx = Math.max(8, px1 - px0);
      const hPx = Math.max(4, py1 - py0);
      ctx.fillRect(px0, py0, wPx, hPx);
      ctx.strokeRect(px0, py0, wPx, hPx);
      ctx.restore();
      const lenNorm = Math.abs(d.curX - d.startX) / b1;
      this._drawPill(ctx, px0 + wPx * 0.5, py0 - 14, `Splitter L=${fmtNum(lenNorm, 2)}`, pal.primary);
      return;
    }
    ctx.restore();
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

    const isDark = this._isDark();
    const pal = this._palette();
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, cw, ch);

    if (!this.scene) return;

    const tr = this._getTransform();
    const { xmin, xmax, ymin, ymax, ox, oy, boxW, boxH, scaleX, scaleY } = tr;
    const xTicks = niceTicks(xmin, xmax, 5);
    const yTicks = niceTicks(ymin, ymax, 5);

    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, boxW, boxH);
    ctx.clip();

    // 1. 256-stop Perceptual Scalar Heatmap (Vorticity, Speed |V|, or Cp)
    this._renderScalarHeatmap(ctx, tr, isDark);

    // 2. Calibrated drafting grid aligned to niceTicks
    ctx.strokeStyle = pal.grid;
    ctx.lineWidth = 1;
    for (const wx of xTicks) {
      const [px] = this._worldToPixel(wx, ymin, tr);
      ctx.beginPath(); ctx.moveTo(px, oy); ctx.lineTo(px, oy + boxH); ctx.stroke();
    }
    for (const wy of yTicks) {
      const [, py] = this._worldToPixel(xmin, wy, tr);
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

    // 3. Screen-space tangent velocity arrows (high contrast >= 0.72 alpha)
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
          if (f.solid?.[j]?.[i] || this._insideObstacle(wx, wy)) continue;
          const u = f.U?.[j]?.[i];
          const v = f.V?.[j]?.[i];
          if (u === null || v === null || u === undefined || v === undefined) continue;
          const spd = Math.hypot(u, v);
          if (spd < 1e-4) continue;
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
            Math.max(4.0, Math.min(6.0, len * 0.36)),
            pal.vectorInk,
            1.25
          );
        }
      }
    }

    // 4. Advected Tracer Particles (freeze cleanly when paused / reduced motion)
    const domainDiag = Math.hypot(xmax - xmin, ymax - ymin);
    const dtStep = 0.008 * domainDiag;
    if (this.scene.field?.xs) {
      for (const p of this.particles) {
        const s = this._sampleField(p.x, p.y);
        if (!s || s.speed < 1e-4 || p.life >= p.maxLife || this._insideObstacle(p.x, p.y)) {
          if (!this._paused) {
            p.x = xmin + Math.random() * (xmax - xmin);
            p.y = ymin + Math.random() * (ymax - ymin);
            p.life = 0;
          }
          continue;
        }
        const cap = Math.min(s.speed, 6.0);
        const dirX = s.u / s.speed;
        const dirY = s.v / s.speed;

        if (this._paused) {
          const [ax, ay] = this._worldToPixel(p.x, p.y, tr);
          const [bx, by] = this._worldToPixel(p.x + dirX * cap * dtStep * 0.75, p.y + dirY * cap * dtStep * 0.75, tr);
          ctx.strokeStyle = `rgba(${pal.tracerRgb}, 0.52)`;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
          continue;
        }

        const prevX = p.x;
        const prevY = p.y;
        p.x += dirX * cap * dtStep;
        p.y += dirY * cap * dtStep;
        p.life += 1;

        if (p.x < xmin || p.x > xmax || p.y < ymin || p.y > ymax || this._insideObstacle(p.x, p.y)) {
          p.life = p.maxLife;
          continue;
        }
        const [ax, ay] = this._worldToPixel(prevX, prevY, tr);
        const [bx, by] = this._worldToPixel(p.x, p.y, tr);
        const alpha = Math.sin((p.life / p.maxLife) * Math.PI) * 0.68;
        ctx.strokeStyle = `rgba(${pal.tracerRgb}, ${alpha.toFixed(2)})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      }
    }

    // 5. Shaded Horizontal Plug Bands
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
      ctx.lineWidth = 2.2;
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

    // Overlays: Vortex Core, Stokes Loop (#009E73 dashed), Cylinder, Solid Cells & Obstacles
    if (this.scene.vortexCoreRadius) {
      const r = this.scene.vortexCoreRadius;
      const [cx, cy] = this._worldToPixel(0, 0, tr);
      const rx = r * scaleX;
      const ry = r * scaleY;
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = pal.amber;
      ctx.lineWidth = 1.8;
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
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = this._resolveColor(this.scene.stokesLoop.color, OKABE_ITO.green);
      ctx.lineWidth = 2.0;
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
      ctx.lineWidth = 1.9;
      ctx.beginPath();
      ctx.ellipse(cx, cy, a * scaleX, a * scaleY, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Crisp solid cell outlines (fillRect + strokeRect)
    if (this.scene.solidRects?.length) {
      ctx.save();
      ctx.fillStyle = pal.solidFill;
      ctx.strokeStyle = pal.solidStroke;
      ctx.lineWidth = 1.1;
      for (const [rx0, ry0, rw, rh] of this.scene.solidRects) {
        const [px0, py1] = this._worldToPixel(rx0, ry0, tr);
        const [px1, py0] = this._worldToPixel(rx0 + rw, ry0 + rh, tr);
        const wPx = Math.max(2, px1 - px0);
        const hPx = Math.max(2, py1 - py0);
        ctx.fillRect(px0, py0, wPx, hPx);
        ctx.strokeRect(px0, py0, wPx, hPx);
      }
      ctx.restore();
    } else if (this.scene.field?.solid?.length && this.scene.field?.xs?.length && this.scene.field?.ys?.length) {
      const f = this.scene.field;
      ctx.save();
      ctx.fillStyle = pal.solidFill;
      ctx.strokeStyle = pal.solidStroke;
      ctx.lineWidth = 1.0;
      for (let j = 0; j < f.ys.length - 1; j++) {
        for (let i = 0; i < f.xs.length - 1; i++) {
          if (!f.solid[j]?.[i]) continue;
          const [px0, py1] = this._worldToPixel(f.xs[i], f.ys[j], tr);
          const [px1, py0] = this._worldToPixel(f.xs[i + 1], f.ys[j + 1], tr);
          const wPx = Math.max(2, px1 - px0);
          const hPx = Math.max(2, py1 - py0);
          ctx.fillRect(px0, py0, wPx, hPx);
          ctx.strokeRect(px0, py0, wPx, hPx);
        }
      }
      ctx.restore();
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

    // Dashed Schematic Guides
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

    // Fluid Element square (initial dashed + deformed amber box)
    const drawPoly = (pts, color, dashed, fillAlpha = 0) => {
      if (!pts || pts.length < 3) return;
      ctx.save();
      if (dashed) ctx.setLineDash([4, 3]);
      const col = this._resolveColor(color, pal.amber);
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.9;
      ctx.beginPath();
      pts.forEach(([wx, wy], i) => {
        const [px, py] = this._worldToPixel(wx, wy, tr);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
      if (fillAlpha > 0) {
        ctx.fillStyle = `rgba(213, 94, 0, ${fillAlpha})`;
        ctx.fill();
      }
      ctx.stroke();
      ctx.restore();
    };

    if (this.scene.initialElement) drawPoly(this.scene.initialElement, pal.tickInk, true, 0);
    if (this.scene.deformedElement) drawPoly(this.scene.deformedElement, pal.amber, false, 0.22);

    // 7. Analytical Trajectories (Okabe-Ito defaults)
    drawCurve(this.scene.streamline, this.scene.streamlineColor || pal.streamline, 2.5, []);
    drawCurve(this.scene.pathline, this.scene.pathlineColor || pal.pathline, 2.6, []);
    drawCurve(this.scene.streakline, this.scene.streaklineColor || pal.streakline, 2.5, [7, 4]);
    drawCurve(this.scene.spiralCurve, this.scene.spiralColor || pal.pathline, 2.5, []);

    // Eddies / Roller Circular Indicators
    if (this.scene.eddies?.length) {
      for (const ed of this.scene.eddies) {
        const [cx, cy] = this._worldToPixel(ed.cx, ed.cy, tr);
        const rx = ed.rx * scaleX;
        const ry = ed.ry * scaleY;
        const col = this._resolveColor(ed.color, pal.coral);
        ctx.save();
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.7;
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
          this._drawPill(ctx, (x0 + x1) * 0.5, y1 - 15, vo.label, col);
        }
      }
    }

    // Horizontal reference guides
    if (this.scene.hLines) {
      for (const hl of this.scene.hLines) {
        const [, py] = this._worldToPixel(xmin, hl.y, tr);
        const col = this._resolveColor(hl.color, pal.amber);
        ctx.save();
        if (hl.dashed) ctx.setLineDash([5, 4]);
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(ox, py); ctx.lineTo(ox + boxW, py); ctx.stroke();
        if (hl.label) {
          ctx.font = '600 12px "IBM Plex Mono", monospace';
          const tw = ctx.measureText(hl.label).width;
          const padX = 5;
          const pillW = tw + padX * 2;
          const pillH = 18;
          const bx = ox + 6;
          const by = Math.max(oy + 2, py - pillH - 3);
          ctx.fillStyle = pal.pillBg;
          ctx.beginPath();
          if (typeof ctx.roundRect === "function") ctx.roundRect(bx, by, pillW, pillH, 4);
          else ctx.rect(bx, by, pillW, pillH);
          ctx.fill();
          ctx.fillStyle = this._resolveTextColor(hl.color, pal.amber);
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(hl.label, bx + padX, by + pillH * 0.5 + 0.5);
        }
        ctx.restore();
      }
    }

    // Potential stagnation points
    if (this.scene.stagnationPoints) {
      for (const [sx, sy] of this.scene.stagnationPoints) {
        const [px, py] = this._worldToPixel(sx, sy, tr);
        ctx.fillStyle = pal.coral;
        ctx.strokeStyle = pal.bg;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(px, py, 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    // Seed / Injection point marker (if not already rendered via interactiveHandles)
    if (this.scene.seedPoint && !this.interactiveHandles.some((h) => h.id === "seed")) {
      const [sx, sy] = this._worldToPixel(this.scene.seedPoint[0], this.scene.seedPoint[1], tr);
      ctx.strokeStyle = pal.amber;
      ctx.fillStyle = pal.bg;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(sx, sy, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Callout annotations pinned to world coords
    if (this.scene.annotations?.length) {
      for (const ann of this.scene.annotations) {
        const [px, py] = this._worldToPixel(ann.x, ann.y, tr);
        this._drawPill(ctx, px, py, ann.text, ann.color ? this._resolveColor(ann.color, pal.pillBorder) : null, ann.align || "center");
      }
    }

    // Interactive Drag Handles & Live LBM Obstacle Preview
    this._renderInteractiveHandles(ctx, tr, pal);
    this._renderDrawPreview(ctx, tr, pal);

    // Local Hover Crosshair inside canvas
    if (this.mouseWorld) {
      const [mx, my] = this._worldToPixel(this.mouseWorld[0], this.mouseWorld[1], tr);
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = pal.crosshair;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(mx, oy); ctx.lineTo(mx, oy + boxH);
      ctx.moveTo(ox, my); ctx.lineTo(ox + boxW, my);
      ctx.stroke();
      ctx.restore();
    }

    // External Synced Hover Crosshair from CurvePlotEngine
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
          [px] = this._worldToPixel(ex, ymin, tr);
          ctx.moveTo(px, oy);
          ctx.lineTo(px, oy + boxH);
        }
        if (yIn) {
          [, py] = this._worldToPixel(xmin, ey, tr);
          ctx.moveTo(ox, py);
          ctx.lineTo(ox + boxW, py);
        }
        ctx.stroke();
        if (xIn && yIn && px !== null && py !== null) {
          ctx.setLineDash([]);
          ctx.fillStyle = pal.bg;
          ctx.strokeStyle = pal.extCrosshair;
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.arc(px, py, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // Empty / Unspoiled Quiz / Honest Scope Overlay Box (>= 12px fonts)
    if (this.scene.emptyMessage) {
      ctx.save();
      const col = this.scene.emptyTone === "primary" ? pal.primary : pal.coral;
      const bw = Math.min(boxW - 24, 480);
      const subText = this.scene.emptySub || "SymPy Governing Auditor & Textbook Guardrails Active";
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
      const bx = ox + (boxW - bw) * 0.5;
      const by = oy + (boxH - bh) * 0.5;
      ctx.fillStyle = pal.pillBg;
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.6;
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeRect(bx, by, bw, bh);
      ctx.fillStyle = this._resolveTextColor(this.scene.emptyTone === "primary" ? "primary" : "coral", pal.labelInk);
      ctx.font = '700 13.5px "Space Grotesk", "IBM Plex Sans", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(this.scene.emptyMessage, ox + boxW * 0.5, by + 24);
      ctx.fillStyle = pal.tickInk;
      ctx.font = '12px "IBM Plex Sans", sans-serif';
      subLines.forEach((line, li) => {
        ctx.fillText(line, ox + boxW * 0.5, by + 44 + li * 18);
      });
      ctx.restore();
    }

    ctx.restore();

    // 8. Outer Axis Frame, Nice Ticks (>= 12px), and Explicit X/Y Axis Titles
    ctx.strokeStyle = pal.frame;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(ox, oy, boxW, boxH);

    const xDec = tickDecimals(xTicks);
    const yDec = tickDecimals(yTicks);

    ctx.fillStyle = pal.tickInk;
    ctx.font = '12px "IBM Plex Mono", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    for (const wx of xTicks) {
      const [px] = this._worldToPixel(wx, ymin, tr);
      ctx.fillText(fmtNum(wx, xDec), px, oy + boxH + 17);
    }
    ctx.textAlign = "right";
    for (const wy of yTicks) {
      const [, py] = this._worldToPixel(xmin, wy, tr);
      ctx.fillText(fmtNum(wy, yDec), ox - 8, py + 4);
    }

    // Axis Titles
    ctx.fillStyle = pal.labelInk;
    ctx.font = '600 12.5px "IBM Plex Sans", sans-serif';
    ctx.textAlign = "center";
    ctx.fillText(this.scene.xLabel || "x (m)", ox + boxW * 0.5, ch - 10);

    ctx.save();
    ctx.translate(16, oy + boxH * 0.5);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText(this.scene.yLabel || "y (m)", 0, 0);
    ctx.restore();
  }

  _render() {
    this.render();
  }

  _fmt(v, d = 2) {
    return fmtNum(v, d);
  }
}
