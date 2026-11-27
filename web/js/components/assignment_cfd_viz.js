/**
 * Studio-Grade Dark CFD Animated Renderers for Assignment Workspace (HW 1–7).
 * Implements offscreen scalar speed/pressure/vorticity heatmaps, persistent RK2-advected
 * comet particle ribbons, hydrogen-bubble timeline filaments, sheared dye spirals,
 * and 2.5D duct velocity projections matching FluidScope AI dark-studio quality.
 */
import { fmtNum } from "../core/color_scales.js";
import {
  DARK_BG,
  clamp,
  computeFittedTransform as _coreComputeFittedTransform,
  worldToPx as _coreWorldToPx,
  pxToWorld as _corePxToWorld,
  drawDraftingFrame,
  drawArrowHead as _coreDrawArrowHead,
  drawPill as _coreDrawPill,
  drawHoverCrosshair,
  speedRgb as _coreSpeedRgb,
} from "./tutor_canvas_core.js";

// ── Shared Coordinate & Color Adapters ──────────────────────────────────────

function fitTransform(rawBounds, cw, ch, pad, aspectLock = true) {
  const arr = Array.isArray(rawBounds)
    ? rawBounds
    : [rawBounds.xMin, rawBounds.xMax, rawBounds.yMin, rawBounds.yMax];
  return _coreComputeFittedTransform(arr, cw, ch, pad, aspectLock);
}

function w2p(wx, wy, tr) {
  const [x, y] = _coreWorldToPx(wx, wy, tr);
  return { x, y };
}

function p2w(px, py, tr) {
  const [x, y] = _corePxToWorld(px, py, tr);
  return { x, y };
}

