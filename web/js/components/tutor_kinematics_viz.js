/**
 * AI Tutor (Station 01) 3-Panel Animated Visualization Controller.
 *
 * Applies the 3-panel dark-studio animation + shifted comparison graph layout
 * across ALL supported AI Tutor (Station 01) problem families:
 *   Top-Left  : Dense animated particle / cross-section flow field
 *   Top-Right : Focused live physics tracker (Lagrangian parcel, swirl orbits, wake filaments,
 *               hydrogen-bubble wire, jump roller, or vector balance)
 *   Bottom    : Existing #secondaryCanvasBay true-vs-naive comparison chart (full width)
 */
import { fmtNum } from "../core/color_scales.js";
import { computeKinematicsFraming } from "../stations/mappers_kinematics.js";
import {
  DARK_BG,
  buildScalarHeatmapCanvas,
  clamp,
  computeFittedTransform,
  createFieldSampler,
  currentTimeMs,
  drawArrowHead,
  drawDraftingFrame,
  drawHoverCrosshair,
  getPolylinePrefix,
  prefersReducedMotion,
  pxToWorld,
  samplePolyline,
  worldToPx,
} from "./tutor_canvas_core.js";
import {
  createContainerLeftPanel,
  createDenseFieldPanel,
  createFocusedRightPanel,
} from "./tutor_domain_panels.js";

let activeSession = null;
let flowPausedByTutor = false;

const FAMILY_PANEL_META = {
  kinematics_equation: {
    leftTitle: "Eulerian Field · Dense Particle Flow",
    rightTitle: "Lagrangian Tracker · Parcel & Dye",
    scaleLeft: "Slow",
    scaleRight: "Fast",
    rightLegend: [
      { label: "Path", color: "#fb923c" },
      { label: "Dye Streak", color: "#fb7185", dashed: true },
      { label: "Stream(t)", color: "#38bdf8", dashed: true },
    ],
    linearVelocity: false,
    scalarMode: "speed",
  },
  vortex_flow: {
    leftTitle: "Vortex Swirl Plane · Dense Particle Flow",
    rightTitle: "Orbital Fluid Parcels & Rotation Ωz",
    scaleLeft: "Slow",
    scaleRight: "Fast",
    rightLegend: [
      { label: "r₁ Parcel", color: "#38bdf8" },
      { label: "r₂ Parcel", color: "#fb923c" },
    ],
    linearVelocity: false,
    scalarMode: "speed",
  },
  potential_superposition: {
    leftTitle: "Potential Superposition · Dense Particle Flow",
    rightTitle: "Boundary Filaments & Magnus Lift",
    scaleLeft: "Slow",
    scaleRight: "Fast",
    rightLegend: [
      { label: "Upper", color: "#38bdf8" },
      { label: "Lower", color: "#fb923c" },
    ],
    linearVelocity: false,
    scalarMode: "speed",
  },
  lbm_tunnel: {
    leftTitle: "2D LBM Tunnel · Dense Vorticity Flow",
    rightTitle: "Upstream Dye Rake · Wake Shedding",
    scaleLeft: "-Ωz",
    scaleRight: "+Ωz",
    rightLegend: [
      { label: "Dye Rake", color: "#38bdf8" },
      { label: "Alt Wake", color: "#fb923c" },
    ],
    linearVelocity: true,
    scalarMode: "vorticity",
  },
  hydraulic_jump: {
    leftTitle: "Hydraulic Jump · Dense Channel Flow",
    rightTitle: "Jump Roller & EGL Drop Transition",
    scaleLeft: "Slow",
    scaleRight: "Fast",
    rightLegend: [
      { label: "Stream", color: "#38bdf8" },
      { label: "Roller Eddy", color: "#fb7185" },
    ],
    linearVelocity: true,
    scalarMode: "linearSpeed",
  },
  sudden_expansion: {
    leftTitle: "Pipe Expansion · Jet & Dead-Zone Field",
    rightTitle: "Step Transition · Corner Eddies",
    scaleLeft: "Slow",
    scaleRight: "Fast",
    rightLegend: [
      { label: "Jet Core", color: "#38bdf8" },
      { label: "Dead-Zone", color: "#fb7185" },
    ],
    linearVelocity: true,
    scalarMode: "linearSpeed",
  },
  rotating_vessel: {
    leftTitle: "Rotating Vessel · Cross-Section",
    rightTitle: "Top-Down Swirl & Uncovered Base",
    scaleLeft: "Axis",
    scaleRight: "Rim",
    rightLegend: [
      { label: "Swirl", color: "#38bdf8" },
      { label: "Dry Base", color: "#fb7185", dashed: true },
    ],
    linearVelocity: false,
    scalarMode: "speed",
  },
  accelerating_tank: {
    leftTitle: "Accelerating Tank · Surface & Orifice Jet",
    rightTitle: "Frame Force Balance g_eff & Efflux",
    scaleLeft: "0",
    scaleRight: "g",
    rightLegend: [
      { label: "g_eff", color: "#38bdf8" },
      { label: "Naive", color: "#fb7185" },
    ],
    linearVelocity: false,
    scalarMode: "speed",
  },
};

