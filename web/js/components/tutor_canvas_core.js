/**
 * Shared Dark-Studio Fluid Canvas Primitives for AI Tutor (Station 01) Visualizations.
 * Provides aspect-aware coordinate transforms, bilinear velocity sampling,
 * offscreen speed/vorticity heatmaps, calibrated drafting grids, and solid/guide overlays.
 */
import { fmtNum, niceTicks } from "../core/color_scales.js";

export const DARK_BG = "#080d1a";
export const GRID_INK = "rgba(148, 163, 184, 0.13)";
export const AXIS_INK = "rgba(148, 163, 184, 0.34)";
export const TICK_INK = "rgba(203, 213, 225, 0.72)";
export const LABEL_INK = "rgba(226, 232, 240, 0.85)";

const SEMANTIC_DARK_COLORS = {
  primary: "#38bdf8",
  amber: "#fbbf24",
  coral: "#fb7185",
  teal: "#2dd4bf",
  green: "#34d399",
  slate: "#94a3b8",
  "#475569": "#94a3b8",
  "#0072B2": "#38bdf8",
  "#D55E00": "#fb923c",
  "#B91C1C": "#fb7185",
  "#009E73": "#34d399",
};

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function currentTimeMs() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function prefersReducedMotion() {
  try {
    return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  } catch (_) {
    return false;
  }
}

export function resolveDarkColor(col, fallback = "#38bdf8") {
  if (!col) return fallback;
  return SEMANTIC_DARK_COLORS[col] || SEMANTIC_DARK_COLORS[String(col).toUpperCase()] || col;
}

export function tickDecimals(ticks) {
  if (!ticks || ticks.length < 2) return 1;
  const step = Math.abs(ticks[1] - ticks[0]);
  if (!Number.isFinite(step) || step <= 0) return 1;
  if (step >= 1) return Math.abs(step - Math.round(step)) < 1e-6 ? 0 : 1;
  return Math.min(3, Math.max(1, Math.ceil(-Math.log10(step) - 1e-9)));
}

export function computeFittedTransform(rawBounds, cw, ch, pad, aspectLock = true) {
  const [xmin, xmax, ymin, ymax] = rawBounds;
  const availW = Math.max(40, cw - pad.left - pad.right);
  const availH = Math.max(40, ch - pad.top - pad.bottom);
  const spanX = Math.max(1e-6, xmax - xmin);
  const spanY = Math.max(1e-6, ymax - ymin);

  let scaleX = availW / spanX;
  let scaleY = availH / spanY;
  let boxW = availW;
  let boxH = availH;
  let ox = pad.left;
  let oy = pad.top;

  if (aspectLock) {
    const uniform = Math.min(scaleX, scaleY);
    scaleX = uniform;
    scaleY = uniform;
    boxW = spanX * uniform;
    boxH = spanY * uniform;
    ox = pad.left + (availW - boxW) * 0.5;
    oy = pad.top + (availH - boxH) * 0.5;
  }

  return {
    xmin,
    xmax,
    ymin,
    ymax,
    ox,
    oy,
    boxW,
    boxH,
    scaleX,
    scaleY,
    scale: Math.min(scaleX, scaleY),
  };
}

export function worldToPx(wx, wy, tr) {
  return [
    tr.ox + (wx - tr.xmin) * tr.scaleX,
    tr.oy + (tr.ymax - wy) * tr.scaleY,
  ];
}

export function pxToWorld(px, py, tr) {
  return [
    tr.xmin + (px - tr.ox) / tr.scaleX,
    tr.ymax - (py - tr.oy) / tr.scaleY,
  ];
}