function speedRgba(t, alpha = 1) {
  const [r, g, b] = _coreSpeedRgb(clamp(t, 0, 1));
  return `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
}

function drawSafePill(ctx, text, cx, cy, accent = "#e2e8f0") {
  ctx.save();
  ctx.font = '600 11px "IBM Plex Mono", monospace';
  const halfW = ctx.measureText(text).width * 0.5 + 10;
  ctx.restore();
  const canvasW = ctx.canvas ? ctx.canvas.clientWidth || ctx.canvas.width || cx * 2 : cx * 2;
  const safeCx = clamp(cx, halfW + 8, Math.max(halfW + 8, canvasW - halfW - 8));
  _coreDrawPill(ctx, safeCx, cy, text, accent);
}

function makeOffscreen(w, h) {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/** Viridis-inspired CFD colormap returning [r, g, b]. */
function cfdRgb(t) {
  const s = clamp(t, 0, 1);
  if (s < 0.35) {
    const k = s / 0.35;
    return [Math.round(10 + k * 8), Math.round(18 + k * 66), Math.round(42 + k * 108)];
  }
  if (s < 0.72) {
    const k = (s - 0.35) / 0.37;
    return [Math.round(18 + k * 34), Math.round(84 + k * 116), Math.round(150 + k * 52)];
  }
  const k = (s - 0.72) / 0.28;
  return [Math.round(52 + k * 200), Math.round(200 + k * 32), Math.round(202 - k * 130)];
}

// ── Persistent RK2 Particle Ribbon Pool & Offscreen Heatmap Cache ───────────

const _poolState = {
  key: "",
  lastAnimTime: 0,
  particles: [],
  heatmapCanvas: null,
  heatmapKey: "",
};

function spawnRibbon(bounds, filterFn = null) {
  const spanX = Math.max(1e-6, bounds.xMax - bounds.xMin);
  const spanY = Math.max(1e-6, bounds.yMax - bounds.yMin);
  let x = bounds.xMin + Math.random() * spanX;
  let y = bounds.yMin + Math.random() * spanY;
  if (filterFn) {
    for (let i = 0; i < 16; i++) {
      const cx = bounds.xMin + Math.random() * spanX;
      const cy = bounds.yMin + Math.random() * spanY;
      if (filterFn(cx, cy)) {
        x = cx;
        y = cy;
        break;
      }
    }
  }
  return {
    x,
    y,
    trail: [],
    life: Math.floor(Math.random() * 65),
    maxLife: 65 + Math.floor(Math.random() * 80),
  };
}

function stepRibbonPool(key, bounds, count, evalUV, speedCeiling, animTimeSec, filterFn = null) {
  const spanX = Math.max(1e-6, bounds.xMax - bounds.xMin);
  const spanY = Math.max(1e-6, bounds.yMax - bounds.yMin);
  const minSpan = Math.min(spanX, spanY);

  if (_poolState.key !== key) {
    _poolState.key = key;
    _poolState.lastAnimTime = animTimeSec;
    _poolState.particles = [];
    for (let i = 0; i < count; i++) {
      _poolState.particles.push(spawnRibbon(bounds, filterFn));
    }
    // Immediate warmup so frame 0 renders flowing comet streaks rather than dots
    for (let w = 0; w < 10; w++) {
      advanceRibbonsOnce(bounds, evalUV, speedCeiling, minSpan, filterFn, 1.0);
    }
    return _poolState.particles;
  }

  let dt = animTimeSec - _poolState.lastAnimTime;
  _poolState.lastAnimTime = animTimeSec;
  if (dt < -0.1 || dt > 0.4) dt = 0.016; // handle reset / scrub gracefully
  if (dt > 0.0005) {
    const sub = clamp(dt / 0.016, 0.2, 2.2);
    advanceRibbonsOnce(bounds, evalUV, speedCeiling, minSpan, filterFn, sub);
  }
  return _poolState.particles;
}

function advanceRibbonsOnce(bounds, evalUV, speedCeiling, minSpan, filterFn, timeMul) {
  const TRAIL_LEN = 14;
  for (const p of _poolState.particles) {
    if (p.life >= p.maxLife || (filterFn && !filterFn(p.x, p.y))) {
      Object.assign(p, spawnRibbon(bounds, filterFn), { life: 0 });
      continue;
    }
    const [u1, v1] = evalUV(p.x, p.y);
    const sp1 = Math.hypot(u1, v1);
    if (!Number.isFinite(sp1) || sp1 < 1e-5 || sp1 > 1e4) {
      Object.assign(p, spawnRibbon(bounds, filterFn), { life: 0 });
      continue;
    }
    const norm1 = clamp(sp1 / Math.max(speedCeiling, 1e-4), 0, 1);
    const stepDist = (0.005 + 0.013 * norm1) * minSpan * timeMul;
    const dt1 = stepDist / sp1;
    const midX = p.x + 0.5 * u1 * dt1;
    const midY = p.y + 0.5 * v1 * dt1;
    const [u2, v2] = evalUV(midX, midY);
    const sp2 = Math.hypot(u2, v2);
    const ux = sp2 > 1e-5 && Number.isFinite(sp2) ? u2 : u1;
    const uy = sp2 > 1e-5 && Number.isFinite(sp2) ? v2 : v1;
    const dt2 = stepDist / Math.hypot(ux, uy);

    p.trail.push({ x: p.x, y: p.y, norm: norm1 });
    if (p.trail.length > TRAIL_LEN) p.trail.shift();

    p.x += ux * dt2;
    p.y += uy * dt2;
    p.life += 1;

    if (
      p.x < bounds.xMin ||
      p.x > bounds.xMax ||
      p.y < bounds.yMin ||
      p.y > bounds.yMax ||
      (filterFn && !filterFn(p.x, p.y))
    ) {
      Object.assign(p, spawnRibbon(bounds, filterFn), { life: 0 });
    }
  }
}

function drawRibbons(ctx, particles, tr) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(tr.ox, tr.oy, tr.boxW, tr.boxH);
  ctx.clip();
  ctx.lineCap = "round";

  for (const p of particles) {
    const n = p.trail.length;
    if (n < 2) continue;
    const env = Math.sin((p.life / p.maxLife) * Math.PI);
    if (env < 0.05) continue;

    for (let i = 1; i < n; i++) {
      const a0 = p.trail[i - 1];
      const a1 = p.trail[i];
      const f = i / (n - 1);
      const alpha = f * f * env * 0.9;
      const p0 = w2p(a0.x, a0.y, tr);
      const p1 = w2p(a1.x, a1.y, tr);
      ctx.strokeStyle = speedRgba(a1.norm, alpha);
      ctx.lineWidth = 0.8 + f * 1.35;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }

    const tip = w2p(p.x, p.y, tr);
    const headNorm = p.trail[n - 1].norm;
    ctx.fillStyle = speedRgba(headNorm, 0.95 * env);
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 1.4 + headNorm * 0.85, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawHeatmapFromEval(ctx, tr, raw, cacheKey, scalarFn, alpha = 0.9) {
  if (_poolState.heatmapKey !== cacheKey || !_poolState.heatmapCanvas) {
    const off = makeOffscreen(72, 52);
    if (off) {
      const octx = off.getContext("2d");
      const img = octx.createImageData(off.width, off.height);
      for (let py = 0; py < off.height; py++) {
        const wy = raw.yMax - (py / (off.height - 1)) * (raw.yMax - raw.yMin);
        for (let px = 0; px < off.width; px++) {
          const wx = raw.xMin + (px / (off.width - 1)) * (raw.xMax - raw.xMin);
          const norm = clamp(scalarFn(wx, wy), 0, 1);
          const idx = (py * off.width + px) * 4;
          // Deep midnight navy (#080d1a) -> cobalt (#0f294a) -> electric teal (#0e7490)
          img.data[idx] = Math.round(8 + norm * 16);
          img.data[idx + 1] = Math.round(13 + norm * norm * 96 + norm * 24);
          img.data[idx + 2] = Math.round(26 + norm * 136);
          img.data[idx + 3] = 255;
        }
      }
      octx.putImageData(img, 0, 0);
      _poolState.heatmapCanvas = off;
      _poolState.heatmapKey = cacheKey;
    }
  }
  if (_poolState.heatmapCanvas) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(tr.ox, tr.oy, tr.boxW, tr.boxH);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = alpha;
    ctx.drawImage(_poolState.heatmapCanvas, tr.ox, tr.oy, tr.boxW, tr.boxH);
    ctx.restore();
  }
}

function drawWorldCurve(ctx, pts, tr, color, width = 2.4, dashed = false, glow = false) {
  if (!pts || pts.length < 2) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(tr.ox, tr.oy, tr.boxW, tr.boxH);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (dashed) ctx.setLineDash([6, 4]);
  if (glow) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 7;
  }
  ctx.beginPath();
  pts.forEach((pt, idx) => {
    const p = w2p(pt.x, pt.y, tr);
    if (idx === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.stroke();
  ctx.restore();
}

// ── Per-Homework Pro Renderers ──────────────────────────────────────────────

function renderHw1Pro(ctx, cw, ch, v, sim, animTimeSec, hoverPx) {
  const cycle = Math.max(sim.tEnd - (sim.isCustom ? 0 : v.t0), 1.5);
  const frac = (animTimeSec % cycle) / cycle;
  const tCur = sim.isCustom ? animTimeSec % Math.max(sim.tEnd, 1.5) : v.t0 + frac * (sim.tEnd - v.t0);

  const evalUV = sim.isCustom
    ? (wx, wy) => {
        const s = sim.sampler?.sample(wx, wy);
        return s ? [s.u, s.v] : [0, 0];
      }
    : (wx) => [wx / (tCur + v.t0), v.v0];

  const allPts = [...(sim.streamline || []), ...(sim.pathline || []), ...(sim.streakline || [])];
  let raw = sim.isCustom
    ? { xMin: sim.bounds[0], xMax: sim.bounds[1], yMin: sim.bounds[2], yMax: sim.bounds[3] }
    : { xMin: 0, xMax: Math.max(2.6 * v.x0, 2.5), yMin: v.y0 - 0.5, yMax: v.y0 + Math.max(2.4, 1.35 * v.v0 * sim.tEnd) };
  if (!sim.isCustom && allPts.length) {
    allPts.forEach((p) => {
      if (Number.isFinite(p.x) && Number.isFinite(p.y)) {
        raw.xMin = Math.min(raw.xMin, p.x - 0.45);
        raw.xMax = Math.max(raw.xMax, p.x + 0.55);
        raw.yMin = Math.min(raw.yMin, p.y - 0.45);
        raw.yMax = Math.max(raw.yMax, p.y + 0.55);
      }
    });
  }

  const tr = fitTransform(raw, cw, ch, { left: 48, right: 18, top: 28, bottom: 32 }, false);
  const spdCeiling = Math.max(3.2, Math.hypot(raw.xMax / (v.t0 + 0.5), v.v0));
  const timeBucket = Math.floor(tCur * 6);
  drawHeatmapFromEval(
    ctx,
    tr,
    raw,
    `hw1:${sim.isCustom}:${v.t0}:${v.v0}:${timeBucket}`,
    (wx, wy) => {
      const [u, vv] = evalUV(wx, wy);
      return Math.log1p(Math.hypot(u, vv)) / Math.log1p(spdCeiling);
    },
    0.92
  );
  drawDraftingFrame(ctx, tr, cw, ch, "x (m)", "y (m)");

  const particles = stepRibbonPool(
    `hw1:${sim.isCustom}:${v.t0}:${v.v0}:${v.x0}:${v.y0}:${sim.isCustom ? "c" : "a"}`,
    raw,
    280,
    evalUV,
    spdCeiling,
    animTimeSec
  );
  drawRibbons(ctx, particles, tr);

  // Reference initial streamline (faint dashed) + instantaneous streamline at tCur
  drawWorldCurve(ctx, sim.streamline, tr, "rgba(56, 189, 248, 0.42)", 1.6, true);
  if (!sim.isCustom) {
    const liveStream = [];
    for (let i = 0; i <= 60; i++) {
      const yS = v.y0 + (i / 60) * (v.v0 * (sim.tEnd - v.t0) * 1.05);
      const xS = v.x0 * Math.exp((yS - v.y0) / (v.v0 * (tCur + v.t0)));
      liveStream.push({ x: xS, y: yS });
    }
    drawWorldCurve(ctx, liveStream, tr, "#38bdf8", 2.2, true, true);
  }
  drawWorldCurve(ctx, sim.pathline, tr, "rgba(251, 146, 60, 0.45)", 1.8, false);

  if (!sim.isCustom) {
    const pathSlice = sim.pathline.slice(0, Math.max(2, Math.floor(frac * (sim.pathline.length - 1)) + 1));
    drawWorldCurve(ctx, pathSlice, tr, "#fb923c", 2.8, false, true);

    // Growing billowing Streakline dye filament & glowing droplets
    const nDye = Math.max(3, Math.floor(frac * 55));
    const dyeCurve = [];
    for (let k = 0; k <= nDye; k++) {
      const tau = v.t0 + (k / 55) * (tCur - v.t0);
      const px = v.x0 * ((tCur + v.t0) / (tau + v.t0));
      const py = v.y0 + v.v0 * (tCur - tau);
      dyeCurve.push({ x: px, y: py });
    }
    drawWorldCurve(ctx, dyeCurve, tr, "#f43f5e", 2.4, false, true);
    dyeCurve.forEach((pt, idx) => {
      if (idx % 3 !== 0) return;
      const ageFrac = 1 - idx / Math.max(dyeCurve.length, 1);
      const sc = w2p(pt.x, pt.y, tr);
      ctx.fillStyle = `rgba(251, 113, 133, ${(0.88 - ageFrac * 0.4).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(sc.x, sc.y, 2.2 + ageFrac * 2.2, 0, Math.PI * 2);
      ctx.fill();
    });

    // Moving Fluid Parcel with glowing halo & instantaneous velocity vector
    const xP = v.x0 * ((tCur + v.t0) / (2 * v.t0));
    const yP = v.y0 + v.v0 * (tCur - v.t0);
    const pSc = w2p(xP, yP, tr);
    const [uP, vP] = evalUV(xP, yP);
    const velTip = w2p(xP + uP * 0.32, yP + vP * 0.32, tr);
    _coreDrawArrowHead(ctx, pSc.x, pSc.y, velTip.x, velTip.y, "#fde047", 2.2, 6.5);

    ctx.fillStyle = "rgba(251, 146, 60, 0.25)";
    ctx.beginPath();
    ctx.arc(pSc.x, pSc.y, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fb923c";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pSc.x, pSc.y, 5.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Fixed Nozzle at (x0, y0)
    const sSc = w2p(v.x0, v.y0, tr);
    ctx.fillStyle = "#34d399";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(sSc.x, sSc.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    drawSafePill(ctx, `t=${fmtNum(tCur, 2)}s | Dye (pink) · Parcel (amber) · Stream (cyan)`, cw * 0.52, 16, "#38bdf8");
  } else {
    drawWorldCurve(ctx, sim.streakline, tr, "#f43f5e", 2.5, false, true);
    const idx = Math.min(sim.pathline.length - 1, Math.floor(frac * Math.max(1, sim.pathline.length - 1)));
    if (sim.pathline[idx]) {
      const pSc = w2p(sim.pathline[idx].x, sim.pathline[idx].y, tr);
      ctx.fillStyle = "#fb923c";
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(pSc.x, pSc.y, 5.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    drawSafePill(ctx, "Custom SymPy / SciPy Dense Particle Field", cw * 0.52, 16, "#34d399");
  }

  let hoverInfo = null;
  if (hoverPx) {
    const wp = p2w(hoverPx.x, hoverPx.y, tr);
    drawHoverCrosshair(ctx, tr, [wp.x, wp.y]);
    const [u, vv] = evalUV(wp.x, wp.y);
    hoverInfo = `x=${fmtNum(wp.x, 2)}m, y=${fmtNum(wp.y, 2)}m | u=${fmtNum(u, 2)}, v=${fmtNum(vv, 2)} m/s`;
  }
  return hoverInfo;
}

function renderHw2Pro(ctx, cw, ch, v, sim, animTimeSec, hoverPx) {
  const loopT = animTimeSec % Math.max(sim.tEnd, 1.0);
  const raw = sim.isCustom
    ? { xMin: sim.bounds[0], xMax: sim.bounds[1], yMin: sim.bounds[2], yMax: sim.bounds[3] }
    : { xMin: -0.35, xMax: Math.max(3.8, sim.box0.xR * Math.exp(v.tau_end) + 0.5), yMin: -0.25, yMax: Math.max(2.4, sim.box0.yT + 0.4) };

  const tr = fitTransform(raw, cw, ch, { left: 48, right: 18, top: 28, bottom: 32 }, true);
  const evalUV = sim.isCustom
    ? (wx, wy) => {
        const s = sim.sampler?.sample(wx, wy);
        return s ? [s.u, s.v] : [0, 0];
      }
    : (wx, wy) => [v.A * wx, -v.A * wy];

  const spdMax = Math.max(v.A * 3.8, 1.8);
  drawHeatmapFromEval(
    ctx,
    tr,
    raw,
    `hw2:${sim.isCustom}:${v.A}:${raw.xMax.toFixed(1)}`,
    (wx, wy) => Math.log1p(Math.hypot(...evalUV(wx, wy))) / Math.log1p(spdMax),
    0.92
  );
  drawDraftingFrame(ctx, tr, cw, ch, "x (m)", "y (m)");

  const particles = stepRibbonPool(
    `hw2:${sim.isCustom}:${v.A}:${raw.xMax.toFixed(1)}`,
    raw,
    290,
    evalUV,
    spdMax,
    animTimeSec
  );
  drawRibbons(ctx, particles, tr);

  if (!sim.isCustom) {
    // Glowing hyperbolic streamlines xy = C
    [0.25, 0.7, 1.4, 2.5, 4.0].forEach((cVal) => {
      const pts = [];
      for (let i = 0; i <= 45; i++) {
        const px = 0.08 + (i / 45) * raw.xMax;
        const py = cVal / px;
        if (py >= raw.yMin && py <= raw.yMax) pts.push({ x: px, y: py });
      }
      drawWorldCurve(ctx, pts, tr, "rgba(56, 189, 248, 0.36)", 1.3, false);
    });

    // Stagnation point beacon at (0,0)
    const orig = w2p(0, 0, tr);
    ctx.fillStyle = "rgba(244, 63, 94, 0.32)";
    ctx.beginPath();
    ctx.arc(orig.x, orig.y, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f43f5e";
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(orig.x, orig.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Ghost initial rectangle + corner pathline traces
    const { xL, xR, yB, yT } = sim.box0;
    const gTL = w2p(xL, yT, tr);
    const gBR = w2p(xR, yB, tr);
    ctx.save();
    ctx.strokeStyle = "rgba(148, 163, 184, 0.6)";
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1.4;
    ctx.strokeRect(gTL.x, gTL.y, gBR.x - gTL.x, gBR.y - gTL.y);
    ctx.restore();

    const corners0 = [[xL, yB], [xR, yB], [xR, yT], [xL, yT]];
    corners0.forEach(([cx0, cy0]) => {
      const trace = [];
      for (let i = 0; i <= 24; i++) {
        const ti = (i / 24) * loopT;
        trace.push({ x: cx0 * Math.exp(v.A * ti), y: cy0 * Math.exp(-v.A * ti) });
      }
      drawWorldCurve(ctx, trace, tr, "rgba(251, 191, 36, 0.7)", 1.5, true);
    });

    // Live stretched area-preserving block + strain principal arrows
    const st = Math.exp(v.A * loopT);
    const co = Math.exp(-v.A * loopT);
    const ax1 = xL * st, ax2 = xR * st, ay1 = yB * co, ay2 = yT * co;
    const pTL = w2p(ax1, ay2, tr);
    const pBR = w2p(ax2, ay1, tr);
    ctx.save();
    ctx.fillStyle = "rgba(52, 211, 153, 0.28)";
    ctx.strokeStyle = "#34d399";
    ctx.lineWidth = 2.4;
    ctx.shadowColor = "#34d399";
    ctx.shadowBlur = 8;
    ctx.fillRect(pTL.x, pTL.y, pBR.x - pTL.x, pBR.y - pTL.y);
    ctx.strokeRect(pTL.x, pTL.y, pBR.x - pTL.x, pBR.y - pTL.y);
    ctx.restore();

    // Principal strain arrows at box center
    const cxBox = 0.5 * (pTL.x + pBR.x);
    const cyBox = 0.5 * (pTL.y + pBR.y);
    _coreDrawArrowHead(ctx, cxBox, cyBox, cxBox + 22, cyBox, "#fbbf24", 1.8, 5.5);
    _coreDrawArrowHead(ctx, cxBox, cyBox, cxBox - 22, cyBox, "#fbbf24", 1.8, 5.5);
    _coreDrawArrowHead(ctx, cxBox, cyBox - 20, cxBox, cyBox - 4, "#fb7185", 1.8, 5);
    _coreDrawArrowHead(ctx, cxBox, cyBox + 20, cxBox, cyBox + 4, "#fb7185", 1.8, 5);

    drawSafePill(
      ctx,
      `At=${fmtNum(v.A * loopT, 2)} | Lx=${fmtNum(ax2 - ax1, 2)}m · Ly=${fmtNum(ay2 - ay1, 2)}m | Area=${fmtNum(sim.area0, 3)}m²`,
      cw * 0.52,
      16,
      "#34d399"
    );
  } else {
    drawWorldCurve(ctx, sim.initialEl, tr, "rgba(148,163,184,0.65)", 1.6, true);
    if (sim.deformedEl?.length > 2) {
      ctx.save();
      ctx.fillStyle = "rgba(52, 211, 153, 0.28)";
      ctx.strokeStyle = "#34d399";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      sim.deformedEl.forEach((pt, idx) => {
        const p = w2p(pt.x, pt.y, tr);
        if (idx === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    drawWorldCurve(ctx, sim.streamline, tr, "#38bdf8", 2.2, true, true);
    drawWorldCurve(ctx, sim.pathline, tr, "#fb923c", 2.4, false, true);
    drawSafePill(ctx, `Custom Field | Div=${fmtNum(sim.point_probe?.divergence, 2)}, ωz=${fmtNum(sim.point_probe?.vorticity_z, 2)}`, cw * 0.52, 16, "#34d399");
  }

  if (hoverPx) {
    const wp = p2w(hoverPx.x, hoverPx.y, tr);
    drawHoverCrosshair(ctx, tr, [wp.x, wp.y]);
    const [u, vv] = evalUV(wp.x, wp.y);
    return `x=${fmtNum(wp.x, 2)}m, y=${fmtNum(wp.y, 2)}m | |V|=${fmtNum(Math.hypot(u, vv), 2)} m/s | Div=0, ωz=0`;
  }
  return null;
}

function interpolateHeight(trace, key, targetT, h0) {
  if (!trace || trace.length < 2) return h0;
  let val = trace[trace.length - 1][key];
  for (let i = 1; i < trace.length; i++) {
    if (trace[i].t >= targetT) {
      const span = Math.max(trace[i].t - trace[i - 1].t, 1e-6);
      const a = (targetT - trace[i - 1].t) / span;
      val = trace[i - 1][key] + a * (trace[i][key] - trace[i - 1][key]);
      break;
    }
  }
  return val;
}

function renderTankDrainingPro(ctx, cw, ch, hwId, v, sim, animTimeSec, hoverPx) {
  const cycle = Math.max(sim.tEnd, 1.5);
  const loopT = animTimeSec % cycle;
  const frac = loopT / cycle;
  const h0 = hwId === "hw3" ? sim.h0 : v.h0;

  const raw = { xMin: -1.15, xMax: 1.15, yMin: -0.32 * h0, yMax: 1.2 * h0 };
  const tr = fitTransform(raw, cw, ch, { left: 50, right: 20, top: 28, bottom: 26 }, false);
  drawDraftingFrame(ctx, tr, cw, ch, "Radial Cross-Section r / R", "Height z (m)");

  const hCur = hwId === "hw3"
    ? interpolateHeight(sim.viscTrace, "hNorm", loopT, 1.0) * h0
    : interpolateHeight(sim.torrCurve, "h", loopT, h0);

  // Benchmark depth (Torricelli in HW 3, Unsteady KL or Cylinder in HW 4.1)
  const hBench = hwId === "hw3"
    ? h0 * Math.pow(Math.max(0, 1 - loopT / Math.max(sim.tT, 1e-3)), 2)
    : interpolateHeight(sim.unstCurve, "h", loopT, h0);

  const rTop = hwId === "hw3" ? 0.54 : 0.64;
  const rBot = hwId === "hw3" ? 0.54 : Math.max(0.09, rTop * (sim.rb / Math.max(v.R_top, 0.05)));
  const rFree = rBot + (hCur / h0) * (rTop - rBot);
  const orifW = clamp(hwId === "hw3" ? rBot / Math.sqrt(Math.max(v.ratio_A, 1.5)) : rBot * 0.2, 0.045, rBot * 0.55);

  const pTL = w2p(-rTop, h0, tr), pTR = w2p(rTop, h0, tr);
  const pBL = w2p(-rBot, 0, tr), pBR = w2p(rBot, 0, tr);
  const pFL = w2p(-rFree, hCur, tr), pFR = w2p(rFree, hCur, tr);
  const pOL = w2p(-orifW, 0, tr), pOR = w2p(orifW, 0, tr);

  // Axisymmetric sink streamlines converging from meniscus to orifice
  const evalTankFlow = (wx, wy) => {
    if (wy < 0) return [0, -Math.max(1.5, Math.sqrt(2 * 9.81 * Math.max(hCur, 0.02)))];
    const rWall = rBot + (wy / h0) * (rTop - rBot);
    const throatScale = 1 / Math.pow(Math.max(wy / h0, 0.06), 0.72);
    const vr = -wx * throatScale * 0.65 * (1 - clamp(Math.abs(wx) / rWall, 0, 1) * 0.3);
    const vz = -0.35 * h0 * throatScale;
    return [vr, vz];
  };

  const tankFilter = (wx, wy) => {
    if (wy >= 0 && wy <= hCur) {
      const rW = rBot + (wy / h0) * (rTop - rBot);
      return Math.abs(wx) < rW * 0.94;
    }
    if (wy < 0 && wy >= raw.yMin && hCur > 0.02 * h0) {
      const jetSpread = orifW * (1 + Math.abs(wy / h0) * 0.35);
      return Math.abs(wx) <= jetSpread;
    }
    return false;
  };

  const particles = stepRibbonPool(
    `tank:${hwId}:${rBot.toFixed(2)}:${h0.toFixed(2)}`,
    { xMin: -rTop, xMax: rTop, yMin: raw.yMin, yMax: h0 },
    210,
    evalTankFlow,
    3.5 * Math.max(h0, 0.5),
    animTimeSec + (frac < 0.02 ? 0.05 : 0),
    tankFilter
  );

  // Shaded liquid volume with gradient & meniscus shimmer
  if (hCur > 0.008 * h0) {
    ctx.save();
    const grad = ctx.createLinearGradient(0, pFL.y, 0, pBL.y);
    grad.addColorStop(0, "rgba(14, 165, 233, 0.52)");
    grad.addColorStop(0.65, "rgba(12, 74, 110, 0.62)");
    grad.addColorStop(1, "rgba(2, 132, 199, 0.72)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(pFL.x, pFL.y);
    for (let s = 1; s <= 18; s++) {
      const fx = pFL.x + (s / 18) * (pFR.x - pFL.x);
      const rip = Math.sin(s * 0.9 + animTimeSec * 7.5) * 1.6 * clamp(hCur / h0, 0.1, 1);
      ctx.lineTo(fx, pFL.y + rip);
    }
    ctx.lineTo(pBR.x, pBR.y);
    ctx.lineTo(pBL.x, pBL.y);
    ctx.closePath();
    ctx.fill();

    // Glowing efflux jet below orifice
    const pJetBot = w2p(0, raw.yMin, tr);
    const jetG = ctx.createLinearGradient(0, pOL.y, 0, pJetBot.y);
    jetG.addColorStop(0, "rgba(56, 189, 248, 0.88)");
    jetG.addColorStop(1, "rgba(56, 189, 248, 0.14)");
    ctx.fillStyle = jetG;
    ctx.beginPath();
    ctx.moveTo(pOL.x + 1, pOL.y);
    ctx.lineTo(pOR.x - 1, pOR.y);
    ctx.lineTo(pOR.x - 3, pJetBot.y);
    ctx.lineTo(pOL.x + 3, pJetBot.y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Glowing internal sink particle streaks inside fluid & jet
    drawRibbons(ctx, particles, tr);

    // Bright surface meniscus
    ctx.save();
    ctx.strokeStyle = "#38bdf8";
    ctx.shadowColor = "#38bdf8";
    ctx.shadowBlur = 7;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    for (let s = 0; s <= 18; s++) {
      const fx = pFL.x + (s / 18) * (pFR.x - pFL.x);
      const rip = Math.sin(s * 0.9 + animTimeSec * 7.5) * 1.6 * clamp(hCur / h0, 0.1, 1);
      if (s === 0) ctx.moveTo(fx, pFL.y + rip);
      else ctx.lineTo(fx, pFL.y + rip);
    }
    ctx.stroke();
    ctx.restore();
  }

  // Benchmark dashed line (Torricelli / Unsteady comparison)
  if (hBench > 0.01 * h0) {
    const rB = rBot + (hBench / h0) * (rTop - rBot);
    const pBmL = w2p(-rB, hBench, tr), pBmR = w2p(rB, hBench, tr);
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = "#fbbf24";
    ctx.lineWidth = 1.9;
    ctx.beginPath();
    ctx.moveTo(pBmL.x, pBmL.y);
    ctx.lineTo(pBmR.x, pBmR.y);
    ctx.stroke();
    ctx.restore();
  }

  // Beveled steel tank walls + orifice lips + side ruler ticks
  ctx.save();
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 4.2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(pTL.x, pTL.y);
  ctx.lineTo(pBL.x, pBL.y);
  ctx.lineTo(pOL.x, pOL.y);
  ctx.moveTo(pOR.x, pOR.y);
  ctx.lineTo(pBR.x, pBR.y);
  ctx.lineTo(pTR.x, pTR.y);
  ctx.stroke();
  ctx.restore();

  const vJet = Math.sqrt(2 * 9.81 * Math.max(hCur, 0));
  if (hCur > 0.01 * h0) {
    const pJetTop = w2p(0, -0.03 * h0, tr), pJetTip = w2p(0, -0.25 * h0, tr);
    _coreDrawArrowHead(ctx, pJetTop.x, pJetTop.y, pJetTip.x, pJetTip.y, "#fde047", 2.3, 6.5);
  }

  drawSafePill(
    ctx,
    hwId === "hw3"
      ? `Viscous h=${fmtNum(hCur, 2)}m vs Torricelli h_T=${fmtNum(hBench, 2)}m | V_jet=${fmtNum(vJet, 2)}m/s`
      : `Torricelli h=${fmtNum(hCur, 2)}m | Unsteady h=${fmtNum(hBench, 2)}m | θ=${fmtNum(v.theta_deg, 0)}°`,
    cw * 0.52,
    16,
    "#38bdf8"
  );

  if (hoverPx) {
    const wp = p2w(hoverPx.x, hoverPx.y, tr);
    drawHoverCrosshair(ctx, tr, [wp.x, wp.y]);
    const pG = wp.y >= 0 && wp.y <= hCur ? 1000 * 9.81 * (hCur - wp.y) : 0;
    return `z=${fmtNum(wp.y, 3)}m | Δp_hydro=${fmtNum(pG, 0)} Pa | V_jet=${fmtNum(vJet, 2)} m/s`;
  }
  return null;
}

function renderHw4GasPro(ctx, cw, ch, v, sim, animTimeSec, hoverPx) {
  const loopT = animTimeSec % Math.max(sim.tEnd, 1.0);
  const densFrac = Math.exp(-loopT / Math.max(sim.tau, 1e-4));
  const cx = cw * 0.44, cy = ch * 0.52;
  const radPx = Math.min(cw, ch) * 0.34;

  // Radial pressure chamber glow + concentric acoustic contour rings
  ctx.save();
  const radG = ctx.createRadialGradient(cx, cy, 4, cx, cy, radPx);
  radG.addColorStop(0, `rgba(56, 189, 248, ${(0.14 + 0.62 * densFrac).toFixed(2)})`);
  radG.addColorStop(0.7, `rgba(14, 116, 144, ${(0.08 + 0.45 * densFrac).toFixed(2)})`);
  radG.addColorStop(1, `rgba(15, 23, 42, 0.85)`);
  ctx.fillStyle = radG;
  ctx.beginPath();
  ctx.arc(cx, cy, radPx, 0, Math.PI * 2);
  ctx.fill();

  for (let ring = 1; ring <= 4; ring++) {
    const rr = ((ring * 0.23 + animTimeSec * 0.14 * (0.3 + densFrac)) % 0.94) * radPx;
    ctx.strokeStyle = `rgba(125, 211, 252, ${(0.28 * densFrac * (1 - rr / radPx)).toFixed(2)})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  // Internal convective swirling gas ribbons & roaring exhaust vent streaks
  const exhaustLen = cw - (cx + radPx + 24);
  for (let i = 0; i < 65; i++) {
    const phase = ((i * 0.13 + animTimeSec * (0.4 + 1.4 * densFrac)) % 1);
    const px = cx + radPx + 24 + phase * Math.max(60, exhaustLen);
    const spread = 1 + phase * 1.8;
    const py = cy + Math.sin(i * 4.7) * radPx * 0.11 * spread;
    const streakL = 8 + 20 * densFrac;
    ctx.strokeStyle = speedRgba(clamp(densFrac * (1 - phase * 0.5), 0.1, 1), 0.78 * densFrac);
    ctx.lineWidth = 1.4 + densFrac;
    ctx.beginPath();
    ctx.moveTo(px - streakL, py);
    ctx.lineTo(px, py);
    ctx.stroke();
  }

  // Circulating molecules inside sphere converging toward exhaust valve
  const nMols = Math.max(8, Math.round(130 * densFrac));
  for (let i = 0; i < nMols; i++) {
    const spd = 0.35 + (i % 6) * 0.22;
    const ang = i * 2.39996 + animTimeSec * spd * (0.4 + densFrac);
    const rM = radPx * 0.88 * Math.sqrt(((i * 37) % 100) / 100);
    const mx = cx + rM * Math.cos(ang);
    const my = cy + rM * Math.sin(ang);
    ctx.fillStyle = speedRgba(densFrac * 0.85, 0.4 + 0.55 * densFrac);
    ctx.beginPath();
    ctx.arc(mx, my, 2.2 + densFrac, 0, Math.PI * 2);
    ctx.fill();
  }

  // Steel sphere shell + right valve neck
  ctx.save();
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, radPx, 0.14, Math.PI * 2 - 0.14);
  ctx.lineTo(cx + radPx + 34, cy - radPx * 0.14);
  ctx.moveTo(cx + radPx * Math.cos(0.14), cy + radPx * Math.sin(0.14));
  ctx.lineTo(cx + radPx + 34, cy + radPx * 0.14);
  ctx.stroke();
  ctx.restore();

  // Analog Pressure / Density Dial Gauge in bottom-right
  const gx = cw - 64, gy = ch - 58, gr = 38;
  ctx.save();
  ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
  ctx.strokeStyle = "#475569";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(gx, gy, gr, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Gauge colored arc
  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(gx, gy, gr - 7, Math.PI * 0.75, Math.PI * 0.75 + Math.PI * 1.5 * densFrac);
  ctx.stroke();
  const needleAng = Math.PI * 0.75 + Math.PI * 1.5 * densFrac;
  ctx.strokeStyle = "#fb7185";
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(gx, gy);
  ctx.lineTo(gx + (gr - 10) * Math.cos(needleAng), gy + (gr - 10) * Math.sin(needleAng));
  ctx.stroke();
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "700 10px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillText(`${fmtNum(densFrac * 100, 0)}%`, gx, gy + 24);
  ctx.restore();

  drawSafePill(
    ctx,
    `t=${fmtNum(loopT, 1)}s (t/τ=${fmtNum(loopT / sim.tau, 2)}) | ρ/ρ₀=${fmtNum(densFrac * 100, 1)}% | τ=${fmtNum(sim.tau, 2)}s`,
    cw * 0.5,
    16,
    "#38bdf8"
  );

  if (hoverPx) {
    return `ρ(t)=${fmtNum(v.rho0 * densFrac, 3)} kg/m³ | ṁ_e=${fmtNum(v.k_exhaust * v.rho0 * densFrac, 4)} kg/s`;
  }
  return null;
}

function renderHw5Pro(ctx, cw, ch, v, sim, animTimeSec, hoverPx) {
  const cx = cw * 0.5, cy = ch * 0.52;
  const outerPx = Math.min(cw, ch) * 0.4;
  const innerPx = Math.max(16, outerPx / v.kappa);
  const denom = v.kappa * v.kappa - 1;

  // Offscreen high-resolution annular velocity magnitude field
  const hKey = `hw5:${v.kappa.toFixed(2)}:${outerPx.toFixed(0)}`;
  const size = Math.round(outerPx * 2 + 8);
  if (_poolState.heatmapKey !== hKey || !_poolState.heatmapCanvas) {
    const off = makeOffscreen(140, 140);
    if (off) {
      const octx = off.getContext("2d");
      const img = octx.createImageData(140, 140);
      const mid = 69.5;
      for (let py = 0; py < 140; py++) {
        for (let px = 0; px < 140; px++) {
          const rPx = Math.hypot(px - mid, py - mid);
          const idx = (py * 140 + px) * 4;
          const rUnit = rPx / 68;
          const rNormInner = 1 / v.kappa;
          if (rUnit >= rNormInner && rUnit <= 1.0) {
            const rNorm = rUnit * v.kappa;
            const uNorm = (v.kappa * v.kappa / rNorm - rNorm) / denom;
            const [r, g, b] = cfdRgb(uNorm * 0.85);
            img.data[idx] = r;
            img.data[idx + 1] = g;
            img.data[idx + 2] = b;
            img.data[idx + 3] = 225;
          } else {
            img.data[idx + 3] = 0;
          }
        }
      }
      octx.putImageData(img, 0, 0);
      _poolState.heatmapCanvas = off;
      _poolState.heatmapKey = hKey;
    }
  }
  if (_poolState.heatmapCanvas) {
    ctx.drawImage(_poolState.heatmapCanvas, cx - outerPx - 2, cy - outerPx - 2, size - 4, size - 4);
  }

  // Concentric orbiting glowing comet arcs at exact angular rate omega(r) = u_theta / r
  const omegaBase = Math.min(v.omega1 * 0.35, 5.5);
  for (let ring = 0; ring < 9; ring++) {
    const xi = 0.06 + (ring / 8) * 0.88;
    const rNorm = 1 + (v.kappa - 1) * xi;
    const uNorm = (v.kappa * v.kappa / rNorm - rNorm) / denom;
    const omegaEff = (uNorm / rNorm) * omegaBase;
    const rCurPx = innerPx + xi * (outerPx - innerPx);
    const nPar = 10 + ring * 2;
    const arcSpan = clamp(0.12 + uNorm * 0.32, 0.08, 0.45);
    for (let m = 0; m < nPar; m++) {
      const thHead = (m * Math.PI * 2) / nPar + animTimeSec * omegaEff;
      ctx.strokeStyle = speedRgba(uNorm, 0.88);
      ctx.lineWidth = 1.6 + uNorm * 1.1;
      ctx.beginPath();
      ctx.arc(cx, cy, rCurPx, thHead - arcSpan, thHead);
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(cx + rCurPx * Math.cos(thHead), cy + rCurPx * Math.sin(thHead), 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Sheared Material Dye Filament spiral (seeded radially at theta=0, sheared over cycle)
  const shearCycle = animTimeSec % 6.0;
  ctx.save();
  ctx.strokeStyle = "#f43f5e";
  ctx.shadowColor = "#f43f5e";
  ctx.shadowBlur = 7;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  for (let k = 0; k <= 40; k++) {
    const xi = k / 40;
    const rNorm = 1 + (v.kappa - 1) * xi;
    const uNorm = (v.kappa * v.kappa / rNorm - rNorm) / denom;
    const th = (uNorm / rNorm) * omegaBase * shearCycle;
    const rCurPx = innerPx + xi * (outerPx - innerPx);
    const sx = cx + rCurPx * Math.cos(th);
    const sy = cy + rCurPx * Math.sin(th);
    if (k === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  }
  ctx.stroke();
  ctx.restore();

  // Inner spinning brushed-steel rotor & stationary outer wall
  const rotorAng = animTimeSec * omegaBase;
  ctx.save();
  ctx.fillStyle = "#1e293b";
  ctx.beginPath();
  ctx.arc(cx, cy, innerPx, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 2.6;
  ctx.stroke();
  for (let s = 0; s < 4; s++) {
    const a = rotorAng + (s * Math.PI) / 2;
    ctx.strokeStyle = s === 0 ? "#fb923c" : "rgba(148,163,184,0.45)";
    ctx.lineWidth = s === 0 ? 2.6 : 1.4;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + innerPx * 0.88 * Math.cos(a), cy + innerPx * 0.88 * Math.sin(a));
    ctx.stroke();
  }
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.arc(cx, cy, outerPx, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  drawSafePill(
    ctx,
    `κ=${fmtNum(v.kappa, 2)} | Red Spiral = Sheared Dye Line | Δp*=${fmtNum(sim.dp_norm_max, 3)}`,
    cw * 0.5,
    16,
    "#fb923c"
  );

  if (hoverPx) {
    const rPx = Math.hypot(hoverPx.x - cx, hoverPx.y - cy);
    if (rPx >= innerPx && rPx <= outerPx) {
      const xi = (rPx - innerPx) / (outerPx - innerPx);
      const rNorm = 1 + (v.kappa - 1) * xi;
      const uNorm = (v.kappa * v.kappa / rNorm - rNorm) / denom;
      return `ξ=${fmtNum(xi, 2)} (r/R₁=${fmtNum(rNorm, 2)}) | u_θ/V₁=${fmtNum(uNorm, 3)} (Couette ${fmtNum(1 - xi, 3)})`;
    }
  }
  return null;
}

function renderHw6Pro(ctx, cw, ch, v, sim, animTimeSec, hoverPx) {
  // Left 54%: Smooth High-Res 2D Cross-Section Contour Heatmap
  // Right 44%: Animated 2.5D Axial Flow Pipe/Duct Comet Streaks + Velocity Profile
  const leftW = cw * 0.54;
  const aspectVis = clamp(v.alpha, 0.22, 4.2);
  const availW = leftW - 36, availH = ch - 68;
  const baseW = aspectVis >= 1 ? availW : availW * aspectVis;
  const baseH = aspectVis >= 1 ? availW / aspectVis : availH;
  const sc = Math.min(availW / baseW, availH / baseH);
  const drawW = baseW * sc, drawH = baseH * sc;
  const x0 = 18 + (availW - drawW) * 0.5;
  const y0 = 38 + (availH - drawH) * 0.5;

  const GN = sim.GN;
  const hKey = `hw6:${v.alpha.toFixed(2)}:${v.n_terms}:${GN}`;
  if (_poolState.heatmapKey !== hKey || !_poolState.heatmapCanvas) {
    const off = makeOffscreen(GN, GN);
    if (off) {
      const octx = off.getContext("2d");
      const img = octx.createImageData(GN, GN);
      for (let j = 0; j < GN; j++) {
        for (let i = 0; i < GN; i++) {
          const val = sim.grid[j * GN + i] / sim.wMax;
          const [r, g, b] = cfdRgb(val);
          const idx = (j * GN + i) * 4;
          img.data[idx] = r;
          img.data[idx + 1] = g;
          img.data[idx + 2] = b;
          img.data[idx + 3] = 255;
        }
      }
      octx.putImageData(img, 0, 0);
      _poolState.heatmapCanvas = off;
      _poolState.heatmapKey = hKey;
    }
  }
  if (_poolState.heatmapCanvas) {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(_poolState.heatmapCanvas, x0, y0, drawW, drawH);
    ctx.restore();
  }

  // Smooth concentric iso-contours + outer duct wall
  [0.25, 0.5, 0.75, 0.92].forEach((lvl) => {
    ctx.strokeStyle = "rgba(255,255,255,0.34)";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.ellipse(
      x0 + drawW / 2,
      y0 + drawH / 2,
      drawW * 0.48 * Math.sqrt(1 - lvl),
      drawH * 0.48 * Math.sqrt(1 - lvl),
      0,
      0,
      Math.PI * 2
    );
    ctx.stroke();
  });
  ctx.strokeStyle = "#f8fafc";
  ctx.lineWidth = 2.6;
  ctx.strokeRect(x0, y0, drawW, drawH);

  // Right Panel: Axial Longitudinal Cutaway Duct + Fast Axial Comet Streaks
  const rx0 = cw * 0.58;
  const rw = cw - rx0 - 18;
  const ry0 = 42, rh = ch - 70;
  ctx.fillStyle = "rgba(15, 23, 42, 0.78)";
  ctx.fillRect(rx0, ry0, rw, rh);
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(rx0, ry0);
  ctx.lineTo(rx0 + rw, ry0);
  ctx.moveTo(rx0, ry0 + rh);
  ctx.lineTo(rx0 + rw, ry0 + rh);
  ctx.stroke();

  // Animated axial flow ribbons scaled by exact centerline velocity W*(0, Y)
  const midC = sim.centerY;
  for (let lane = 0; lane < 17; lane++) {
    const fracY = (lane + 0.5) / 17;
    const Ynorm = -1 + 2 * fracY;
    const cIdx = clamp(Math.round(fracY * (midC.length - 1)), 0, midC.length - 1);
    const wNorm = midC[cIdx].w / Math.max(sim.w_center, 1e-4);
    const py = ry0 + fracY * rh;
    for (let k = 0; k < 3; k++) {
      const phase = ((k / 3 + animTimeSec * (0.08 + 0.85 * wNorm) + Math.sin(lane * 3.1) * 0.17) % 1 + 1) % 1;
      const hx = rx0 + phase * rw;
      const len = 8 + wNorm * 28;
      ctx.strokeStyle = speedRgba(wNorm, 0.88);
      ctx.lineWidth = 1.2 + wNorm * 1.4;
      ctx.beginPath();
      ctx.moveTo(Math.max(rx0, hx - len), py);
      ctx.lineTo(hx, py);
      ctx.stroke();
    }
    if (lane === 8 && Math.abs(Ynorm) < 0.2) {
      ctx.fillStyle = "rgba(255,255,255,0.65)";
      ctx.font = "600 10px ui-monospace, monospace";
      ctx.fillText("Core Peak W*", rx0 + 8, py - 6);
    }
  }

  // Overlaid glowing velocity plug profile curve inside longitudinal duct
  ctx.save();
  ctx.strokeStyle = "#fde047";
  ctx.shadowColor = "#fde047";
  ctx.shadowBlur = 7;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  midC.forEach((pt, idx) => {
    const py = ry0 + ((pt.s + 1) / 2) * rh;
    const px = rx0 + 14 + (pt.w / 0.5) * (rw * 0.65);
    if (idx === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();
  // Plane Poiseuille 0.5 dashed cap comparison
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = "rgba(148, 163, 184, 0.7)";
  ctx.shadowBlur = 0;
  ctx.beginPath();
  midC.forEach((pt, idx) => {
    const py = ry0 + ((pt.s + 1) / 2) * rh;
    const px = rx0 + 14 + (pt.pois / 0.5) * (rw * 0.65);
    if (idx === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();
  ctx.restore();

  drawSafePill(
    ctx,
    `α=${fmtNum(v.alpha, 2)} | W*(0,0)=${fmtNum(sim.w_center, 4)} (vs Poiseuille 0.500: -${fmtNum(sim.dev_pct, 1)}%)`,
    cw * 0.5,
    16,
    "#38bdf8"
  );

  if (hoverPx && hoverPx.x >= x0 && hoverPx.x <= x0 + drawW && hoverPx.y >= y0 && hoverPx.y <= y0 + drawH) {
    const X = ((hoverPx.x - x0) / drawW) * 2 - 1;
    const Y = 1 - ((hoverPx.y - y0) / drawH) * 2;
    const ix = clamp(Math.round(((X + 1) / 2) * (GN - 1)), 0, GN - 1);
    const iy = clamp(Math.round(((1 - Y) / 2) * (GN - 1)), 0, GN - 1);
    const wVal = sim.grid[iy * GN + ix];
    return `X=${fmtNum(X, 2)}, Y=${fmtNum(Y, 2)} | W*(X,Y)=${fmtNum(wVal, 4)} (${fmtNum((wVal / sim.w_center) * 100, 1)}% peak)`;
  }
  return null;
}

function renderHw7Pro(ctx, cw, ch, v, sim, animTimeSec, hoverPx, evalErfcFn, evalBoundedFn) {
  const tLive = Math.max(0.25, animTimeSec % Math.max(sim.tEnd, 1.5));
  const raw = { xMin: 0, xMax: 4.0, yMin: -0.09 * sim.yMaxMM, yMax: 1.12 * sim.yMaxMM };
  const tr = fitTransform(raw, cw, ch, { left: 54, right: 18, top: 28, bottom: 32 }, false);

  const deltaNow = 3.6428 * Math.sqrt(sim.nu * tLive) * 1000;
  const evalU = (yMM) =>
    v.bounded
      ? evalBoundedFn(yMM * 1e-3, tLive, v.U, sim.nu, sim.H)
      : v.U * evalErfcFn((yMM * 1e-3) / (2 * Math.sqrt(sim.nu * tLive)));

  // Gaussian Vorticity Diffusion glow heatmap rising from plate
  const sigma = Math.sqrt(2 * sim.nu * tLive) * 1000;
  const hKey = `hw7:${v.bounded}:${v.nu_e6}:${Math.floor(tLive * 5)}:${v.H_mm}`;
  drawHeatmapFromEval(
    ctx,
    tr,
    raw,
    hKey,
    (_wx, wy) => {
      if (wy < 0 || (v.bounded && wy > v.H_mm)) return 0;
      return Math.exp(-(wy * wy) / Math.max(2 * sigma * sigma, 1e-4));
    },
    0.85
  );
  drawDraftingFrame(ctx, tr, cw, ch, "Downstream Distance x (arb) & u / U", "Distance Above Plate y (mm)");

  // Dense Horizontal Shear Particle Ribbons
  const particles = stepRibbonPool(
    `hw7:${v.bounded}:${v.H_mm}:${v.U}:${Math.floor(tLive * 3)}`,
    { xMin: 0, xMax: 4.0, yMin: 0.02, yMax: v.bounded ? v.H_mm * 0.96 : sim.yMaxMM * 0.96 },
    240,
    (_wx, wy) => [Math.max(0.02, evalU(wy)), 0],
    Math.max(v.U, 0.5),
    animTimeSec
  );
  drawRibbons(ctx, particles, tr);

  // Pulsed Hydrogen-Bubble Electrolysis Wires released from x=0.35 curving into exact u(y) profile
  const pulseBase = Math.floor(animTimeSec / 1.4);
  for (let p = 0; p < 3; p++) {
    const age = animTimeSec - (pulseBase - p) * 1.4;
    if (age < 0 || age > 4.2) continue;
    const wirePts = [];
    const maxY = v.bounded ? v.H_mm : sim.yMaxMM;
    for (let k = 0; k <= 36; k++) {
      const yMM = (k / 36) * maxY;
      const uVal = evalU(yMM);
      wirePts.push({ x: 0.35 + (uVal / Math.max(v.U, 0.2)) * age * 0.85, y: yMM });
    }
    drawWorldCurve(ctx, wirePts, tr, p === 0 ? "#38bdf8" : "rgba(56, 189, 248, 0.45)", p === 0 ? 2.6 : 1.7, false, p === 0);
  }

  // Exact Couette dashed asymptote when Bounded Wall is active
  if (v.bounded) {
    drawWorldCurve(
      ctx,
      [{ x: 0.35 + 0.85 * 1.8, y: 0 }, { x: 0.35, y: v.H_mm }],
      tr,
      "rgba(255,255,255,0.45)",
      1.6,
      true
    );
    const pTopL = w2p(0, v.H_mm, tr), pTopR = w2p(4.0, v.H_mm, tr);
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(pTopL.x, tr.oy, pTopR.x - pTopL.x, Math.max(4, pTopL.y - tr.oy));
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(pTopL.x, pTopL.y);
    ctx.lineTo(pTopR.x, pTopR.y);
    ctx.stroke();
  } else if (deltaNow <= sim.yMaxMM) {
    drawWorldCurve(ctx, [{ x: 0, y: deltaNow }, { x: 4.0, y: deltaNow }], tr, "#34d399", 1.8, true);
  }

  // Animated Moving Bottom Plate at y = 0
  const pBL = w2p(0, 0, tr), pBR = w2p(4.0, 0, tr);
  ctx.fillStyle = "#334155";
  ctx.fillRect(pBL.x, pBL.y, pBR.x - pBL.x, tr.oy + tr.boxH - pBL.y);
  ctx.strokeStyle = "#fbbf24";
  ctx.lineWidth = 3.6;
  ctx.beginPath();
  ctx.moveTo(pBL.x, pBL.y);
  ctx.lineTo(pBR.x, pBR.y);
  ctx.stroke();

  const offPx = (animTimeSec * v.U * 95) % 24;
  ctx.fillStyle = "#fbbf24";
  for (let sx = pBL.x + offPx; sx < pBR.x - 4; sx += 24) {
    ctx.fillRect(sx, pBL.y + 4, 8, 5);
  }

  drawSafePill(
    ctx,
    v.bounded
      ? `Hydrogen-Bubble Rake | H=${fmtNum(v.H_mm, 1)}mm | νt/H²=${fmtNum((sim.nu * tLive) / (sim.H * sim.H), 3)}`
      : `Hydrogen-Bubble erfc(η) | t=${fmtNum(tLive, 1)}s | δ₉₉=${fmtNum(deltaNow, 2)}mm`,
    cw * 0.5,
    16,
    v.bounded ? "#fbbf24" : "#34d399"
  );

  if (hoverPx) {
    const wp = p2w(hoverPx.x, hoverPx.y, tr);
    drawHoverCrosshair(ctx, tr, [wp.x, wp.y]);
    if (wp.y >= 0 && wp.y <= (v.bounded ? v.H_mm : sim.yMaxMM)) {
      const uVal = evalU(wp.y);
      return `y=${fmtNum(wp.y, 2)}mm | u/U=${fmtNum(uVal / v.U, 3)} (${fmtNum(uVal, 3)} m/s)`;
    }
  }
  return null;
}

export function renderAssignmentProCanvas(ctx, cw, ch, hwId, v, sim, animTimeSec, hoverPx, helpers) {
  ctx.clearRect(0, 0, cw, ch);
  ctx.fillStyle = DARK_BG;
  ctx.fillRect(0, 0, cw, ch);

  if (hwId === "hw1") return renderHw1Pro(ctx, cw, ch, v, sim, animTimeSec, hoverPx);
  if (hwId === "hw2") return renderHw2Pro(ctx, cw, ch, v, sim, animTimeSec, hoverPx);
  if (hwId === "hw3" || (hwId === "hw4" && !sim.isGas)) {
    return renderTankDrainingPro(ctx, cw, ch, hwId, v, sim, animTimeSec, hoverPx);
  }
  if (hwId === "hw4" && sim.isGas) return renderHw4GasPro(ctx, cw, ch, v, sim, animTimeSec, hoverPx);
  if (hwId === "hw5") return renderHw5Pro(ctx, cw, ch, v, sim, animTimeSec, hoverPx);
  if (hwId === "hw6") return renderHw6Pro(ctx, cw, ch, v, sim, animTimeSec, hoverPx);
  if (hwId === "hw7") {
    return renderHw7Pro(ctx, cw, ch, v, sim, animTimeSec, hoverPx, helpers.erfc, helpers.evalBoundedCouette);
  }
  return null;
}