const VISCOUS_DEFAULT_META = {
  rightTitle: "Hydrogen-Bubble Velocity Profile",
  scaleLeft: "Slow",
  scaleRight: "Fast",
  rightLegend: [
    { label: "Velocity Wire", color: "#38bdf8" },
    { label: "Backflow", color: "#fb7185" },
  ],
  linearVelocity: true,
  scalarMode: "linearSpeed",
};

function buildLiveStreakline(pathlinePts, streakFinalPts, tau, curvesCoincide) {
  if (!Array.isArray(pathlinePts) || pathlinePts.length < 2) return [];
  if (curvesCoincide || !Array.isArray(streakFinalPts) || streakFinalPts.length < 2) {
    return getPolylinePrefix(pathlinePts, tau);
  }
  const root = pathlinePts[0];
  const currentHead = samplePolyline(pathlinePts, tau) || root;
  const finalTip = streakFinalPts[0];
  const nSamples = 32;
  const out = [];

  for (let i = 0; i <= nSamples; i++) {
    const s = i / nSamples;
    const pOnPath = samplePolyline(pathlinePts, s * tau) || root;
    const pOnStreakFinal = samplePolyline(streakFinalPts, 1 - s) || currentHead;

    const chordFinalX = finalTip[0] - root[0];
    const chordFinalY = finalTip[1] - root[1];
    const devStreakX = pOnStreakFinal[0] - (root[0] + s * chordFinalX);
    const devStreakY = pOnStreakFinal[1] - (root[1] + s * chordFinalY);

    const chordCurrX = currentHead[0] - root[0];
    const chordCurrY = currentHead[1] - root[1];
    const devPathX = pOnPath[0] - (root[0] + s * chordCurrX);
    const devPathY = pOnPath[1] - (root[1] + s * chordCurrY);

    const mix = clamp(tau, 0, 1);
    out.push([
      root[0] + s * chordCurrX + (1 - mix) * devPathX + mix * devStreakX,
      root[1] + s * chordCurrY + (1 - mix) * devPathY + mix * devStreakY,
    ]);
  }
  return out;
}

