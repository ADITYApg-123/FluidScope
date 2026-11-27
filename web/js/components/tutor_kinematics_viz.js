/**
 * AI Tutor (Station 01) 3-Panel Kinematics Visualization.
 *
 * Layout when Station 01 resolves kinematics_equation:
 *   Top-Left  (Option A): Dense Eulerian Particle Field (~420 RK2 comet tracers + speed heatmap)
 *   Top-Right (Option D): Lagrangian Parcel & Dye Tracker (exact pathline + streakline dye + morphing square)
 *   Bottom    (Shifted) : Existing #secondaryCanvasBay Trajectory Comparison x(y) & Stokes Check
 *
 * Scoped strictly to the AI Tutor view (Station 01). Unmounting restores #canvasDeck
 * for non-kinematics prompts and Labs 2A-4D without side effects.
 */
import { fmtNum, niceTicks } from "../core/color_scales.js";
import { computeKinematicsFraming } from "../stations/mappers_kinematics.js";

const DARK_BG = "#080d1a";
const GRID_INK = "rgba(148, 163, 184, 0.13)";
const AXIS_INK = "rgba(148, 163, 184, 0.34)";
const TICK_INK = "rgba(203, 213, 225, 0.72)";
const LABEL_INK = "rgba(226, 232, 240, 0.85)";

let activeSession = null;
let flowPausedByTutor = false;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function prefersReducedMotion() {
  try {
    return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  } catch (_) {
    return false;
  }
}

function tickDecimals(ticks) {
  if (!ticks || ticks.length < 2) return 1;
  const step = Math.abs(ticks[1] - ticks[0]);
  if (!Number.isFinite(step) || step <= 0) return 1;
  if (step >= 1) return Math.abs(step - Math.round(step)) < 1e-6 ? 0 : 1;
  return Math.min(3, Math.max(1, Math.ceil(-Math.log10(step) - 1e-9)));
}

function computeFittedTransform(rawBounds, cw, ch, pad) {
  const [xmin, xmax, ymin, ymax] = rawBounds;
  const availW = Math.max(40, cw - pad.left - pad.right);
  const availH = Math.max(40, ch - pad.top - pad.bottom);
  const spanX = Math.max(1e-6, xmax - xmin);
  const spanY = Math.max(1e-6, ymax - ymin);

  const scale = Math.min(availW / spanX, availH / spanY);
  const boxW = spanX * scale;
  const boxH = spanY * scale;

  return {
    xmin,
    xmax,
    ymin,
    ymax,
    ox: pad.left + (availW - boxW) * 0.5,
    oy: pad.top + (availH - boxH) * 0.5,
    boxW,
    boxH,
    scale,
  };
}

function currentTimeMs() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function worldToPx(wx, wy, tr) {
  return [
    tr.ox + ((wx - tr.xmin) / (tr.xmax - tr.xmin)) * tr.boxW,
    tr.oy + (1 - (wy - tr.ymin) / (tr.ymax - tr.ymin)) * tr.boxH,
  ];
}

function pxToWorld(px, py, tr) {
  return [
    tr.xmin + ((px - tr.ox) / tr.boxW) * (tr.xmax - tr.xmin),
    tr.ymin + (1 - (py - tr.oy) / tr.boxH) * (tr.ymax - tr.ymin),
  ];
}

function createFieldSampler(field) {
  const xs = field?.xs || [];
  const ys = field?.ys || [];
  const U = field?.U || [];
  const V = field?.V || [];
  const W = field?.vorticity || [];
  const bounds = field?.bounds || [-2.5, 6.5, -2.5, 4.0];
  const nx = xs.length;
  const ny = ys.length;
  const [xmin, xmax, ymin, ymax] = bounds;

  const speeds = [];
  for (let r = 0; r < ny; r++) {
    for (let c = 0; c < nx; c++) {
      const u = U[r]?.[c];
      const v = V[r]?.[c];
      if (u == null || v == null) continue;
      const spd = Math.hypot(u, v);
      if (Number.isFinite(spd) && spd < 1e4) speeds.push(spd);
    }
  }
  speeds.sort((a, b) => a - b);
  const medSpeed = speeds.length ? speeds[Math.floor(speeds.length * 0.5)] : 1.0;
  const p95Speed = speeds.length ? speeds[Math.floor(speeds.length * 0.95)] : 1.0;
  const speedScale = Math.max(medSpeed, 0.05);
  const speedRef = Math.max(p95Speed, 0.1);

  function sample(wx, wy) {
    if (nx < 2 || ny < 2) return null;
    if (wx < xmin || wx > xmax || wy < ymin || wy > ymax) return null;
    const tx = ((wx - xs[0]) / Math.max(1e-9, xs[nx - 1] - xs[0])) * (nx - 1);
    const ty = ((wy - ys[0]) / Math.max(1e-9, ys[ny - 1] - ys[0])) * (ny - 1);
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
    return { u, v, speed: spd, vort: blerp(W) };
  }

  function speedNorm(spd) {
    return clamp(Math.log1p(spd / speedScale) / Math.log1p(speedRef / speedScale), 0, 1);
  }

  return { bounds, sample, speedNorm, speedRef, speedScale };
}