export function insideSceneObstacle(wx, wy, scene) {
  if (!scene) return false;
  if (scene.cylinderRadius) {
    const a = scene.cylinderRadius;
    if (wx * wx + wy * wy <= a * a * 1.03) return true;
  }
  if (Array.isArray(scene.solidRects)) {
    for (const [rx0, ry0, rw, rh] of scene.solidRects) {
      if (wx >= rx0 && wx <= rx0 + rw && wy >= ry0 && wy <= ry0 + rh) return true;
    }
  }
  const f = scene.field;
  if (f?.solid?.length && f.xs?.length > 1 && f.ys?.length > 1) {
    const nx = f.xs.length;
    const ny = f.ys.length;
    const fXmin = f.xs[0];
    const fXmax = f.xs[nx - 1];
    const fYmin = f.ys[0];
    const fYmax = f.ys[ny - 1];
    if (wx >= fXmin && wx <= fXmax && wy >= fYmin && wy <= fYmax) {
      const i = clamp(Math.round(((wx - fXmin) / Math.max(1e-9, fXmax - fXmin)) * (nx - 1)), 0, nx - 1);
      const j = clamp(Math.round(((wy - fYmin) / Math.max(1e-9, fYmax - fYmin)) * (ny - 1)), 0, ny - 1);
      if (f.solid[j]?.[i]) return true;
    }
  }
  return false;
}

export function createFieldSampler(field) {
  const xs = field?.xs || [];
  const ys = field?.ys || [];
  const U = field?.U || [];
  const V = field?.V || [];
  const W = field?.vorticity || [];
  const CP = field?.cp || [];
  const nx = xs.length;
  const ny = ys.length;
  const fBounds =
    field?.bounds ||
    (nx >= 2 && ny >= 2 ? [xs[0], xs[nx - 1], ys[0], ys[ny - 1]] : [-2.5, 6.5, -2.5, 4.0]);
  const gXmin = nx >= 2 ? xs[0] : fBounds[0];
  const gXmax = nx >= 2 ? xs[nx - 1] : fBounds[1];
  const gYmin = ny >= 2 ? ys[0] : fBounds[2];
  const gYmax = ny >= 2 ? ys[ny - 1] : fBounds[3];

  const speeds = [];
  const vorts = [];
  for (let r = 0; r < ny; r++) {
    for (let c = 0; c < nx; c++) {
      if (field?.solid?.[r]?.[c]) continue;
      const u = U[r]?.[c];
      const v = V[r]?.[c];
      if (u != null && v != null) {
        const spd = Math.hypot(u, v);
        if (Number.isFinite(spd) && spd < 1e4) speeds.push(spd);
      }
      const wv = W?.[r]?.[c];
      if (wv != null && Number.isFinite(wv) && Math.abs(wv) < 1e4) {
        vorts.push(Math.abs(wv));
      }
    }
  }
  speeds.sort((a, b) => a - b);
  vorts.sort((a, b) => a - b);

  const medSpeed = speeds.length ? speeds[Math.floor(speeds.length * 0.5)] : 1.0;
  const p95Speed = speeds.length ? speeds[Math.floor(speeds.length * 0.95)] : 1.0;
  const maxSpeed = speeds.length ? speeds[speeds.length - 1] : 1.0;
  const p95Vort = vorts.length ? vorts[Math.floor(vorts.length * 0.95)] : 1.0;
  const speedScale = Math.max(medSpeed, 0.05);
  const speedRef = Math.max(p95Speed, 0.1);
  const speedCeiling = Math.max(maxSpeed, 0.05);
  const vortRef = Math.max(p95Vort, 0.1);

  function sample(wx, wy) {
    if (nx < 2 || ny < 2) return null;
    if (wx < gXmin || wx > gXmax || wy < gYmin || wy > gYmax) return null;
    const tx = ((wx - gXmin) / Math.max(1e-9, gXmax - gXmin)) * (nx - 1);
    const ty = ((wy - gYmin) / Math.max(1e-9, gYmax - gYmin)) * (ny - 1);
    const ix = clamp(Math.floor(tx), 0, nx - 2);
    const iy = clamp(Math.floor(ty), 0, ny - 2);
    const fx = tx - ix;
    const fy = ty - iy;

    const blerp = (grid) => {
      if (!grid?.length) return null;
      const g00 = grid[iy]?.[ix];
      const g10 = grid[iy]?.[ix + 1];
      const g01 = grid[iy + 1]?.[ix];
      const g11 = grid[iy + 1]?.[ix + 1];
      if (g00 == null || g10 == null || g01 == null || g11 == null) return null;
      return (g00 * (1 - fx) + g10 * fx) * (1 - fy) + (g01 * (1 - fx) + g11 * fx) * fy;
    };

    const u = blerp(U);
    const v = blerp(V);
    if (u === null || v === null || !Number.isFinite(u) || !Number.isFinite(v)) return null;
    const spd = Math.hypot(u, v);
    if (!Number.isFinite(spd)) return null;
    return { u, v, speed: spd, vort: blerp(W), cp: blerp(CP) };
  }

  function speedNorm(spd, linear = false) {
    if (linear) return clamp(spd / speedCeiling, 0, 1);
    return clamp(Math.log1p(spd / speedScale) / Math.log1p(speedRef / speedScale), 0, 1);
  }

  return {
    bounds: fBounds,
    gridBounds: [gXmin, gXmax, gYmin, gYmax],
    sample,
    speedNorm,
    speedRef,
    speedScale,
    speedCeiling,
    vortRef,
  };
}

