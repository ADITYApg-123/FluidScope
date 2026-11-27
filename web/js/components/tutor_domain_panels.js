/**
 * Animated Dark-Studio Panels for All Non-Kinematics AI Tutor (Station 01) Presets & Families.
 * Works alongside tutor_kinematics_viz.js inside the 3-panel Station 01 deck.
 */
import { fmtNum } from "../core/color_scales.js";
import {
  DARK_BG,
  clamp,
  computeFittedTransform,
  currentTimeMs,
  drawArrowHead,
  drawDraftingFrame,
  drawHoverCrosshair,
  drawPill,
  drawSceneOverlaysDark,
  insideSceneObstacle,
  prefersReducedMotion,
  pxToWorld,
  speedRgb,
  worldToPx,
} from "./tutor_canvas_core.js";

function setupHoverBindings(canvas, getTransform, onMoveWorld, onLeave) {
  const handleMove = (e) => {
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const cw = canvas.clientWidth || canvas.width || 380;
    const ch = canvas.clientHeight || canvas.height || 320;
    const tr = getTransform(cw, ch);
    if (px >= tr.ox && px <= tr.ox + tr.boxW && py >= tr.oy && py <= tr.oy + tr.boxH) {
      onMoveWorld(pxToWorld(px, py, tr));
    } else {
      onMoveWorld(null);
    }
  };
  canvas.addEventListener("pointermove", handleMove);
  canvas.addEventListener("pointerleave", onLeave);
  return () => {
    canvas.removeEventListener("pointermove", handleMove);
    canvas.removeEventListener("pointerleave", onLeave);
  };
}

/**
 * Dense Eulerian Particle Field Panel (Top-Left) for any scene containing a 2D velocity grid.
 */