function buildSpeedHeatmapCanvas(sampler, bounds) {
  if (typeof document === "undefined") return null;
  const off = document.createElement("canvas");
  off.width = 72;
  off.height = 56;
  const octx = off.getContext("2d");
  if (!octx) return null;
  const img = octx.createImageData(off.width, off.height);
  const [xmin, xmax, ymin, ymax] = bounds;

  for (let py = 0; py < off.height; py++) {
    const wy = ymax - (py / (off.height - 1)) * (ymax - ymin);
    for (let px = 0; px < off.width; px++) {
      const wx = xmin + (px / (off.width - 1)) * (xmax - xmin);
      const s = sampler.sample(wx, wy);
      const idx = (py * off.width + px) * 4;
      if (!s) {
        img.data[idx] = 8;
        img.data[idx + 1] = 13;
        img.data[idx + 2] = 26;
        img.data[idx + 3] = 255;
        continue;
      }
      const t = sampler.speedNorm(s.speed);
      // Midnight navy (#080d1a) -> deep cobalt (#0f294a) -> electric teal (#0e7490)
      const r = Math.round(8 + t * 14);
      const g = Math.round(13 + t * t * 92 + t * 22);
      const b = Math.round(26 + t * 124);
      img.data[idx] = r;
      img.data[idx + 1] = g;
      img.data[idx + 2] = b;
      img.data[idx + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return off;
}

function speedRgb(t) {
  // 0.0: sapphire (37, 99, 235) -> 0.55: cyan (56, 189, 248) -> 1.0: crisp ice white (240, 249, 255)
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

function drawDraftingFrame(ctx, tr, cw, ch, xLabel, yLabel) {
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

  // Box border & ticks
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
  ctx.fillText(xLabel, ox + boxW * 0.5, ch - 4);

  ctx.save();
  ctx.translate(13, oy + boxH * 0.5);
  ctx.rotate(-Math.PI * 0.5);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(yLabel, 0, 0);
  ctx.restore();
}

function drawArrowHead(ctx, x0, y0, x1, y1, color, width = 1.9, head = 6.5) {
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

function samplePolyline(pts, frac) {
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

function getPolylinePrefix(pts, frac) {
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

function createPanelA(d, canvas, hudEl, pauseBtn, sampler, heatmapCanvas) {
  const ctx = canvas.getContext("2d");
  const bounds = sampler.bounds;
  const [xmin, xmax, ymin, ymax] = bounds;
  const minSpan = Math.min(xmax - xmin, ymax - ymin);
  const pad = { left: 46, right: 14, top: 14, bottom: 32 };
  const probe = d.point_probe || {};
  const hasSeed = Number.isFinite(probe.x) && Number.isFinite(probe.y);

  const N_PARTICLES = 420;
  const TRAIL_LEN = 16;
  const particles = [];

  const spawnParticle = (randomLife = false) => {
    const x = xmin + Math.random() * (xmax - xmin);
    const y = ymin + Math.random() * (ymax - ymin);
    return {
      x,
      y,
      trail: [],
      life: randomLife ? Math.floor(Math.random() * 80) : 0,
      maxLife: 70 + Math.floor(Math.random() * 90),
    };
  };

  for (let i = 0; i < N_PARTICLES; i++) {
    particles.push(spawnParticle(true));
  }

  let paused = prefersReducedMotion();
  let hoverWorld = null;
  let rafId = null;

  const syncPauseBtn = () => {
    if (!pauseBtn) return;
    pauseBtn.textContent = paused ? "Play" : "Pause";
    pauseBtn.setAttribute("aria-pressed", String(paused));
  };
  syncPauseBtn();

  const updateHud = () => {
    if (!hudEl) return;
    if (!hoverWorld) {
      hudEl.textContent = "Hover over the Eulerian particle field to inspect live velocity and vorticity";
      return;
    }
    const [wx, wy] = hoverWorld;
    const s = sampler.sample(wx, wy);
    if (!s) {
      hudEl.textContent = `X: ${fmtNum(wx, 2)} | Y: ${fmtNum(wy, 2)} | Outside / singular velocity region`;
      return;
    }
    const wTxt = s.vort !== null ? ` | Ωz: ${fmtNum(s.vort, 2)} s⁻¹` : "";
    hudEl.textContent = `X: ${fmtNum(wx, 2)} | Y: ${fmtNum(wy, 2)} | u: ${fmtNum(s.u, 2)} | v: ${fmtNum(s.v, 2)} | |V|: ${fmtNum(s.speed, 2)}${wTxt}`;
  };
  updateHud();

  const stepParticles = () => {
    for (const p of particles) {
      const s1 = sampler.sample(p.x, p.y);
      if (!s1 || s1.speed < 1e-5 || s1.speed > 1e4 || p.life >= p.maxLife) {
        Object.assign(p, spawnParticle(false));
        continue;
      }

      const norm1 = sampler.speedNorm(s1.speed);
      const dt = (0.0045 + 0.0125 * norm1) * minSpan;
      const vx1 = s1.u / s1.speed;
      const vy1 = s1.v / s1.speed;

      // RK2 midpoint preserves closed circular orbits in vortices
      const midX = p.x + 0.5 * vx1 * dt;
      const midY = p.y + 0.5 * vy1 * dt;
      const s2 = sampler.sample(midX, midY);
      const use = s2 && s2.speed >= 1e-5 && s2.speed < 1e4 ? s2 : s1;

      p.trail.push({ x: p.x, y: p.y, norm: norm1 });
      if (p.trail.length > TRAIL_LEN) p.trail.shift();

      p.x += (use.u / use.speed) * dt;
      p.y += (use.v / use.speed) * dt;
      p.life += 1;

      if (p.x < xmin || p.x > xmax || p.y < ymin || p.y > ymax) {
        Object.assign(p, spawnParticle(false));
      }
    }
  };

  // Pre-warm trails briefly so first paint (including reduced-motion) looks populated
  for (let w = 0; w < 8; w++) stepParticles();

  const render = () => {
    if (!ctx || !canvas) return;
    const dpr = (typeof window !== "undefined" ? window.devicePixelRatio : 1) || 1;
    const cw = canvas.clientWidth || canvas.width || 380;
    const ch = canvas.clientHeight || canvas.height || 320;
    if (cw === 0 || ch === 0) return;

    if (canvas.width !== Math.floor(cw * dpr) || canvas.height !== Math.floor(ch * dpr)) {
      canvas.width = Math.floor(cw * dpr);
      canvas.height = Math.floor(ch * dpr);
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = DARK_BG;
    ctx.fillRect(0, 0, cw, ch);

    const tr = computeFittedTransform(bounds, cw, ch, pad);

    if (!paused) stepParticles();

    // Speed magnitude heatmap backdrop clipped inside plot box
    if (heatmapCanvas) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(tr.ox, tr.oy, tr.boxW, tr.boxH);
      ctx.clip();
      const [bx0, by1] = worldToPx(xmin, ymin, tr);
      const [bx1, by0] = worldToPx(xmax, ymax, tr);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(heatmapCanvas, bx0, by0, bx1 - bx0, by1 - by0);
      ctx.restore();
    }

    drawDraftingFrame(ctx, tr, cw, ch, "x (m)", "y (m)");

    // Particles clipped to domain bounds
    ctx.save();
    ctx.beginPath();
    ctx.rect(tr.ox, tr.oy, tr.boxW, tr.boxH);
    ctx.clip();

    ctx.lineCap = "round";
    for (const p of particles) {
      const n = p.trail.length;
      if (n < 2) continue;
      const lifeEnv = Math.sin((p.life / p.maxLife) * Math.PI);
      if (lifeEnv < 0.04) continue;

      for (let i = 1; i < n; i++) {
        const a0 = p.trail[i - 1];
        const a1 = p.trail[i];
        const frac = i / (n - 1);
        const alpha = frac * frac * lifeEnv * 0.85;
        const [r, g, b] = speedRgb(a1.norm);
        const [px0, py0] = worldToPx(a0.x, a0.y, tr);
        const [px1, py1] = worldToPx(a1.x, a1.y, tr);
        ctx.strokeStyle = `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
        ctx.lineWidth = 0.8 + frac * 1.1;
        ctx.beginPath();
        ctx.moveTo(px0, py0);
        ctx.lineTo(px1, py1);
        ctx.stroke();
      }

      const head = p.trail[n - 1];
      const [hx, hy] = worldToPx(p.x, p.y, tr);
      const [r, g, b] = speedRgb(head.norm);
      ctx.fillStyle = `rgba(${r},${g},${b},${(0.9 * lifeEnv).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(hx, hy, 1.3 + head.norm * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Subtle reticle locating the seed (x0, y0) inside global Eulerian flow
    if (hasSeed) {
      const [sx, sy] = worldToPx(probe.x, probe.y, tr);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.72)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(sx, sy, 5.5, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Hover crosshair
    if (hoverWorld) {
      const [hx, hy] = worldToPx(hoverWorld[0], hoverWorld[1], tr);
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
    }
    ctx.restore();
  };

  const loop = () => {
    render();
    if (!paused && typeof requestAnimationFrame === "function") {
      rafId = requestAnimationFrame(loop);
    } else {
      rafId = null;
    }
  };

  const startLoop = () => {
    if (paused) {
      render();
      return;
    }
    if (rafId === null && typeof requestAnimationFrame === "function") {
      rafId = requestAnimationFrame(loop);
    }
  };

  const onPauseClick = () => {
    paused = !paused;
    syncPauseBtn();
    if (paused) {
      if (rafId !== null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      render();
    } else {
      startLoop();
    }
  };
  pauseBtn?.addEventListener("click", onPauseClick);

  const onPointerMove = (e) => {
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const cw = canvas.clientWidth || canvas.width || 380;
    const ch = canvas.clientHeight || canvas.height || 320;
    const tr = computeFittedTransform(bounds, cw, ch, pad);
    if (px >= tr.ox && px <= tr.ox + tr.boxW && py >= tr.oy && py <= tr.oy + tr.boxH) {
      hoverWorld = pxToWorld(px, py, tr);
    } else {
      hoverWorld = null;
    }
    updateHud();
    if (paused) render();
  };

  const onPointerLeave = () => {
    hoverWorld = null;
    updateHud();
    if (paused) render();
  };

  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerleave", onPointerLeave);

  const ro =
    typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => render())
      : null;
  ro?.observe(canvas);

  startLoop();

  return () => {
    if (rafId !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(rafId);
    }
    pauseBtn?.removeEventListener("click", onPauseClick);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerleave", onPointerLeave);
    ro?.disconnect();
  };
}

function buildLiveStreakline(pathlinePts, streakFinalPts, tau, curvesCoincide) {
  if (!Array.isArray(pathlinePts) || pathlinePts.length < 2) return [];
  if (curvesCoincide || !Array.isArray(streakFinalPts) || streakFinalPts.length < 2) {
    return getPolylinePrefix(pathlinePts, tau);
  }
  // Backend streaklinePts[0] is oldest particle (tau=t0 -> tip == pathline[-1]);
  // streaklinePts[-1] is newest dye particle at injector (x0, y0).
  const root = pathlinePts[0];
  const currentHead = samplePolyline(pathlinePts, tau) || root;
  const finalTip = streakFinalPts[0];
  const nSamples = 32;
  const out = [];

  for (let i = 0; i <= nSamples; i++) {
    const s = i / nSamples; // 0 = injector (x0, y0), 1 = oldest dye head (currentHead)
    const pOnPath = samplePolyline(pathlinePts, s * tau) || root;
    // Sample reversed streakline so s=0 maps to last index (root) and s=1 maps to index 0 (tip)
    const sRev = 1 - s;
    const pOnStreakFinal = samplePolyline(streakFinalPts, sRev) || currentHead;

    // Deviation of final streakline from chord [root -> finalTip]
    const chordFinalX = finalTip[0] - root[0];
    const chordFinalY = finalTip[1] - root[1];
    const devStreakX = pOnStreakFinal[0] - (root[0] + s * chordFinalX);
    const devStreakY = pOnStreakFinal[1] - (root[1] + s * chordFinalY);

    // Deviation of pathline prefix from current chord [root -> currentHead]
    const chordCurrX = currentHead[0] - root[0];
    const chordCurrY = currentHead[1] - root[1];
    const devPathX = pOnPath[0] - (root[0] + s * chordCurrX);
    const devPathY = pOnPath[1] - (root[1] + s * chordCurrY);

    const mix = clamp(tau, 0, 1);
    const x = root[0] + s * chordCurrX + (1 - mix) * devPathX + mix * devStreakX;
    const y = root[1] + s * chordCurrY + (1 - mix) * devPathY + mix * devStreakY;
    out.push([x, y]);
  }
  return out;
}

function createPanelD(d, canvas, hudEl, cardEl, pauseBtn, replayBtn, sampler) {
  const ctx = canvas.getContext("2d");
  const { viewBounds } = computeKinematicsFraming(d);
  const pad = { left: 46, right: 14, top: 14, bottom: 32 };
  const curves = d.curves || {};
  const pathPts = curves.pathline || [];
  const streamPts = curves.streamline || [];
  const streakFinal = curves.streakline || [];
  const el0 = curves.initial_element || [];
  const el1 = curves.deformed_element || [];
  const stokes = d.stokes_check || {};
  const probe = d.point_probe || {};
  const curvesCoincide = Boolean(d.classification?.curves_coincide);

  const tEval = Number.isFinite(probe.t) ? probe.t : 2.0;
  const seedX = Number.isFinite(probe.x) ? probe.x : pathPts[0]?.[0] ?? 1.0;
  const seedY = Number.isFinite(probe.y) ? probe.y : pathPts[0]?.[1] ?? 0.0;

  const CYCLE_PLAY_MS = 4000;
  const CYCLE_HOLD_MS = 1200;
  const CYCLE_TOTAL_MS = CYCLE_PLAY_MS + CYCLE_HOLD_MS;

  let paused = prefersReducedMotion();
  let elapsedMs = paused ? CYCLE_PLAY_MS : 0;
  let lastFrameMs = null;
  let hoverWorld = null;
  let rafId = null;

  const syncPauseBtn = () => {
    if (!pauseBtn) return;
    pauseBtn.textContent = paused ? "Play" : "Pause";
    pauseBtn.setAttribute("aria-pressed", String(paused));
  };
  syncPauseBtn();

  const updateHud = () => {
    if (!hudEl) return;
    if (!hoverWorld) {
      hudEl.textContent = curvesCoincide
        ? "Steady flow: parcel Pathline and dye Streakline coincide along the Streamline"
        : "Unsteady flow: watch Pathline parcel and Streakline dye peel apart from the Streamline";
      return;
    }
    const [wx, wy] = hoverWorld;
    const s = sampler.sample(wx, wy);
    if (!s) {
      hudEl.textContent = `X: ${fmtNum(wx, 2)} | Y: ${fmtNum(wy, 2)} | Outside / singular velocity region`;
      return;
    }
    hudEl.textContent = `X: ${fmtNum(wx, 2)} | Y: ${fmtNum(wy, 2)} | u: ${fmtNum(s.u, 2)} | v: ${fmtNum(s.v, 2)} | |V|: ${fmtNum(s.speed, 2)}`;
  };
  updateHud();

  const drawCurve = (tr, pts, color, width, dash = []) => {
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

  const render = (nowMs) => {
    if (!ctx || !canvas) return;
    const dpr = (typeof window !== "undefined" ? window.devicePixelRatio : 1) || 1;
    const cw = canvas.clientWidth || canvas.width || 380;
    const ch = canvas.clientHeight || canvas.height || 320;
    if (cw === 0 || ch === 0) return;

    if (canvas.width !== Math.floor(cw * dpr) || canvas.height !== Math.floor(ch * dpr)) {
      canvas.width = Math.floor(cw * dpr);
      canvas.height = Math.floor(ch * dpr);
    }

    if (!paused && Number.isFinite(nowMs)) {
      if (lastFrameMs !== null) {
        elapsedMs = (elapsedMs + Math.min(80, Math.max(0, nowMs - lastFrameMs))) % CYCLE_TOTAL_MS;
      }
      lastFrameMs = nowMs;
    } else {
      lastFrameMs = null;
    }

    const rawTau = Math.min(1, elapsedMs / CYCLE_PLAY_MS);
    // Smooth slight ease at start/end while preserving clear motion speed
    const tau = rawTau;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = DARK_BG;
    ctx.fillRect(0, 0, cw, ch);

    const tr = computeFittedTransform(viewBounds, cw, ch, pad);
    drawDraftingFrame(ctx, tr, cw, ch, "x (m)", "y (m)");

    ctx.save();
    ctx.beginPath();
    ctx.rect(tr.ox, tr.oy, tr.boxW, tr.boxH);
    ctx.clip();

    // 1. Subtle Stokes Loop circle reference
    if (Array.isArray(stokes.center) && Number.isFinite(stokes.radius)) {
      const [lx, ly] = worldToPx(stokes.center[0], stokes.center[1], tr);
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "rgba(52, 211, 153, 0.36)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(lx, ly, stokes.radius * tr.scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 2. Instantaneous Streamline reference at t_eval
    drawCurve(tr, streamPts, "rgba(56, 189, 248, 0.42)", 1.9, [6, 5]);

    // 3. Initial dashed square + live morphing fluid element
    if (el0.length >= 3) {
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = "rgba(148, 163, 184, 0.42)";
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      el0.forEach(([wx, wy], i) => {
        const [px, py] = worldToPx(wx, wy, tr);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.stroke();
      ctx.restore();

      if (el1.length === el0.length) {
        ctx.save();
        ctx.fillStyle = "rgba(251, 191, 36, 0.14)";
        ctx.strokeStyle = "rgba(251, 191, 36, 0.72)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < el0.length; i++) {
          const wx = el0[i][0] + (el1[i][0] - el0[i][0]) * tau;
          const wy = el0[i][1] + (el1[i][1] - el0[i][1]) * tau;
          const [px, py] = worldToPx(wx, wy, tr);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }

    // 4. Unfolding Streakline dye plume + drifting tracer beads
    const liveStreak = buildLiveStreakline(pathPts, streakFinal, tau, curvesCoincide);
    drawCurve(tr, liveStreak, "rgba(251, 113, 133, 0.85)", 2.2, [5, 4]);
    if (liveStreak.length >= 2) {
      const beadCount = 7;
      for (let b = 1; b < beadCount; b++) {
        const s = b / beadCount;
        const bp = samplePolyline(liveStreak, s);
        if (!bp) continue;
        const [bx, by] = worldToPx(bp[0], bp[1], tr);
        ctx.fillStyle = "rgba(253, 164, 175, 0.9)";
        ctx.beginPath();
        ctx.arc(bx, by, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 5. Animated Pathline wake
    const livePath = getPolylinePrefix(pathPts, tau);
    drawCurve(tr, livePath, "rgba(251, 146, 60, 0.95)", 2.8, []);

    // 6. Seed injector ring at (x0, y0)
    const [sx, sy] = worldToPx(seedX, seedY, tr);
    const pulse = paused ? 0 : (Math.sin((nowMs || 0) * 0.006) + 1) * 0.5;
    ctx.strokeStyle = `rgba(251, 113, 133, ${(0.3 + 0.45 * pulse).toFixed(2)})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(sx, sy, 6 + pulse * 4, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "#0f172a";
    ctx.strokeStyle = "#f8fafc";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, sy, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 7. Moving glowing Lagrangian parcel + velocity arrow
    const parcelPos = samplePolyline(pathPts, tau) || [seedX, seedY];
    const [ppx, ppy] = worldToPx(parcelPos[0], parcelPos[1], tr);
    const localVel = sampler.sample(parcelPos[0], parcelPos[1]);

    if (localVel && localVel.speed > 1e-4) {
      const normSpd = sampler.speedNorm(localVel.speed);
      const arrowLen = 18 + normSpd * 24;
      const sxDir = localVel.u / localVel.speed;
      const syDir = -localVel.v / localVel.speed;
      drawArrowHead(
        ctx,
        ppx,
        ppy,
        ppx + sxDir * arrowLen,
        ppy + syDir * arrowLen,
        "#38bdf8",
        2.0,
        6.5
      );
    }

    const halo = ctx.createRadialGradient(ppx, ppy, 0, ppx, ppy, 15);
    halo.addColorStop(0, "rgba(251, 146, 60, 0.95)");
    halo.addColorStop(0.45, "rgba(56, 189, 248, 0.55)");
    halo.addColorStop(1, "rgba(56, 189, 248, 0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(ppx, ppy, 15, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(ppx, ppy, 4.0, 0, Math.PI * 2);
    ctx.fill();

    // 8. Hover crosshair
    if (hoverWorld) {
      const [hx, hy] = worldToPx(hoverWorld[0], hoverWorld[1], tr);
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
    }

    ctx.restore();

    // Update live telemetry overlay pill
    if (cardEl) {
      const spdVal =
        tau >= 0.99 && Number.isFinite(probe.speed)
          ? probe.speed
          : localVel?.speed ?? null;
      const statusText = curvesCoincide ? "Coincide (Steady)" : "Diverge (Unsteady)";
      const statusCls = curvesCoincide ? "ok" : "warn";
      cardEl.innerHTML = `
        <div class="tutor-kin-card-row">
          <span class="tutor-kin-card-pos">x=${fmtNum(parcelPos[0], 2)}, y=${fmtNum(parcelPos[1], 2)}</span>
          <span class="tutor-kin-card-spd">|V|=${fmtNum(spdVal, 2)} m/s</span>
          <span class="tutor-kin-card-badge ${statusCls}">${statusText}</span>
        </div>
        <div class="tutor-kin-card-prog">
          <div class="tutor-kin-card-bar" style="width:${Math.round(tau * 100)}%"></div>
        </div>
        <div class="tutor-kin-card-meta">
          <span>Seed (${fmtNum(seedX, 1)}, ${fmtNum(seedY, 1)})</span>
          <span>Progress ${Math.round(tau * 100)}% (t → ${fmtNum(tEval, 2)}s)</span>
        </div>
      `;
    }
  };

  const loop = (nowMs) => {
    render(nowMs);
    if (!paused && typeof requestAnimationFrame === "function") {
      rafId = requestAnimationFrame(loop);
    } else {
      rafId = null;
    }
  };

  const startLoop = () => {
    if (paused) {
      render(currentTimeMs());
      return;
    }
    if (rafId === null && typeof requestAnimationFrame === "function") {
      rafId = requestAnimationFrame(loop);
    }
  };

  const onPauseClick = () => {
    paused = !paused;
    syncPauseBtn();
    if (paused) {
      if (rafId !== null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      render(currentTimeMs());
    } else {
      lastFrameMs = null;
      startLoop();
    }
  };

  const onReplayClick = () => {
    elapsedMs = 0;
    lastFrameMs = null;
    if (paused) {
      paused = false;
      syncPauseBtn();
      startLoop();
    }
  };

  pauseBtn?.addEventListener("click", onPauseClick);
  replayBtn?.addEventListener("click", onReplayClick);

  const onPointerMove = (e) => {
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const cw = canvas.clientWidth || canvas.width || 380;
    const ch = canvas.clientHeight || canvas.height || 320;
    const tr = computeFittedTransform(viewBounds, cw, ch, pad);
    if (px >= tr.ox && px <= tr.ox + tr.boxW && py >= tr.oy && py <= tr.oy + tr.boxH) {
      hoverWorld = pxToWorld(px, py, tr);
    } else {
      hoverWorld = null;
    }
    updateHud();
    if (paused) render(currentTimeMs());
  };

  const onPointerLeave = () => {
    hoverWorld = null;
    updateHud();
    if (paused) render(currentTimeMs());
  };

  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerleave", onPointerLeave);

  const ro =
    typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => render(currentTimeMs()))
      : null;
  ro?.observe(canvas);

  startLoop();

  return () => {
    if (rafId !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(rafId);
    }
    pauseBtn?.removeEventListener("click", onPauseClick);
    replayBtn?.removeEventListener("click", onReplayClick);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerleave", onPointerLeave);
    ro?.disconnect();
  };
}

/**
 * Mount or update the 3-panel AI Tutor kinematics layout inside #canvasDeck.
 */
export function mountTutorKinematicsViz(d, ctx = {}) {
  unmountTutorKinematicsViz(ctx, { skipPlotRepaint: true });

  const deck = document.getElementById("canvasDeck");
  const primaryBay = document.getElementById("primaryCanvasBay");
  if (!deck || !primaryBay || !d?.field?.U || !d?.curves) return;

  // Pause main flowEngine behind the scenes to save CPU while hidden
  if (typeof ctx.flowEngine?.setPaused === "function" && !ctx.flowEngine.isPaused?.()) {
    ctx.flowEngine.setPaused(true);
    flowPausedByTutor = true;
  }

  deck.classList.add("tutor-kin-active");
  primaryBay.classList.add("hidden-by-tutor");

  const row = document.createElement("div");
  row.id = "tutorKinTopRow";
  row.className = "tutor-kin-top-row";
  row.innerHTML = `
    <div class="canvas-bay tutor-kin-bay" id="tutorPanelABay">
      <div class="canvas-titlebar">
        <span>Eulerian Field &middot; Dense Particle Flow</span>
        <div class="titlebar-right">
          <span class="tutor-speed-scale" title="Particle speed scale">
            <span>Slow</span>
            <span class="tutor-speed-bar" aria-hidden="true"></span>
            <span>Fast</span>
          </span>
          <button type="button" class="btn-machined btn-xs" id="tutorFieldPauseBtn" aria-pressed="false">Pause</button>
        </div>
      </div>
      <div class="canvas-stage-wrap tutor-kin-stage">
        <canvas id="tutorFieldCanvas" aria-label="Eulerian dense particle flow field"></canvas>
      </div>
      <div class="probe-hud" id="tutorFieldHud">Hover over the Eulerian particle field to inspect live velocity and vorticity</div>
    </div>

    <div class="canvas-bay tutor-kin-bay" id="tutorPanelDBay">
      <div class="canvas-titlebar">
        <span>Lagrangian Tracker &middot; Parcel &amp; Dye</span>
        <div class="titlebar-right">
          <div class="legend-strip">
            <span class="leg-item"><span class="leg-swatch" style="background:#fb923c;"></span>Path</span>
            <span class="leg-item"><span class="leg-swatch leg-dashed" style="border-top-color:#fb7185;"></span>Dye Streak</span>
            <span class="leg-item"><span class="leg-swatch leg-dashed" style="border-top-color:#38bdf8;"></span>Stream(t)</span>
          </div>
          <button type="button" class="btn-machined btn-xs" id="tutorLagReplayBtn" title="Replay particle from seed">Replay</button>
          <button type="button" class="btn-machined btn-xs" id="tutorLagPauseBtn" aria-pressed="false">Pause</button>
        </div>
      </div>
      <div class="canvas-stage-wrap tutor-kin-stage">
        <canvas id="tutorLagCanvas" aria-label="Lagrangian parcel and streakline animation"></canvas>
        <div class="tutor-kin-overlay-card" id="tutorLagCard"></div>
      </div>
      <div class="probe-hud" id="tutorLagHud">Tracking fluid parcel &amp; dye streakline</div>
    </div>
  `;

  deck.insertBefore(row, primaryBay);

  const sampler = createFieldSampler(d.field);
  const heatmapCanvas = buildSpeedHeatmapCanvas(sampler, sampler.bounds);

  const destroyA = createPanelA(
    d,
    row.querySelector("#tutorFieldCanvas"),
    row.querySelector("#tutorFieldHud"),
    row.querySelector("#tutorFieldPauseBtn"),
    sampler,
    heatmapCanvas
  );

  const destroyD = createPanelD(
    d,
    row.querySelector("#tutorLagCanvas"),
    row.querySelector("#tutorLagHud"),
    row.querySelector("#tutorLagCard"),
    row.querySelector("#tutorLagPauseBtn"),
    row.querySelector("#tutorLagReplayBtn"),
    sampler
  );

  activeSession = {
    destroy() {
      destroyA?.();
      destroyD?.();
      row.remove();
    },
  };

  // Ensure bottom #secondaryCanvasBay Trajectory plot re-measures to full width
  requestAnimationFrame(() => {
    ctx.plotEngine?.render?.();
  });
}

/**
 * Unmount 3-panel AI Tutor layout and restore default dual canvas deck.
 */
export function unmountTutorKinematicsViz(ctx = {}, opts = {}) {
  if (activeSession) {
    activeSession.destroy();
    activeSession = null;
  }
  const existingRow = document.getElementById("tutorKinTopRow");
  if (existingRow) existingRow.remove();

  const deck = document.getElementById("canvasDeck");
  const primaryBay = document.getElementById("primaryCanvasBay");
  if (deck) deck.classList.remove("tutor-kin-active");
  if (primaryBay) primaryBay.classList.remove("hidden-by-tutor");

  if (!opts.skipPlotRepaint) {
    if (flowPausedByTutor && typeof ctx.flowEngine?.setPaused === "function" && !prefersReducedMotion()) {
      ctx.flowEngine.setPaused(false);
    }
    flowPausedByTutor = false;
    requestAnimationFrame(() => {
      ctx.flowEngine?.render?.();
      ctx.plotEngine?.render?.();
    });
  }
}