export function buildScalarHeatmapCanvas(sampler, mode = "speed", scene = null) {
  if (typeof document === "undefined" || !sampler) return null;
  const [gXmin, gXmax, gYmin, gYmax] = sampler.gridBounds;
  const off = document.createElement("canvas");
  off.width = 84;
  off.height = 60;
  const octx = off.getContext("2d");
  if (!octx) return null;
  const img = octx.createImageData(off.width, off.height);

  for (let py = 0; py < off.height; py++) {
    const wy = gYmax - (py / (off.height - 1)) * (gYmax - gYmin);
    for (let px = 0; px < off.width; px++) {
      const wx = gXmin + (px / (off.width - 1)) * (gXmax - gXmin);
      const s = insideSceneObstacle(wx, wy, scene) ? null : sampler.sample(wx, wy);
      const idx = (py * off.width + px) * 4;
      if (!s) {
        img.data[idx] = 8;
        img.data[idx + 1] = 13;
        img.data[idx + 2] = 26;
        img.data[idx + 3] = 255;
        continue;
      }

      if (mode === "vorticity" && s.vort !== null) {
        const w = clamp(s.vort / sampler.vortRef, -1, 1);
        const a = Math.pow(Math.abs(w), 0.72);
        if (w >= 0) {
          // Midnight navy -> warm crimson/coral CCW wake
          img.data[idx] = Math.round(8 + a * 126);
          img.data[idx + 1] = Math.round(13 + a * 26);
          img.data[idx + 2] = Math.round(26 + a * 42);
        } else {
          // Midnight navy -> bright cobalt/cyan CW wake
          img.data[idx] = Math.round(8 + a * 18);
          img.data[idx + 1] = Math.round(13 + a * 82);
          img.data[idx + 2] = Math.round(26 + a * 155);
        }
        img.data[idx + 3] = 255;
        continue;
      }

      const t = sampler.speedNorm(s.speed, mode === "linearSpeed");
      // Midnight navy (#080d1a) -> deep cobalt (#0f294a) -> electric teal (#0e7490)
      img.data[idx] = Math.round(8 + t * 14);
      img.data[idx + 1] = Math.round(13 + t * t * 92 + t * 22);
      img.data[idx + 2] = Math.round(26 + t * 124);
      img.data[idx + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return off;
}

export function speedRgb(t) {
  if (t < 0.55) {
    const u = t / 0.55;
    return [
      Math.round(37 + u * 19),
      Math.round(99 + u * 90),
      Math.round(235 + u * 13),
    ];
  }
  const u = (t - 0.55) / 0.45;
  return [
    Math.round(56 + u * 184),
    Math.round(189 + u * 60),
    Math.round(248 + u * 7),
  ];
}

export function drawDraftingFrame(ctx, tr, cw, ch, xLabel, yLabel) {
  const { xmin, xmax, ymin, ymax, ox, oy, boxW, boxH } = tr;
  const xTicks = niceTicks(xmin, xmax, 5);
  const yTicks = niceTicks(ymin, ymax, 5);
  const xDec = tickDecimals(xTicks);
  const yDec = tickDecimals(yTicks);

  ctx.save();
  ctx.beginPath();
  ctx.rect(ox, oy, boxW, boxH);
  ctx.clip();

  ctx.strokeStyle = GRID_INK;
  ctx.lineWidth = 1;
  for (const wx of xTicks) {
    const [px] = worldToPx(wx, ymin, tr);
    ctx.beginPath();
    ctx.moveTo(px, oy);
    ctx.lineTo(px, oy + boxH);
    ctx.stroke();
  }
  for (const wy of yTicks) {
    const [, py] = worldToPx(xmin, wy, tr);
    ctx.beginPath();
    ctx.moveTo(ox, py);
    ctx.lineTo(ox + boxW, py);
    ctx.stroke();
  }

  ctx.strokeStyle = AXIS_INK;
  ctx.lineWidth = 1.15;
  if (xmin < 0 && xmax > 0) {
    const [zx] = worldToPx(0, ymin, tr);
    ctx.beginPath();
    ctx.moveTo(zx, oy);
    ctx.lineTo(zx, oy + boxH);
    ctx.stroke();
  }
  if (ymin < 0 && ymax > 0) {
    const [, zy] = worldToPx(xmin, 0, tr);
    ctx.beginPath();
    ctx.moveTo(ox, zy);
    ctx.lineTo(ox + boxW, zy);
    ctx.stroke();
  }
  ctx.restore();

  ctx.strokeStyle = "rgba(148, 163, 184, 0.28)";
  ctx.lineWidth = 1;
  ctx.strokeRect(ox, oy, boxW, boxH);

  ctx.fillStyle = TICK_INK;
  ctx.font = '500 11px "IBM Plex Mono", monospace';
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (const wx of xTicks) {
    const [px] = worldToPx(wx, ymin, tr);
    if (px < ox + 8 || px > ox + boxW - 8) continue;
    ctx.fillText(fmtNum(wx, xDec), px, oy + boxH + 5);
  }

  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (const wy of yTicks) {
    const [, py] = worldToPx(xmin, wy, tr);
    if (py < oy + 6 || py > oy + boxH - 6) continue;
    ctx.fillText(fmtNum(wy, yDec), ox - 6, py);
  }

  ctx.fillStyle = LABEL_INK;
  ctx.font = '600 11px "IBM Plex Sans", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  if (xLabel) ctx.fillText(xLabel, ox + boxW * 0.5, ch - 4);

  if (yLabel) {
    ctx.save();
    ctx.translate(13, oy + boxH * 0.5);
    ctx.rotate(-Math.PI * 0.5);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();
  }
}

export function drawArrowHead(ctx, x0, y0, x1, y1, color, width = 1.9, head = 6.5) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  if (Math.hypot(dx, dy) < 2) return;
  const ang = Math.atan2(dy, dx);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x1 - head * Math.cos(ang - 0.5), y1 - head * Math.sin(ang - 0.5));
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - head * Math.cos(ang + 0.5), y1 - head * Math.sin(ang + 0.5));
  ctx.stroke();
  ctx.restore();
}