export function createDenseFieldPanel({
  scene,
  sampler,
  heatmapCanvas,
  linearVelocity = false,
  scalarMode = "speed",
  showSeed = null,
  canvas,
  hudEl,
  pauseBtn,
  defaultHudText = "Hover over the flow field to inspect live velocity",
}) {
  const ctx = canvas.getContext("2d");
  const bounds = scene?.bounds || sampler.bounds;
  const aspectLock = Boolean(scene?.aspectLock);
  const [fXmin, fXmax, fYmin, fYmax] = sampler.gridBounds;
  const spanX = Math.max(1e-6, fXmax - fXmin);
  const spanY = Math.max(1e-6, fYmax - fYmin);
  const minSpan = Math.min(spanX, spanY);
  const pad = { left: 46, right: 14, top: 14, bottom: 32 };

  const N_PARTICLES = 380;
  const TRAIL_LEN = 14;
  const particles = [];

  const spawnParticle = (randomLife = false) => {
    let x = fXmin + Math.random() * spanX;
    let y = fYmin + Math.random() * spanY;
    for (let attempt = 0; attempt < 14; attempt++) {
      const candX = fXmin + Math.random() * spanX;
      const candY = fYmin + Math.random() * spanY;
      if (!insideSceneObstacle(candX, candY, scene) && sampler.sample(candX, candY)) {
        x = candX;
        y = candY;
        break;
      }
    }
    return {
      x,
      y,
      trail: [],
      life: randomLife ? Math.floor(Math.random() * 80) : 0,
      maxLife: 70 + Math.floor(Math.random() * 85),
    };
  };

  for (let i = 0; i < N_PARTICLES; i++) particles.push(spawnParticle(true));

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
      hudEl.textContent = defaultHudText;
      return;
    }
    const [wx, wy] = hoverWorld;
    if (insideSceneObstacle(wx, wy, scene)) {
      hudEl.textContent = `X: ${fmtNum(wx, 2)} | Y: ${fmtNum(wy, 2)} | Solid obstacle region`;
      return;
    }
    const s = sampler.sample(wx, wy);
    if (!s) {
      hudEl.textContent = `X: ${fmtNum(wx, 2)} | Y: ${fmtNum(wy, 2)} | Outside fluid domain`;
      return;
    }
    const wTxt = s.vort !== null ? ` | Ωz: ${fmtNum(s.vort, 2)} s⁻¹` : "";
    const cpTxt = s.cp !== null ? ` | Cp: ${fmtNum(s.cp, 2)}` : "";
    hudEl.textContent = `X: ${fmtNum(wx, 2)} | Y: ${fmtNum(wy, 2)} | u: ${fmtNum(s.u, 2)} | v: ${fmtNum(s.v, 2)} | |V|: ${fmtNum(s.speed, 2)}${wTxt}${cpTxt}`;
  };
  updateHud();

  const stepParticles = () => {
    for (const p of particles) {
      const s1 = sampler.sample(p.x, p.y);
      if (!s1 || s1.speed < 1e-5 || s1.speed > 1e4 || p.life >= p.maxLife || insideSceneObstacle(p.x, p.y, scene)) {
        Object.assign(p, spawnParticle(false));
        continue;
      }

      const norm1 = sampler.speedNorm(s1.speed, linearVelocity);
      const stepDist = linearVelocity
        ? (0.002 + 0.015 * norm1) * spanX
        : (0.0045 + 0.0125 * norm1) * minSpan;

      const dt1 = stepDist / s1.speed;
      const midX = p.x + 0.5 * s1.u * dt1;
      const midY = p.y + 0.5 * s1.v * dt1;
      const s2 = sampler.sample(midX, midY);
      const use = s2 && s2.speed >= 1e-5 && s2.speed < 1e4 ? s2 : s1;
      const dt2 = stepDist / use.speed;

      p.trail.push({ x: p.x, y: p.y, norm: norm1 });
      if (p.trail.length > TRAIL_LEN) p.trail.shift();

      p.x += use.u * dt2;
      p.y += use.v * dt2;
      p.life += 1;

      if (p.x < fXmin || p.x > fXmax || p.y < fYmin || p.y > fYmax || insideSceneObstacle(p.x, p.y, scene)) {
        Object.assign(p, spawnParticle(false));
      }
    }
  };

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

    const tr = computeFittedTransform(bounds, cw, ch, pad, aspectLock);
    if (!paused) stepParticles();

    if (heatmapCanvas) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(tr.ox, tr.oy, tr.boxW, tr.boxH);
      ctx.clip();
      const [bx0, by1] = worldToPx(fXmin, fYmin, tr);
      const [bx1, by0] = worldToPx(fXmax, fYmax, tr);
      ctx.imageSmoothingEnabled = true;
      ctx.globalAlpha = scalarMode === "vorticity" ? 0.88 : 0.92;
      ctx.drawImage(heatmapCanvas, bx0, by0, bx1 - bx0, by1 - by0);
      ctx.restore();
    }

    drawDraftingFrame(ctx, tr, cw, ch, scene?.xLabel || "x (m)", scene?.yLabel || "y (m)");

    ctx.save();
    ctx.beginPath();
    ctx.rect(tr.ox, tr.oy, tr.boxW, tr.boxH);
    ctx.clip();

    drawSceneOverlaysDark(ctx, tr, scene, { skipFluidPoly: false, fluidFill: "rgba(14, 116, 144, 0.10)" });

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
        const alpha = frac * frac * lifeEnv * 0.88;
        const [r, g, b] = speedRgb(a1.norm);
        const [px0, py0] = worldToPx(a0.x, a0.y, tr);
        const [px1, py1] = worldToPx(a1.x, a1.y, tr);
        ctx.strokeStyle = `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
        ctx.lineWidth = 0.8 + frac * 1.15;
        ctx.beginPath();
        ctx.moveTo(px0, py0);
        ctx.lineTo(px1, py1);
        ctx.stroke();
      }

      const head = p.trail[n - 1];
      const [hx, hy] = worldToPx(p.x, p.y, tr);
      const [r, g, b] = speedRgb(head.norm);
      ctx.fillStyle = `rgba(${r},${g},${b},${(0.92 * lifeEnv).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(hx, hy, 1.3 + head.norm * 0.65, 0, Math.PI * 2);
      ctx.fill();
    }

    if (showSeed) {
      const [sx, sy] = worldToPx(showSeed[0], showSeed[1], tr);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(sx, sy, 5.5, 0, Math.PI * 2);
      ctx.stroke();
    }

    drawHoverCrosshair(ctx, tr, hoverWorld);
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

  const onPause = () => {
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
  pauseBtn?.addEventListener("click", onPause);

  const unbindHover = setupHoverBindings(
    canvas,
    (cw, ch) => computeFittedTransform(bounds, cw, ch, pad, aspectLock),
    (pt) => {
      hoverWorld = pt;
      updateHud();
      if (paused) render();
    },
    () => {
      hoverWorld = null;
      updateHud();
      if (paused) render();
    }
  );

  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => render()) : null;
  ro?.observe(canvas);
  startLoop();

  return () => {
    if (rafId !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(rafId);
    pauseBtn?.removeEventListener("click", onPause);
    unbindHover();
    ro?.disconnect();
  };
}

/**
 * Top-Left Cross-Section Panel for Rotating Vessel & Accelerating Tank (no U/V grid).
 */
export function createContainerLeftPanel(family, d, scene, canvas, hudEl, pauseBtn) {
  const ctx = canvas.getContext("2d");
  const bounds = scene.bounds;
  const pad = { left: 48, right: 14, top: 14, bottom: 32 };
  const isVessel = family === "rotating_vessel";
  const isFreeFall = !isVessel && Number(d.g_effective) < 0.05;

  const droplets = Array.from({ length: 28 }, (_, i) => ({
    s: i / 28,
    jitter: (Math.random() - 0.5) * 0.015,
  }));

  const swirlPts = isVessel
    ? Array.from({ length: 160 }, () => ({
        rNorm: 0.1 + 0.88 * Math.sqrt(Math.random()),
        zFrac: 0.08 + 0.84 * Math.random(),
        phase: Math.random() * Math.PI * 2,
      }))
    : [];

  let paused = prefersReducedMotion();
  let tPhase = 0;
  let rafId = null;

  const syncPause = () => {
    if (!pauseBtn) return;
    pauseBtn.textContent = paused ? "Play" : "Pause";
    pauseBtn.setAttribute("aria-pressed", String(paused));
  };
  syncPause();
  if (hudEl) hudEl.textContent = scene.defaultHud || "Container cross-section & fluid surface";

  const interpVesselZ = (rAbs) => {
    const rArr = d.r || [0];
    const zArr = d.z_surface || [0];
    const rMax = rArr[rArr.length - 1] || 1;
    const f = clamp(rAbs / rMax, 0, 1) * (zArr.length - 1);
    const idx = clamp(Math.floor(f), 0, zArr.length - 2);
    const rem = f - idx;
    return zArr[idx] + (zArr[idx + 1] - zArr[idx]) * rem;
  };

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

    if (!paused) {
      tPhase += isVessel ? 0.045 * Math.max(0.5, (d.rpm || 100) / 100) : 0.025;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = DARK_BG;
    ctx.fillRect(0, 0, cw, ch);

    const tr = computeFittedTransform(bounds, cw, ch, pad, true);
    drawDraftingFrame(ctx, tr, cw, ch, scene.xLabel, scene.yLabel);

    ctx.save();
    ctx.beginPath();
    ctx.rect(tr.ox, tr.oy, tr.boxW, tr.boxH);
    ctx.clip();

    drawSceneOverlaysDark(ctx, tr, scene, { fluidFill: "rgba(14, 165, 233, 0.20)" });

    if (isVessel) {
      const R = d.radius || 0.3;
      const rUnc = d.uncovered_radius || 0;
      for (const sp of swirlPts) {
        const rRad = rUnc + sp.rNorm * Math.max(0.01, R - rUnc);
        const zTop = interpVesselZ(rRad);
        if (zTop <= 0.004) continue;
        const wx = rRad * Math.cos(sp.phase + tPhase);
        const wy = sp.zFrac * zTop;
        const depthFade = 0.25 + 0.65 * Math.max(0, Math.sin(sp.phase + tPhase) * 0.5 + 0.5);
        const [px, py] = worldToPx(wx, wy, tr);
        ctx.fillStyle = `rgba(125, 211, 252, ${depthFade.toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(px, py, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (!isFreeFall && Array.isArray(scene.orificeJet) && scene.orificeJet.length >= 2) {
      const jet = scene.orificeJet;
      const vScale = clamp((d.orifice_v_true || 2) / 3.0, 0.4, 2.0);
      for (const drop of droplets) {
        if (!paused) drop.s = (drop.s + 0.018 * vScale) % 1;
        const f = drop.s * (jet.length - 1);
        const i0 = clamp(Math.floor(f), 0, jet.length - 2);
        const rem = f - i0;
        const wx = jet[i0][0] + (jet[i0 + 1][0] - jet[i0][0]) * rem + drop.jitter;
        const wy = jet[i0][1] + (jet[i0 + 1][1] - jet[i0][1]) * rem;
        const [px, py] = worldToPx(wx, wy, tr);
        ctx.fillStyle = "rgba(56, 189, 248, 0.9)";
        ctx.beginPath();
        ctx.arc(px, py, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
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

  const start = () => {
    if (paused) {
      render();
      return;
    }
    if (rafId === null && typeof requestAnimationFrame === "function") {
      rafId = requestAnimationFrame(loop);
    }
  };

  const onPause = () => {
    paused = !paused;
    syncPause();
    if (paused) {
      if (rafId !== null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      render();
    } else {
      start();
    }
  };
  pauseBtn?.addEventListener("click", onPause);
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => render()) : null;
  ro?.observe(canvas);
  start();

  return () => {
    if (rafId !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(rafId);
    pauseBtn?.removeEventListener("click", onPause);
    ro?.disconnect();
  };
}

function interpArray(xArr, yArr, targetX) {
  if (!xArr?.length || !yArr?.length) return 0;
  for (let i = 0; i < xArr.length - 1; i++) {
    if ((targetX >= xArr[i] && targetX <= xArr[i + 1]) || (targetX <= xArr[i] && targetX >= xArr[i + 1])) {
      const span = xArr[i + 1] - xArr[i];
      const f = Math.abs(span) > 1e-12 ? (targetX - xArr[i]) / span : 0;
      return yArr[i] + (yArr[i + 1] - yArr[i]) * f;
    }
  }
  return targetX <= xArr[0] ? yArr[0] : yArr[yArr.length - 1];
}

/**
 * Unified Top-Right Focused Animation Panel for All Non-Kinematics AI Tutor Presets.
 */
export function createFocusedRightPanel({
  family,
  d,
  spec,
  sampler,
  heatmapCanvas,
  canvas,
  hudEl,
  cardEl,
  pauseBtn,
  replayBtn,
}) {
  const ctx = canvas.getContext("2d");
  const scene = spec?.scene || {};
  const aspectLock = Boolean(scene.aspectLock);
  const pad = { left: 46, right: 14, top: 14, bottom: 32 };

  let paused = prefersReducedMotion();
  let simMs = 0;
  let lastFrameMs = null;
  let hoverWorld = null;
  let rafId = null;

  // Determine focused bounds per family
  let bounds = scene.bounds || [0, 1, 0, 1];
  if (family === "hydraulic_jump") {
    bounds = [1.1, 4.9, scene.bounds[2], scene.bounds[3]];
  } else if (family === "sudden_expansion") {
    bounds = [-0.65, 2.05, scene.bounds[2], scene.bounds[3]];
  } else if (family === "rotating_vessel") {
    const rLim = (d.radius || 0.3) * 1.25;
    bounds = [-rLim, rLim, -rLim, rLim];
  }

  // Per-family state initialization
  let filaments = [];
  const initFilaments = () => {
    filaments = [];
    if (!sampler) return;
    const [gXmin, gXmax, gYmin, gYmax] = sampler.gridBounds;
    if (family === "lbm_tunnel") {
      const nStrands = 9;
      for (let i = 0; i < nStrands; i++) {
        const y0 = gYmin + ((i + 1) / (nStrands + 1)) * (gYmax - gYmin);
        filaments.push({
          seedX: gXmin + 0.04 * (gXmax - gXmin),
          seedY: y0,
          pts: [[gXmin + 0.04 * (gXmax - gXmin), y0]],
          color: i % 2 === 0 ? "#38bdf8" : "#fb923c",
        });
      }
    } else if (family === "potential_superposition") {
      const nStrands = 8;
      for (let i = 0; i < nStrands; i++) {
        const y0 = gYmin + ((i + 1.2) / (nStrands + 1.4)) * (gYmax - gYmin);
        filaments.push({
          seedX: gXmin + 0.04 * (gXmax - gXmin),
          seedY: y0,
          pts: [[gXmin + 0.04 * (gXmax - gXmin), y0]],
          color: y0 >= 0 ? "#38bdf8" : "#fb923c",
        });
      }
    }
  };
  initFilaments();

  // Hydrogen bubble wires for 2D channel & BL profiles
  const IS_VISCOUS_RAKE = new Set([
    "two_layer_poiseuille",
    "couette_poiseuille",
    "slip_herschel_bulkley",
    "bl_separation",
    "falkner_skan",
  ]).has(family);

  let wires = [];
  let wireClock = 0;
  const WIRE_SPAWN_PERIOD = 1.1; // seconds
  const initWires = () => {
    wires = [];
    wireClock = 0;
    if (!IS_VISCOUS_RAKE || !sampler) return;
    const [gXmin, gXmax, gYmin, gYmax] = sampler.gridBounds;
    const seedX = gXmin + 0.24 * (gXmax - gXmin);
    const nRows = 28;
    const makeWire = (ageSec = 0) => {
      const pts = [];
      for (let k = 0; k < nRows; k++) {
        const wy = gYmin + ((k + 0.5) / nRows) * (gYmax - gYmin);
        const s = sampler.sample(seedX, wy);
        const uNorm = s ? clamp(s.u / Math.max(sampler.speedCeiling, 1e-4), -1.2, 1.5) : 0;
        const wx = seedX + uNorm * (gXmax - gXmin) * 0.28 * ageSec;
        pts.push({ x: wx, y: wy, u: s?.u ?? 0, speed: s?.speed ?? 0 });
      }
      return { pts, age: ageSec };
    };
    // Pre-populate 3 evenly spaced timeline profiles so initial paint is rich
    wires.push(makeWire(2.4), makeWire(1.3), makeWire(0.25));
  };
  initWires();

  // Pre-build jump / expansion tracers
  let jumpBeads = Array.from({ length: 14 }, (_, i) => ({ s: i / 14, lane: ((i % 5) - 2) * 0.16 }));
  let eddyBeads = Array.from({ length: 12 }, (_, i) => ({ ang: (i / 12) * Math.PI * 2, ring: (i % 2 === 0 ? 0.55 : 0.85) }));

  const syncPauseBtn = () => {
    if (!pauseBtn) return;
    pauseBtn.textContent = paused ? "Play" : "Pause";
    pauseBtn.setAttribute("aria-pressed", String(paused));
  };
  syncPauseBtn();

  const updateHud = () => {
    if (!hudEl) return;
    if (hoverWorld && sampler) {
      const [wx, wy] = hoverWorld;
      const s = sampler.sample(wx, wy);
      if (s && !insideSceneObstacle(wx, wy, scene)) {
        hudEl.textContent = `X: ${fmtNum(wx, 2)} | Y: ${fmtNum(wy, 2)} | u: ${fmtNum(s.u, 2)} | v: ${fmtNum(s.v, 2)} | |V|: ${fmtNum(s.speed, 2)}`;
        return;
      }
    }
    const defaultMsgs = {
      vortex_flow: "Orbital fluid markers track rigid vs. differential swirl and rotation Ωz",
      lbm_tunnel: "Upstream dye rake illuminates vortex shedding past obstacle geometry",
      potential_superposition: "Matched upper/lower dye filaments visualize pressure asymmetry and lift",
      hydraulic_jump: "Parcels surge through Fr₁ > 1 jet, swirl in roller, and drop EGL by hj",
      sudden_expansion: "Core jet decelerates V₁ → V₂ while trapped corner eddies dissipate energy",
      rotating_vessel: "Top-down swirl plane highlights rigid rotation and uncovered dry base R₁",
      accelerating_tank: "Frame force vector triangle g_eff = g - a_frame drives free-surface tilt and efflux",
    };
    hudEl.textContent =
      defaultMsgs[family] ||
      "Hydrogen-bubble dye wires deform at local u(y) to reveal exact shear and plug zones";
  };
  updateHud();

  const renderCard = () => {
    if (!cardEl) return;
    const m = spec?.drawerMetrics || [];
    const pills = m
      .slice(0, 3)
      .map(
        (item) =>
          `<span class="tutor-kin-card-spd" style="color:${item.color === "var(--coral)" ? "#fb7185" : "#38bdf8"}">${item.k}: <strong style="color:#f8fafc">${item.v}</strong></span>`
      )
      .join("");
    cardEl.innerHTML = `<div class="tutor-kin-card-row">${pills}</div>`;
  };
  renderCard();

  const stepFilaments = (dtSec) => {
    if (!sampler || !filaments.length) return;
    const [gXmin, gXmax, gYmin, gYmax] = sampler.gridBounds;
    const spanX = gXmax - gXmin;
    const stepLen = spanX * 0.36 * dtSec;
    for (const f of filaments) {
      const head = f.pts[f.pts.length - 1];
      const s1 = sampler.sample(head[0], head[1]);
      if (!s1 || s1.speed < 1e-4 || insideSceneObstacle(head[0], head[1], scene)) {
        f.pts = [[f.seedX, f.seedY]];
        continue;
      }
      const norm = sampler.speedNorm(s1.speed, family === "lbm_tunnel");
      const dist = stepLen * (0.45 + 1.15 * norm);
      const nx = head[0] + (s1.u / s1.speed) * dist;
      const ny = head[1] + (s1.v / s1.speed) * dist;
      if (nx < gXmin || nx > gXmax || ny < gYmin || ny > gYmax || insideSceneObstacle(nx, ny, scene)) {
        f.pts = [[f.seedX, f.seedY]];
        continue;
      }
      f.pts.push([nx, ny]);
      if (f.pts.length > 70) f.pts.shift();
    }
  };

  const stepWires = (dtSec) => {
    if (!IS_VISCOUS_RAKE || !sampler) return;
    const [gXmin, gXmax, gYmin, gYmax] = sampler.gridBounds;
    const spanX = gXmax - gXmin;
    const seedX = gXmin + 0.24 * spanX;
    wireClock += dtSec;
    if (wireClock >= WIRE_SPAWN_PERIOD) {
      wireClock = 0;
      const pts = [];
      const nRows = 28;
      for (let k = 0; k < nRows; k++) {
        const wy = gYmin + ((k + 0.5) / nRows) * (gYmax - gYmin);
        const s = sampler.sample(seedX, wy);
        pts.push({ x: seedX, y: wy, u: s?.u ?? 0, speed: s?.speed ?? 0 });
      }
      wires.push({ pts, age: 0 });
      if (wires.length > 5) wires.shift();
    }
    const maxAdvectSpeed = Math.max(sampler.speedCeiling, 1e-4);
    for (const w of wires) {
      w.age += dtSec;
      for (const pt of w.pts) {
        const uNorm = clamp(pt.u / maxAdvectSpeed, -1.2, 1.5);
        pt.x += uNorm * spanX * 0.28 * dtSec;
      }
    }
  };

  if (family === "lbm_tunnel" || family === "potential_superposition") {
    for (let k = 0; k < 28; k++) stepFilaments(0.03);
  }

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

    let dtSec = 0;
    if (!paused && Number.isFinite(nowMs)) {
      if (lastFrameMs !== null) dtSec = Math.min(0.05, Math.max(0, (nowMs - lastFrameMs) * 0.001));
      simMs += dtSec * 1000;
      lastFrameMs = nowMs;
    } else {
      lastFrameMs = null;
    }
    const tSec = simMs * 0.001;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = DARK_BG;
    ctx.fillRect(0, 0, cw, ch);

    if (family === "accelerating_tank") {
      renderAccelVectorPanel(ctx, d, cw, ch, tSec);
      return;
    }

    const tr = computeFittedTransform(bounds, cw, ch, pad, aspectLock);

    if (heatmapCanvas && (family === "lbm_tunnel" || family === "rotating_vessel")) {
      const [gXmin, gXmax, gYmin, gYmax] = sampler.gridBounds;
      ctx.save();
      ctx.beginPath();
      if (family === "rotating_vessel") {
        const [cx0, cy0] = worldToPx(0, 0, tr);
        ctx.arc(cx0, cy0, (d.radius || 0.3) * tr.scale, 0, Math.PI * 2);
      } else {
        ctx.rect(tr.ox, tr.oy, tr.boxW, tr.boxH);
      }
      ctx.clip();
      const [bx0, by1] = worldToPx(gXmin, gYmin, tr);
      const [bx1, by0] = worldToPx(gXmax, gYmax, tr);
      ctx.globalAlpha = 0.65;
      ctx.drawImage(heatmapCanvas, bx0, by0, bx1 - bx0, by1 - by0);
      ctx.restore();
    }

    drawDraftingFrame(
      ctx,
      tr,
      cw,
      ch,
      family === "rotating_vessel" ? "x (m)" : scene.xLabel || "x",
      family === "rotating_vessel" ? "y (m)" : scene.yLabel || "y"
    );

    ctx.save();
    ctx.beginPath();
    ctx.rect(tr.ox, tr.oy, tr.boxW, tr.boxH);
    ctx.clip();

    if (family === "vortex_flow") {
      renderVortexTracker(ctx, tr, d, tSec);
    } else if (family === "lbm_tunnel" || family === "potential_superposition") {
      if (dtSec > 0) stepFilaments(dtSec);
      drawSceneOverlaysDark(ctx, tr, scene, { skipAnnotations: true, skipVectors: true });
      for (const f of filaments) {
        if (f.pts.length < 2) continue;
        ctx.strokeStyle = f.color;
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        f.pts.forEach(([wx, wy], i) => {
          const [px, py] = worldToPx(wx, wy, tr);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();
        const tip = f.pts[f.pts.length - 1];
        const [hx, hy] = worldToPx(tip[0], tip[1], tr);
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(hx, hy, 2.8, 0, Math.PI * 2);
        ctx.fill();
      }
      if (family === "potential_superposition" && Math.abs(d.lift_per_unit_span || 0) > 1e-2) {
        const [cx, cy] = worldToPx(0, 0, tr);
        const dir = d.lift_per_unit_span >= 0 ? -1 : 1;
        drawArrowHead(ctx, cx, cy, cx, cy + dir * 56, "#34d399", 2.6, 8);
        drawPill(ctx, cx + 44, cy + dir * 32, `L' = ${fmtNum(d.lift_per_unit_span, 1)} N/m`, "#34d399");
      }
    } else if (family === "hydraulic_jump" || family === "sudden_expansion") {
      renderJumpOrExpansionTracker(ctx, tr, family, d, scene, sampler, jumpBeads, eddyBeads, dtSec);
    } else if (family === "rotating_vessel") {
      renderVesselPlanView(ctx, tr, d, sampler, tSec);
    } else if (IS_VISCOUS_RAKE) {
      if (dtSec > 0) stepWires(dtSec);
      drawSceneOverlaysDark(ctx, tr, scene, { skipAnnotations: true });
      const [gXmin, gXmax, gYmin, gYmax] = sampler.gridBounds;
      const seedX = gXmin + 0.24 * (gXmax - gXmin);
      const [wxPx, wy0Px] = worldToPx(seedX, gYmin, tr);
      const [, wy1Px] = worldToPx(seedX, gYmax, tr);
      ctx.strokeStyle = "rgba(148, 163, 184, 0.45)";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(wxPx, wy0Px);
      ctx.lineTo(wxPx, wy1Px);
      ctx.stroke();
      ctx.setLineDash([]);

      for (const w of wires) {
        const fade = clamp(1 - w.age / 5.2, 0.12, 0.95);
        ctx.strokeStyle = `rgba(56, 189, 248, ${fade.toFixed(2)})`;
        ctx.lineWidth = 2.1;
        ctx.beginPath();
        w.pts.forEach((pt, idx) => {
          const [px, py] = worldToPx(pt.x, pt.y, tr);
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();
        for (let k = 0; k < w.pts.length; k += 2) {
          const pt = w.pts[k];
          const [px, py] = worldToPx(pt.x, pt.y, tr);
          ctx.fillStyle = pt.u < -1e-4 ? `rgba(251, 113, 133, ${fade.toFixed(2)})` : `rgba(240, 249, 255, ${fade.toFixed(2)})`;
          ctx.beginPath();
          ctx.arc(px, py, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    drawHoverCrosshair(ctx, tr, hoverWorld);
    ctx.restore();
  };

  const loop = (nowMs) => {
    render(nowMs);
    if (!paused && typeof requestAnimationFrame === "function") {
      rafId = requestAnimationFrame(loop);
    } else {
      rafId = null;
    }
  };

  const start = () => {
    if (paused) {
      render(currentTimeMs());
      return;
    }
    if (rafId === null && typeof requestAnimationFrame === "function") {
      rafId = requestAnimationFrame(loop);
    }
  };

  const onPause = () => {
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
      start();
    }
  };

  const onReplay = () => {
    simMs = 0;
    lastFrameMs = null;
    initFilaments();
    initWires();
    if (family === "lbm_tunnel" || family === "potential_superposition") {
      for (let k = 0; k < 20; k++) stepFilaments(0.03);
    }
    if (paused) {
      paused = false;
      syncPauseBtn();
      start();
    }
  };

  pauseBtn?.addEventListener("click", onPause);
  replayBtn?.addEventListener("click", onReplay);

  const unbindHover = setupHoverBindings(
    canvas,
    (cw, ch) => computeFittedTransform(bounds, cw, ch, pad, aspectLock),
    (pt) => {
      hoverWorld = pt;
      updateHud();
      if (paused) render(currentTimeMs());
    },
    () => {
      hoverWorld = null;
      updateHud();
      if (paused) render(currentTimeMs());
    }
  );

  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => render(currentTimeMs())) : null;
  ro?.observe(canvas);
  start();

  return () => {
    if (rafId !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(rafId);
    pauseBtn?.removeEventListener("click", onPause);
    replayBtn?.removeEventListener("click", onReplay);
    unbindHover();
    ro?.disconnect();
  };
}

function renderVortexTracker(ctx, tr, d, tSec) {
  const [cx, cy] = worldToPx(0, 0, tr);
  const pr = d.probes || {};
  const r1 = pr.r1 || 0.15;
  const r2 = pr.r2 || 0.45;
  const rc = d.mode === "rankine" ? d.core_radius || 0.3 : null;
  const v1Raw = interpArray(d.r, d.v_theta, r1);
  const v2Raw = interpArray(d.r, d.v_theta, r2);
  const v1 = Math.abs(v1Raw) || 1;
  const v2 = Math.abs(v2Raw) || 1;
  const spin1 = v1Raw >= 0 ? 1 : -1;
  const spin2 = v2Raw >= 0 ? 1 : -1;
  const vRef = Math.max(v1, v2, 0.2);

  // Orbit rings
  for (const [r, col, dash] of [
    [r1, "rgba(56, 189, 248, 0.55)", [4, 4]],
    [r2, "rgba(251, 146, 60, 0.55)", [4, 4]],
    ...(rc ? [[rc, "rgba(251, 191, 36, 0.7)", [6, 4]]] : []),
  ]) {
    ctx.save();
    ctx.setLineDash(dash);
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r * tr.scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  const w1 = spin1 * (v1 / (r1 * vRef)) * 0.45;
  const w2 = spin2 * (v2 / (r2 * vRef)) * 0.45;
  const th1 = tSec * w1;
  const th2 = tSec * w2;

  const [x1, y1] = worldToPx(r1 * Math.cos(th1), r1 * Math.sin(th1), tr);
  const [x2, y2] = worldToPx(r2 * Math.cos(th2), r2 * Math.sin(th2), tr);

  // Radial comparison spoke in Forced Vortex or independent markers in Free/Rankine
  ctx.strokeStyle = "rgba(148, 163, 184, 0.32)";
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(x1, y1);
  ctx.moveTo(cx, cy);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Orientation cross at r1 showing rotation Ωz != 0 vs irrotational Ωz == 0
  const boxAng = d.bernoulli_globally_valid ? 0 : th1;
  ctx.save();
  ctx.translate(x1, y1);
  ctx.rotate(-boxAng);
  ctx.strokeStyle = "#34d399";
  ctx.lineWidth = 1.8;
  ctx.strokeRect(-9, -9, 18, 18);
  ctx.beginPath();
  ctx.moveTo(-12, 0);
  ctx.lineTo(12, 0);
  ctx.stroke();
  ctx.restore();

  // Tangent velocity arrows
  drawArrowHead(ctx, x1, y1, x1 - spin1 * Math.sin(th1) * 28, y1 - spin1 * Math.cos(th1) * 28, "#38bdf8", 2.0, 6);
  const v2Len = 34 * clamp(v2 / v1, 0.35, 2.0);
  drawArrowHead(ctx, x2, y2, x2 - spin2 * Math.sin(th2) * v2Len, y2 - spin2 * Math.cos(th2) * v2Len, "#fb923c", 2.0, 6);

  for (const [px, py, col, lbl] of [
    [x1, y1, "#38bdf8", `r₁=${fmtNum(r1, 2)}m`],
    [x2, y2, "#fb923c", `r₂=${fmtNum(r2, 2)}m`],
  ]) {
    ctx.fillStyle = col;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(px, py, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    drawPill(ctx, px, py + 18, lbl, col);
  }
}

function renderJumpOrExpansionTracker(ctx, tr, family, d, scene, sampler, jumpBeads, eddyBeads, dtSec) {
  drawSceneOverlaysDark(ctx, tr, scene, { skipAnnotations: true, fluidFill: "rgba(14, 116, 144, 0.16)" });

  if (family === "hydraulic_jump") {
    const cp = d.channel_profile || { x: [0, 6], h_true: [0.3, 1.3] };
    for (const bead of jumpBeads) {
      bead.s = (bead.s + dtSec * 0.28) % 1;
      const wx = 1.1 + bead.s * 3.8;
      const hLoc = interpArray(cp.x, cp.h_true, wx);
      const wy = hLoc * (0.48 + bead.lane);
      const [px, py] = worldToPx(wx, wy, tr);
      const spd = d.q_unit ? d.q_unit / Math.max(hLoc, 0.05) : 1;
      const [r, g, b] = speedRgb(sampler ? sampler.speedNorm(spd, true) : 0.6);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.beginPath();
      ctx.arc(px, py, 3.0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (d.can_jump && scene.eddies?.[0]) {
      const ed = scene.eddies[0];
      for (const eb of eddyBeads) {
        eb.ang += dtSec * 3.8;
        const [px, py] = worldToPx(ed.cx + ed.rx * eb.ring * Math.cos(eb.ang), ed.cy + ed.ry * eb.ring * Math.sin(eb.ang), tr);
        ctx.fillStyle = "#fb7185";
        ctx.beginPath();
        ctx.arc(px, py, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else {
    // sudden_expansion core decelerating beads + corner eddy rings
    for (const bead of jumpBeads) {
      const rate = bead.s < 0.25 ? 0.55 : 0.25;
      bead.s = (bead.s + dtSec * rate) % 1;
      const wx = -0.6 + bead.s * 2.6;
      const spread = wx < 0 ? d.D1 * 0.45 : d.D1 * 0.45 + (d.D2 - d.D1) * 0.35 * Math.tanh(wx / 1.15);
      const wy = bead.lane * spread * 2.1;
      const [px, py] = worldToPx(wx, wy, tr);
      ctx.fillStyle = wx < 0 ? "#f0f9ff" : "#38bdf8";
      ctx.beginPath();
      ctx.arc(px, py, 2.8, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const ed of scene.eddies || []) {
      for (const eb of eddyBeads) {
        const dir = ed.ccw ? 1 : -1;
        eb.ang += dtSec * 3.2 * dir;
        const [px, py] = worldToPx(ed.cx + ed.rx * eb.ring * Math.cos(eb.ang), ed.cy + ed.ry * eb.ring * Math.sin(eb.ang), tr);
        ctx.fillStyle = "#fb7185";
        ctx.beginPath();
        ctx.arc(px, py, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function renderVesselPlanView(ctx, tr, d, sampler, tSec) {
  const [cx, cy] = worldToPx(0, 0, tr);
  const R = d.radius || 0.3;
  const rUnc = d.uncovered_radius || 0;

  // Outer vessel cylinder wall
  ctx.strokeStyle = "#94a3b8";
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(cx, cy, R * tr.scale, 0, Math.PI * 2);
  ctx.stroke();

  // Concentric swirling tracer arcs
  const omegaVis = 0.8 + clamp((d.rpm || 100) / 140, 0.2, 2.5);
  const rings = 9;
  for (let i = 1; i <= rings; i++) {
    const rFrac = i / (rings + 0.5);
    const radW = rFrac * R;
    if (radW <= rUnc) continue;
    const radPx = radW * tr.scale;
    const tNorm = sampler ? sampler.speedNorm(radW * (d.omega || 10)) : rFrac;
    const [r, g, b] = speedRgb(tNorm);
    const segs = 3;
    for (let s = 0; s < segs; s++) {
      const a0 = tSec * omegaVis + i * 0.7 + (s * Math.PI * 2) / segs;
      ctx.strokeStyle = `rgba(${r},${g},${b},0.85)`;
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.arc(cx, cy, radPx, a0, a0 + 0.55);
      ctx.stroke();
    }
  }

  // Highlight dry uncovered center bottom if exposed
  if (rUnc > 0.005) {
    ctx.fillStyle = "rgba(251, 113, 133, 0.22)";
    ctx.strokeStyle = "#fb7185";
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(cx, cy, rUnc * tr.scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    drawPill(ctx, cx, cy, `Dry Base R₁=${fmtNum(rUnc, 2)}m`, "#fb7185");
  }
}

function renderAccelVectorPanel(ctx, d, cw, ch, tSec) {
  const g = 9.81;
  const ax = Number(d.ax) || 0;
  const az = Number(d.az) || 0;
  const gEff = Math.max(0, Number(d.g_effective) || 0);
  const isFreeFall = gEff < 0.05;
  const tiltRad = (Number(d.tilt_deg) || 0) * (Math.PI / 180);

  // Left half: Force Balance Vector Diagram g - a_frame = g_eff
  const origX = cw * 0.28;
  const origY = ch * 0.24;
  const vScale = Math.min(ch * 0.048, 15);

  const gEnd = [origX, origY + g * vScale];
  const aOppEnd = [gEnd[0] - ax * vScale, gEnd[1] - az * vScale];

  drawArrowHead(ctx, origX, origY, gEnd[0], gEnd[1], "#94a3b8", 2.0, 6);
  drawPill(ctx, gEnd[0] - 28, (origY + gEnd[1]) * 0.5, "g", "#cbd5e1");

  if (Math.hypot(ax, az) > 0.05) {
    drawArrowHead(ctx, gEnd[0], gEnd[1], aOppEnd[0], aOppEnd[1], "#fbbf24", 2.0, 6);
    drawPill(ctx, (gEnd[0] + aOppEnd[0]) * 0.5 + 30, (gEnd[1] + aOppEnd[1]) * 0.5, "-a_frame", "#fbbf24");
  }

  drawArrowHead(ctx, origX, origY, aOppEnd[0], aOppEnd[1], isFreeFall ? "#fb7185" : "#38bdf8", 2.8, 8);
  drawPill(ctx, origX + 38, origY + 12, isFreeFall ? "g_eff = 0" : `g_eff=${fmtNum(gEff, 2)}`, isFreeFall ? "#fb7185" : "#38bdf8");

  // Surface tilt horizon & wave preview bottom left
  const horX = cw * 0.28;
  const horY = ch * 0.78;
  ctx.save();
  ctx.translate(horX, horY);
  ctx.strokeStyle = "rgba(148, 163, 184, 0.3)";
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(-68, 0);
  ctx.lineTo(68, 0);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.rotate(-tiltRad);
  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  for (let x = -65; x <= 65; x += 5) {
    const ripple = isFreeFall ? 0 : Math.sin(x * 0.09 + tSec * 3.5) * 1.5;
    if (x === -65) ctx.moveTo(x, ripple);
    else ctx.lineTo(x, ripple);
  }
  ctx.stroke();
  ctx.restore();
  drawPill(ctx, horX, horY + 26, `Surface Tilt ${fmtNum(d.tilt_deg, 1)}°`, "#e2e8f0");

  // Right half: True Efflux V vs Naive Torricelli Bar Comparison
  const vTrue = Number(d.orifice_v_true) || 0;
  const vNaive = Number(d.orifice_v_naive_static) || 0;
  const vMax = Math.max(vTrue, vNaive, 1.0);
  const barBaseY = ch * 0.80;
  const maxBarH = ch * 0.50;
  const barW = 36;
  const bx1 = cw * 0.62;
  const bx2 = cw * 0.80;

  ctx.strokeStyle = "rgba(148, 163, 184, 0.3)";
  ctx.beginPath();
  ctx.moveTo(cw * 0.52, barBaseY);
  ctx.lineTo(cw * 0.94, barBaseY);
  ctx.stroke();

  const hTrue = (vTrue / vMax) * maxBarH;
  const hNaive = (vNaive / vMax) * maxBarH;

  ctx.fillStyle = isFreeFall ? "#fb7185" : "#38bdf8";
  ctx.fillRect(bx1 - barW * 0.5, barBaseY - hTrue, barW, Math.max(2, hTrue));
  ctx.fillStyle = "rgba(251, 113, 133, 0.45)";
  ctx.strokeStyle = "#fb7185";
  ctx.lineWidth = 1.6;
  ctx.fillRect(bx2 - barW * 0.5, barBaseY - hNaive, barW, Math.max(2, hNaive));
  ctx.strokeRect(bx2 - barW * 0.5, barBaseY - hNaive, barW, Math.max(2, hNaive));

  drawPill(ctx, bx1, barBaseY + 18, `True ${fmtNum(vTrue, 2)} m/s`, isFreeFall ? "#fb7185" : "#38bdf8");
  drawPill(ctx, bx2, barBaseY + 18, `Naive ${fmtNum(vNaive, 2)} m/s`, "#fb7185");
}