function createKinematicsRightPanel(d, canvas, hudEl, cardEl, pauseBtn, replayBtn, sampler) {
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

    const tau = Math.min(1, elapsedMs / CYCLE_PLAY_MS);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = DARK_BG;
    ctx.fillRect(0, 0, cw, ch);

    const tr = computeFittedTransform(viewBounds, cw, ch, pad, true);
    drawDraftingFrame(ctx, tr, cw, ch, "x (m)", "y (m)");

    ctx.save();
    ctx.beginPath();
    ctx.rect(tr.ox, tr.oy, tr.boxW, tr.boxH);
    ctx.clip();

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

    drawCurve(tr, streamPts, "rgba(56, 189, 248, 0.42)", 1.9, [6, 5]);

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

    const liveStreak = buildLiveStreakline(pathPts, streakFinal, tau, curvesCoincide);
    drawCurve(tr, liveStreak, "rgba(251, 113, 133, 0.85)", 2.2, [5, 4]);
    if (liveStreak.length >= 2) {
      for (let b = 1; b < 7; b++) {
        const bp = samplePolyline(liveStreak, b / 7);
        if (!bp) continue;
        const [bx, by] = worldToPx(bp[0], bp[1], tr);
        ctx.fillStyle = "rgba(253, 164, 175, 0.9)";
        ctx.beginPath();
        ctx.arc(bx, by, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const livePath = getPolylinePrefix(pathPts, tau);
    drawCurve(tr, livePath, "rgba(251, 146, 60, 0.95)", 2.8, []);

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

    const parcelPos = samplePolyline(pathPts, tau) || [seedX, seedY];
    const [ppx, ppy] = worldToPx(parcelPos[0], parcelPos[1], tr);
    const localVel = sampler.sample(parcelPos[0], parcelPos[1]);

    if (localVel && localVel.speed > 1e-4) {
      const arrowLen = 18 + sampler.speedNorm(localVel.speed) * 24;
      drawArrowHead(
        ctx,
        ppx,
        ppy,
        ppx + (localVel.u / localVel.speed) * arrowLen,
        ppy - (localVel.v / localVel.speed) * arrowLen,
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

    drawHoverCrosshair(ctx, tr, hoverWorld);
    ctx.restore();

    if (cardEl) {
      const spdVal = tau >= 0.99 && Number.isFinite(probe.speed) ? probe.speed : localVel?.speed ?? null;
      const statusText = curvesCoincide ? "Coincide (Steady)" : "Diverge (Unsteady)";
      cardEl.innerHTML = `
        <div class="tutor-kin-card-row">
          <span class="tutor-kin-card-pos">x=${fmtNum(parcelPos[0], 2)}, y=${fmtNum(parcelPos[1], 2)}</span>
          <span class="tutor-kin-card-spd">|V|=${fmtNum(spdVal, 2)} m/s</span>
          <span class="tutor-kin-card-badge ${curvesCoincide ? "ok" : "warn"}">${statusText}</span>
        </div>
        <div class="tutor-kin-card-prog"><div class="tutor-kin-card-bar" style="width:${Math.round(tau * 100)}%"></div></div>
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
      if (rafId !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(rafId);
      rafId = null;
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
    const tr = computeFittedTransform(viewBounds, cw, ch, pad, true);
    hoverWorld =
      px >= tr.ox && px <= tr.ox + tr.boxW && py >= tr.oy && py <= tr.oy + tr.boxH
        ? pxToWorld(px, py, tr)
        : null;
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

  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => render(currentTimeMs())) : null;
  ro?.observe(canvas);
  startLoop();

  return () => {
    if (rafId !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(rafId);
    pauseBtn?.removeEventListener("click", onPauseClick);
    replayBtn?.removeEventListener("click", onReplayClick);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerleave", onPointerLeave);
    ro?.disconnect();
  };
}

/**
 * Mount or update the 3-panel AI Tutor animated visualization inside #canvasDeck
 * for ANY supported solver family (kinematics, hydraulic jump, vortex, LBM wake, viscous, etc.).
 */
export function mountTutorViz(family, d, spec, ctx = {}) {
  unmountTutorViz(ctx, { skipPlotRepaint: true });

  const deck = document.getElementById("canvasDeck");
  const primaryBay = document.getElementById("primaryCanvasBay");
  if (!deck || !primaryBay || !d || !spec?.scene || family === "unsupported_3d") return;

  if (typeof ctx.flowEngine?.setPaused === "function" && !ctx.flowEngine.isPaused?.()) {
    ctx.flowEngine.setPaused(true);
    flowPausedByTutor = true;
  }

  const meta = FAMILY_PANEL_META[family] || {
    leftTitle: `${spec.primaryTitle || "Flow Field"} · Dense Flow`,
    ...VISCOUS_DEFAULT_META,
  };

  const legendHtml = meta.rightLegend
    .map(
      (item) =>
        `<span class="leg-item"><span class="leg-swatch ${item.dashed ? "leg-dashed" : ""}" style="${
          item.dashed ? `border-top-color:${item.color};` : `background:${item.color};`
        }"></span>${item.label}</span>`
    )
    .join("");

  const scaleBarStyle =
    meta.scalarMode === "vorticity"
      ? "background: linear-gradient(90deg, #38bdf8 0%, #0f172a 50%, #fb7185 100%);"
      : "";

  deck.classList.add("tutor-kin-active");
  primaryBay.classList.add("hidden-by-tutor");

  const row = document.createElement("div");
  row.id = "tutorKinTopRow";
  row.className = "tutor-kin-top-row";
  row.innerHTML = `
    <div class="canvas-bay tutor-kin-bay" id="tutorPanelABay">
      <div class="canvas-titlebar">
        <span>${meta.leftTitle}</span>
        <div class="titlebar-right">
          <span class="tutor-speed-scale" title="Field scalar intensity">
            <span>${meta.scaleLeft}</span>
            <span class="tutor-speed-bar" style="${scaleBarStyle}" aria-hidden="true"></span>
            <span>${meta.scaleRight}</span>
          </span>
          <button type="button" class="btn-machined btn-xs" id="tutorFieldPauseBtn" aria-pressed="false">Pause</button>
        </div>
      </div>
      <div class="canvas-stage-wrap tutor-kin-stage">
        <canvas id="tutorFieldCanvas" aria-label="Primary animated flow field"></canvas>
      </div>
      <div class="probe-hud" id="tutorFieldHud">Hover over the flow field to inspect live velocity</div>
    </div>

    <div class="canvas-bay tutor-kin-bay" id="tutorPanelDBay">
      <div class="canvas-titlebar">
        <span>${meta.rightTitle}</span>
        <div class="titlebar-right">
          <div class="legend-strip">${legendHtml}</div>
          <button type="button" class="btn-machined btn-xs" id="tutorLagReplayBtn" title="Replay physics animation">Replay</button>
          <button type="button" class="btn-machined btn-xs" id="tutorLagPauseBtn" aria-pressed="false">Pause</button>
        </div>
      </div>
      <div class="canvas-stage-wrap tutor-kin-stage">
        <canvas id="tutorLagCanvas" aria-label="Focused fluid physics animation"></canvas>
        <div class="tutor-kin-overlay-card" id="tutorLagCard"></div>
      </div>
      <div class="probe-hud" id="tutorLagHud">Tracking live fluid physics</div>
    </div>
  `;

  deck.insertBefore(row, primaryBay);

  const fieldData =
    family === "rotating_vessel"
      ? d.field_2d
      : spec.scene.field || (d.field?.U ? d.field : null);

  const sampler = fieldData?.U ? createFieldSampler(fieldData) : null;
  const heatmapCanvas = sampler
    ? buildScalarHeatmapCanvas(sampler, meta.scalarMode, family === "rotating_vessel" ? null : spec.scene)
    : null;

  const canvasA = row.querySelector("#tutorFieldCanvas");
  const hudA = row.querySelector("#tutorFieldHud");
  const pauseA = row.querySelector("#tutorFieldPauseBtn");
  const canvasD = row.querySelector("#tutorLagCanvas");
  const hudD = row.querySelector("#tutorLagHud");
  const cardD = row.querySelector("#tutorLagCard");
  const pauseD = row.querySelector("#tutorLagPauseBtn");
  const replayD = row.querySelector("#tutorLagReplayBtn");

  let destroyA;
  let destroyD;

  if (family === "rotating_vessel" || family === "accelerating_tank" || !sampler) {
    destroyA = createContainerLeftPanel(family, d, spec.scene, canvasA, hudA, pauseA);
  } else {
    destroyA = createDenseFieldPanel({
      scene: spec.scene,
      sampler,
      heatmapCanvas,
      linearVelocity: meta.linearVelocity,
      scalarMode: meta.scalarMode,
      showSeed: family === "kinematics_equation" ? spec.scene.seedPoint : null,
      canvas: canvasA,
      hudEl: hudA,
      pauseBtn: pauseA,
      defaultHudText: spec.scene.defaultHud || "Hover over the flow field to inspect live velocity and vorticity",
    });
  }

  if (family === "kinematics_equation" && sampler) {
    destroyD = createKinematicsRightPanel(d, canvasD, hudD, cardD, pauseD, replayD, sampler);
  } else {
    destroyD = createFocusedRightPanel({
      family,
      d,
      spec,
      sampler,
      heatmapCanvas,
      canvas: canvasD,
      hudEl: hudD,
      cardEl: cardD,
      pauseBtn: pauseD,
      replayBtn: replayD,
    });
  }

  activeSession = {
    destroy() {
      destroyA?.();
      destroyD?.();
      row.remove();
    },
  };

  requestAnimationFrame(() => {
    ctx.plotEngine?.render?.();
  });
}

export function unmountTutorViz(ctx = {}, opts = {}) {
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

/** Backward-compatible aliases */
export function mountTutorKinematicsViz(d, ctx = {}) {
  return mountTutorViz("kinematics_equation", d, ctx._spec || { scene: { bounds: d?.field?.bounds, aspectLock: true, field: d?.field, seedPoint: d?.point_probe ? [d.point_probe.x, d.point_probe.y] : null }, primaryTitle: "Eulerian Field", drawerMetrics: [] }, ctx);
}

export function unmountTutorKinematicsViz(ctx = {}, opts = {}) {
  return unmountTutorViz(ctx, opts);
}