export function drawPill(ctx, cx, cy, text, accentColor = "#e2e8f0") {
  ctx.save();
  ctx.font = '600 11px "IBM Plex Mono", monospace';
  const tw = ctx.measureText(text).width;
  const bw = tw + 12;
  const bh = 18;
  const bx = cx - bw * 0.5;
  const by = cy - bh * 0.5;
  ctx.fillStyle = "rgba(8, 13, 26, 0.88)";
  ctx.strokeStyle = "rgba(148, 163, 184, 0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(bx, by, bw, bh, 4);
  else ctx.rect(bx, by, bw, bh);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = accentColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, cx, cy + 0.5);
  ctx.restore();
}

/**
 * Draw schematic elements (plug bands, liquid body polygon, solid walls/cylinders,
 * vortex core ring, dashed reference guides, eddies, horizontal markers, and labels)
 * styled with crisp high-contrast inks for dark midnight canvases.
 */
export function drawSceneOverlaysDark(ctx, tr, scene, opts = {}) {
  if (!scene) return;
  const { ox, boxW, scaleX, scaleY } = tr;

  const drawCurve = (pts, color, width, dash = []) => {
    if (!pts || pts.length < 2) return;
    ctx.save();
    ctx.setLineDash(dash);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    pts.forEach(([wx, wy], i) => {
      const [px, py] = worldToPx(wx, wy, tr);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.restore();
  };

  if (scene.hBands) {
    for (const hb of scene.hBands) {
      const [, py1] = worldToPx(tr.xmin, hb.yMax, tr);
      const [, py0] = worldToPx(tr.xmin, hb.yMin, tr);
      ctx.save();
      ctx.fillStyle = "rgba(251, 191, 36, 0.14)";
      ctx.fillRect(ox, py1, boxW, Math.max(2, py0 - py1));
      ctx.restore();
    }
  }

  if (scene.fluidPoly?.length >= 3 && !opts.skipFluidPoly) {
    ctx.save();
    ctx.fillStyle = opts.fluidFill || "rgba(14, 116, 144, 0.16)";
    ctx.strokeStyle = resolveDarkColor(scene.fluidStroke, "#38bdf8");
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    scene.fluidPoly.forEach(([wx, wy], i) => {
      const [px, py] = worldToPx(wx, wy, tr);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  if (scene.vortexCoreRadius) {
    const r = scene.vortexCoreRadius;
    const [cx, cy] = worldToPx(0, 0, tr);
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = "#fbbf24";
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * scaleX, r * scaleY, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  if (scene.cylinderRadius) {
    const a = scene.cylinderRadius;
    const [cx, cy] = worldToPx(0, 0, tr);
    ctx.save();
    ctx.fillStyle = "#1e293b";
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 1.9;
    ctx.beginPath();
    ctx.ellipse(cx, cy, a * scaleX, a * scaleY, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  if (scene.solidRects?.length) {
    ctx.save();
    ctx.fillStyle = "#1e293b";
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 1.25;
    for (const [rx0, ry0, rw, rh] of scene.solidRects) {
      const [px0, py1] = worldToPx(rx0, ry0, tr);
      const [px1, py0] = worldToPx(rx0 + rw, ry0 + rh, tr);
      ctx.fillRect(px0, py0, Math.max(2, px1 - px0), Math.max(2, py1 - py0));
      ctx.strokeRect(px0, py0, Math.max(2, px1 - px0), Math.max(2, py1 - py0));
    }
    ctx.restore();
  } else if (scene.field?.solid?.length && scene.field?.xs?.length && scene.field?.ys?.length) {
    const f = scene.field;
    ctx.save();
    ctx.fillStyle = "#1e293b";
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 1.0;
    for (let j = 0; j < f.ys.length - 1; j++) {
      for (let i = 0; i < f.xs.length - 1; i++) {
        if (!f.solid[j]?.[i]) continue;
        const [px0, py1] = worldToPx(f.xs[i], f.ys[j], tr);
        const [px1, py0] = worldToPx(f.xs[i + 1], f.ys[j + 1], tr);
        ctx.fillRect(px0, py0, Math.max(2, px1 - px0), Math.max(2, py1 - py0));
        ctx.strokeRect(px0, py0, Math.max(2, px1 - px0), Math.max(2, py1 - py0));
      }
    }
    ctx.restore();
  }

  if (scene.dashedGuides?.length) {
    for (const g of scene.dashedGuides) {
      drawCurve(g.pts, resolveDarkColor(g.color, "#94a3b8"), g.width || 1.5, g.dash || [5, 4]);
    }
  }
  if (scene.naiveLine?.length >= 2) {
    drawCurve(scene.naiveLine, "#fb7185", 2.0, [6, 4]);
  }
  if (scene.spiralCurve?.length >= 2) {
    drawCurve(scene.spiralCurve, resolveDarkColor(scene.spiralColor, "#fb923c"), 2.2, []);
  }

  if (scene.hLines) {
    for (const hl of scene.hLines) {
      const [, py] = worldToPx(tr.xmin, hl.y, tr);
      const col = resolveDarkColor(hl.color, "#fbbf24");
      ctx.save();
      if (hl.dashed) ctx.setLineDash([5, 4]);
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(ox, py);
      ctx.lineTo(ox + boxW, py);
      ctx.stroke();
      ctx.restore();
      if (hl.label && !opts.skipLabels) {
        drawPill(ctx, ox + Math.min(boxW * 0.42, 130), Math.max(tr.oy + 12, py - 12), hl.label, col);
      }
    }
  }

  if (scene.eddies?.length) {
    for (const ed of scene.eddies) {
      const [cx, cy] = worldToPx(ed.cx, ed.cy, tr);
      const rx = ed.rx * scaleX;
      const ry = ed.ry * scaleY;
      const col = resolveDarkColor(ed.color, "#fb7185");
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
      drawArrowHead(ctx, tx - dx * 5, ty - dy * 5, tx, ty, col, 1.7, 5);
      ctx.restore();
    }
  }

  if (scene.stagnationPoints?.length) {
    for (const [sx, sy] of scene.stagnationPoints) {
      const [px, py] = worldToPx(sx, sy, tr);
      ctx.fillStyle = "#fb7185";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px, py, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  if (scene.vectorsOverlay?.length && !opts.skipVectors) {
    for (const vo of scene.vectorsOverlay) {
      const [x0, y0] = worldToPx(vo.x0, vo.y0, tr);
      const [x1, y1] = worldToPx(vo.x0 + vo.dx, vo.y0 + vo.dy, tr);
      const col = resolveDarkColor(vo.color, "#fbbf24");
      drawArrowHead(ctx, x0, y0, x1, y1, col, 2.3, 6.5);
      if (vo.label) {
        drawPill(ctx, (x0 + x1) * 0.5, y1 - 14, vo.label, col);
      }
    }
  }

  if (scene.annotations?.length && !opts.skipAnnotations) {
    for (const ann of scene.annotations) {
      const [px, py] = worldToPx(ann.x, ann.y, tr);
      drawPill(ctx, clamp(px, ox + 55, ox + boxW - 55), clamp(py, tr.oy + 12, tr.oy + tr.boxH - 12), ann.text, resolveDarkColor(ann.color, "#e2e8f0"));
    }
  }
}

export function drawHoverCrosshair(ctx, tr, hoverWorld) {
  if (!hoverWorld) return;
  const [hx, hy] = worldToPx(hoverWorld[0], hoverWorld[1], tr);
  ctx.save();
  ctx.strokeStyle = "rgba(56, 189, 248, 0.45)";
  ctx.setLineDash([3, 3]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(hx, tr.oy);
  ctx.lineTo(hx, tr.oy + tr.boxH);
  ctx.moveTo(tr.ox, hy);
  ctx.lineTo(tr.ox + tr.boxW, hy);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

export function samplePolyline(pts, frac) {
  if (!Array.isArray(pts) || pts.length === 0) return null;
  if (pts.length === 1) return [pts[0][0], pts[0][1]];
  const clamped = clamp(frac, 0, 1);
  const fIdx = clamped * (pts.length - 1);
  const idx = clamp(Math.floor(fIdx), 0, pts.length - 2);
  const rem = fIdx - idx;
  const p0 = pts[idx];
  const p1 = pts[idx + 1];
  return [p0[0] + (p1[0] - p0[0]) * rem, p0[1] + (p1[1] - p0[1]) * rem];
}

export function getPolylinePrefix(pts, frac) {
  if (!Array.isArray(pts) || pts.length < 2) return pts || [];
  const clamped = clamp(frac, 0, 1);
  const fIdx = clamped * (pts.length - 1);
  const lastFull = Math.floor(fIdx);
  const out = pts.slice(0, lastFull + 1);
  const tip = samplePolyline(pts, clamped);
  if (tip && (out.length === 0 || out[out.length - 1][0] !== tip[0] || out[out.length - 1][1] !== tip[1])) {
    out.push(tip);
  }
  return out;
}
