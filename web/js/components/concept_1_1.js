/**
 * Section 1.1 Interactive Visual Concept Page ("A Broad Perspective of Fluid Mechanics").
 * Three lightweight, explorable animations:
 *   1. Historical Context — Interactive timeline with animated physics sketches
 *   2. Engineering Applications — 5 looping micro-scenes with concept reveal
 *   3. Continuum vs. Particle Dynamics — Interactive molecular box with zoom slider & live density sparkline
 */

let rafId = null;
let scrollObserver = null;

const HISTORY_MILESTONES = [
  {
    id: "archimedes",
    era: "~250 BC",
    name: "Archimedes",
    concept: "Hydrostatics & Buoyancy",
    caption: "A submerged body experiences an upward buoyant force equal to the weight of displaced fluid.",
  },
  {
    id: "bernoulli",
    era: "1738",
    name: "Daniel Bernoulli",
    concept: "Energy Along a Streamtube",
    caption: "As fluid accelerates through a constriction, kinetic energy rises and static pressure drops.",
  },
  {
    id: "euler",
    era: "1757",
    name: "Leonhard Euler",
    concept: "Inviscid Equations of Motion",
    caption: "Pressure gradients balance fluid inertia along curved streamlines without viscous friction.",
  },
  {
    id: "navier-stokes",
    era: "1822–1845",
    name: "Navier & Stokes",
    concept: "Viscous Momentum Diffusion",
    caption: "Shear stresses proportional to velocity gradients govern real viscous fluid motion.",
  },
  {
    id: "reynolds",
    era: "1883",
    name: "Osborne Reynolds",
    concept: "Laminar-Turbulent Transition",
    caption: "Above a critical Reynolds number, smooth dye filaments break into chaotic swirling eddies.",
  },
  {
    id: "prandtl",
    era: "1904",
    name: "Ludwig Prandtl",
    concept: "Boundary Layer Theory",
    caption: "Viscosity acts inside a thin growing layer near the wall while outer flow stays nearly inviscid.",
  },
  {
    id: "cfd",
    era: "Modern",
    name: "Computational Fluid Dynamics",
    concept: "Discrete Mesh & Vortex Wakes",
    caption: "Computers solve Navier–Stokes on discrete grids to capture unsteady wakes and complex geometries.",
  },
];

const APP_SCENES = [
  {
    id: "wing",
    title: "Airfoil & Wing",
    concept: "Lift & Circulation",
    detail: "Faster airflow over the curved upper surface creates lower pressure and upward lift.",
  },
  {
    id: "blood",
    title: "Blood Vessel",
    concept: "Viscosity & Shear",
    detail: "Wall friction slows fluid at the vessel wall, forming a parabolic laminar profile.",
  },
  {
    id: "pipe",
    title: "Pipe Network",
    concept: "Pressure Drop",
    detail: "Wall shear and junction losses steadily reduce hydraulic pressure downstream.",
  },
  {
    id: "ship",
    title: "Ship Hull",
    concept: "Wave Drag",
    detail: "Moving along a free surface radiates gravity waves governed by the Froude number.",
  },
  {
    id: "turbine",
    title: "Wind Turbine",
    concept: "Momentum Extraction",
    detail: "Spinning blades extract kinetic energy from the incoming wind streamtube.",
  },
];

function getThemeColors() {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  return {
    isDark,
    bg: isDark ? "#0f172a" : "#f8fafc",
    bgSoft: isDark ? "#1e293b" : "#eef2f7",
    ink: isDark ? "#e2e8f0" : "#0f172a",
    muted: isDark ? "#94a3b8" : "#64748b",
    accent: isDark ? "#60a5fa" : "#2563eb",
    accentSoft: isDark ? "rgba(96, 165, 250, 0.18)" : "rgba(37, 99, 235, 0.12)",
    teal: isDark ? "#2dd4bf" : "#0d9488",
    amber: isDark ? "#fbbf24" : "#d97706",
    red: isDark ? "#f87171" : "#dc2626",
    green: isDark ? "#34d399" : "#059669",
    border: isDark ? "#334155" : "#cbd5e1",
  };
}

function syncCanvasSize(canvas, cssW, cssH) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const targetW = Math.round(cssW * dpr);
  const targetH = Math.round(cssH * dpr);
  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

export function destroyConcept11() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  if (scrollObserver) {
    scrollObserver.disconnect();
    scrollObserver = null;
  }
}

export function scrollToConceptSubtopic(subtopicKey) {
  const target = document.getElementById(subtopicKey);
  if (target) {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

export function renderConcept11(container, { openView, onActiveSubtopicChange } = {}) {
  destroyConcept11();
  if (!container) return;

  container.innerHTML = `
    <div class="concept-page">
      <header class="concept-hero">
        <div class="concept-breadcrumb">
          <button type="button" class="concept-back-btn" id="conceptBackOverviewBtn">&larr; Overview</button>
          <span class="concept-crumb-sep">/</span>
          <span class="concept-crumb-code">Chapter 1 · Section 1.1</span>
        </div>
        <h1 class="concept-title">A Broad Perspective of Fluid Mechanics</h1>
        <p class="concept-subtitle">
          Three interactive visual stories: how the discipline evolved, where fluids appear everywhere, and why the continuum model breaks down at molecular scales.
        </p>
      </header>

      <!-- 1. Historical Context -->
      <section class="concept-card" id="subtopic-1-1-history" data-subtopic-label="Historical context">
        <div class="concept-card-head">
          <div>
            <div class="concept-kicker">1.1.1 · Historical Context</div>
            <h2 class="concept-card-title">From Archimedes to Modern CFD</h2>
          </div>
          <span class="concept-hint">Drag timeline or select a milestone</span>
        </div>

        <div class="timeline-stage">
          <div class="timeline-canvas-wrap">
            <canvas id="historyCanvas" class="history-canvas"></canvas>
          </div>
          <div class="timeline-info" id="historyInfo">
            <div class="timeline-era" id="historyEra">~250 BC</div>
            <div class="timeline-name" id="historyName">Archimedes</div>
            <div class="timeline-concept" id="historyConcept">Hydrostatics &amp; Buoyancy</div>
            <p class="timeline-caption" id="historyCaption"></p>
          </div>
        </div>

        <div class="timeline-controls">
          <input type="range" id="historyScrubber" class="timeline-scrubber" min="0" max="6" step="1" value="0" aria-label="Historical milestone timeline" />
          <div class="timeline-stops" id="historyStops">
            ${HISTORY_MILESTONES.map((m, i) => `
              <button type="button" class="timeline-stop ${i === 0 ? 'active' : ''}" data-idx="${i}">
                <span class="stop-era">${m.era}</span>
                <span class="stop-name">${m.name}</span>
              </button>
            `).join("")}
          </div>
        </div>
      </section>

      <!-- 2. Engineering Applications -->
      <section class="concept-card" id="subtopic-1-1-apps" data-subtopic-label="Engineering applications">
        <div class="concept-card-head">
          <div>
            <div class="concept-kicker">1.1.2 · Engineering Applications</div>
            <h2 class="concept-card-title">Fluids Are Everywhere</h2>
          </div>
          <span class="concept-hint">Hover or click any scene to reveal the fluid principle</span>
        </div>

        <div class="apps-loop-grid" id="appsLoopGrid">
          ${APP_SCENES.map((app, i) => `
            <button type="button" class="app-scene-card ${i === 0 ? 'active' : ''}" data-app-id="${app.id}">
              <canvas class="app-scene-canvas" id="appCanvas-${app.id}"></canvas>
              <div class="app-scene-footer">
                <span class="app-scene-title">${app.title}</span>
                <span class="app-scene-concept">${app.concept}</span>
              </div>
            </button>
          `).join("")}
        </div>

        <div class="app-concept-spotlight" id="appConceptSpotlight">
          <span class="spotlight-tag" id="spotlightTag">${APP_SCENES[0].concept}</span>
          <span class="spotlight-text" id="spotlightText">${APP_SCENES[0].detail}</span>
        </div>
      </section>

      <!-- 3. Continuum vs Particle Dynamics -->
      <section class="concept-card concept-card-featured" id="subtopic-1-1-continuum" data-subtopic-label="Continuum vs particle dynamics">
        <div class="concept-card-head">
          <div>
            <div class="concept-kicker">1.1.3 · Continuum vs. Particle Dynamics</div>
            <h2 class="concept-card-title">Where the Smooth Continuum Breaks Down</h2>
          </div>
          <span class="continuum-status-badge valid" id="continuumStatusBadge">Continuum valid</span>
        </div>

        <div class="continuum-workbench">
          <div class="continuum-box-panel">
            <canvas id="continuumBoxCanvas" class="continuum-box-canvas"></canvas>
            <div class="continuum-slider-row">
              <span class="zoom-end-label">Zoomed Out (Macroscopic)</span>
              <input type="range" id="continuumZoomSlider" class="continuum-zoom-slider" min="0" max="100" value="10" aria-label="Sampling box zoom scale" />
              <span class="zoom-end-label">Zoomed In (Molecular)</span>
            </div>
          </div>

          <div class="continuum-telemetry-panel">
            <div class="continuum-readout-grid">
              <div class="readout-tile">
                <span class="readout-label">Normalized Density (&rho;/&rho;&#8320;)</span>
                <span class="readout-value tabular-nums" id="continuumDensityVal">1.00</span>
              </div>
              <div class="readout-tile">
                <span class="readout-label">Molecules in Box (N)</span>
                <span class="readout-value tabular-nums" id="continuumCountVal">120</span>
              </div>
              <div class="readout-tile">
                <span class="readout-label">Knudsen Ratio (&lambda;/L)</span>
                <span class="readout-value tabular-nums" id="continuumKnVal">0.004</span>
              </div>
            </div>

            <div class="continuum-spark-wrap">
              <div class="spark-header">
                <span>Live Sampled Density vs. Naive Smooth Continuum</span>
                <span class="spark-legend">
                  <span class="legend-dot true-dot"></span> Sampled &rho;(t)
                  <span class="legend-dot naive-dot"></span> Smooth &rho;&#8320;
                </span>
              </div>
              <canvas id="continuumSparkCanvas" class="continuum-spark-canvas"></canvas>
            </div>

            <p class="continuum-insight" id="continuumInsight">
              Large sampling volume &Delta;V averages over many molecules—random thermal fluctuations cancel out and density behaves smoothly.
            </p>
          </div>
        </div>
      </section>
    </div>
  `;

  document.getElementById("conceptBackOverviewBtn")?.addEventListener("click", () => {
    openView?.("overview");
  });

  // --- Timeline state ---
  let activeHistoryIdx = 0;
  const scrubber = document.getElementById("historyScrubber");
  const stopBtns = container.querySelectorAll(".timeline-stop");

  function setHistoryMilestone(idx) {
    activeHistoryIdx = Math.max(0, Math.min(HISTORY_MILESTONES.length - 1, Number(idx)));
    const m = HISTORY_MILESTONES[activeHistoryIdx];
    if (scrubber) scrubber.value = String(activeHistoryIdx);
    stopBtns.forEach((b) => b.classList.toggle("active", Number(b.dataset.idx) === activeHistoryIdx));
    const eraEl = document.getElementById("historyEra");
    const nameEl = document.getElementById("historyName");
    const conceptEl = document.getElementById("historyConcept");
    const captionEl = document.getElementById("historyCaption");
    if (eraEl) eraEl.textContent = m.era;
    if (nameEl) nameEl.textContent = m.name;
    if (conceptEl) conceptEl.textContent = m.concept;
    if (captionEl) captionEl.textContent = m.caption;
  }

  setHistoryMilestone(0);
  scrubber?.addEventListener("input", (e) => setHistoryMilestone(e.target.value));
  stopBtns.forEach((b) => {
    b.addEventListener("click", () => setHistoryMilestone(b.dataset.idx));
  });

  // --- Engineering Applications state ---
  const appCards = container.querySelectorAll(".app-scene-card");
  function selectAppScene(appId) {
    const found = APP_SCENES.find((a) => a.id === appId);
    if (!found) return;
    appCards.forEach((c) => c.classList.toggle("active", c.dataset.appId === appId));
    const tagEl = document.getElementById("spotlightTag");
    const textEl = document.getElementById("spotlightText");
    if (tagEl) tagEl.textContent = found.concept;
    if (textEl) textEl.textContent = found.detail;
  }
  appCards.forEach((card) => {
    card.addEventListener("mouseenter", () => selectAppScene(card.dataset.appId));
    card.addEventListener("click", () => selectAppScene(card.dataset.appId));
  });

  // --- Continuum Particle Simulation State ---
  const WORLD_W = 600;
  const WORLD_H = 380;
  const NUM_MOLECULES = 260;
  const molecules = Array.from({ length: NUM_MOLECULES }, (_, i) => {
    const angle = (i * 2.39996) % (Math.PI * 2);
    const speed = 55 + ((i * 37) % 65);
    return {
      x: ((i * 73) % (WORLD_W - 20)) + 10,
      y: ((i * 139) % (WORLD_H - 20)) + 10,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
    };
  });

  let zoomPercent = 10; // 0 = Macroscopic, 100 = Molecular
  const zoomSlider = document.getElementById("continuumZoomSlider");
  zoomSlider?.addEventListener("input", (e) => {
    zoomPercent = Number(e.target.value);
  });

  const densityHistory = [];
  const MAX_HISTORY = 140;
  let lastStatus = "valid";

  // --- Scroll-spy for Sidebar Active Subtopic ---
  const scrollRoot = document.getElementById("appMainContent");
  const subtopicSections = Array.from(container.querySelectorAll("[data-subtopic-label]"));
  if (scrollRoot && subtopicSections.length && "IntersectionObserver" in window) {
    scrollObserver = new IntersectionObserver(
      (entries) => {
        let best = null;
        for (const entry of entries) {
          if (entry.isIntersecting) {
            if (!best || entry.intersectionRatio > best.intersectionRatio) {
              best = entry;
            }
          }
        }
        if (best) {
          onActiveSubtopicChange?.(best.target.dataset.subtopicLabel);
        }
      },
      { root: scrollRoot, threshold: [0.25, 0.55] }
    );
    subtopicSections.forEach((sec) => scrollObserver.observe(sec));
  }

  // --- Main Animation Loop ---
  let prevTs = performance.now();
  let sampleAccum = 0;

  function tick(now) {
    const dt = Math.min((now - prevTs) / 1000, 0.05);
    prevTs = now;
    const t = now / 1000;
    const colors = getThemeColors();

    // 1. Draw History Sketch
    const historyCanvas = document.getElementById("historyCanvas");
    if (historyCanvas) {
      const rect = historyCanvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const ctx = syncCanvasSize(historyCanvas, rect.width, rect.height);
        drawHistorySketch(ctx, rect.width, rect.height, activeHistoryIdx, t, colors);
      }
    }

    // 2. Draw 5 App Loop Scenes
    APP_SCENES.forEach((app) => {
      const c = document.getElementById(`appCanvas-${app.id}`);
      if (!c) return;
      const rect = c.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const ctx = syncCanvasSize(c, rect.width, rect.height);
        drawAppScene(ctx, rect.width, rect.height, app.id, t, colors);
      }
    });

    // 3. Step & Draw Continuum Box + Sparkline
    for (const m of molecules) {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (m.x < 4) { m.x = 4; m.vx = Math.abs(m.vx); }
      else if (m.x > WORLD_W - 4) { m.x = WORLD_W - 4; m.vx = -Math.abs(m.vx); }
      if (m.y < 4) { m.y = 4; m.vy = Math.abs(m.vy); }
      else if (m.y > WORLD_H - 4) { m.y = WORLD_H - 4; m.vy = -Math.abs(m.vy); }
    }

    // Exponential mapping of sampling box size in world coordinates
    // zoomPercent = 0 -> box is 360x240 (large, ~136 molecules)
    // zoomPercent = 100 -> box is 52x36 (tiny, ~2 molecules)
    const boxW = 360 * Math.pow(52 / 360, zoomPercent / 100);
    const boxH = boxW * (WORLD_H / WORLD_W);
    const boxX0 = (WORLD_W - boxW) / 2;
    const boxY0 = (WORLD_H - boxH) / 2;

    let countInBox = 0;
    for (const m of molecules) {
      if (m.x >= boxX0 && m.x <= boxX0 + boxW && m.y >= boxY0 && m.y <= boxY0 + boxH) {
        countInBox++;
      }
    }

    const expectedDensity = NUM_MOLECULES / (WORLD_W * WORLD_H);
    const sampledDensity = countInBox / (boxW * boxH);
    const normDensity = sampledDensity / expectedDensity;
    const knudsen = (14 / boxW).toFixed(3);

    sampleAccum += dt;
    if (sampleAccum >= 0.05) {
      sampleAccum = 0;
      densityHistory.push(normDensity);
      if (densityHistory.length > MAX_HISTORY) densityHistory.shift();

      const dEl = document.getElementById("continuumDensityVal");
      const nEl = document.getElementById("continuumCountVal");
      const kEl = document.getElementById("continuumKnVal");
      if (dEl) dEl.textContent = normDensity.toFixed(2);
      if (nEl) nEl.textContent = String(countInBox);
      if (kEl) kEl.textContent = knudsen;

      const expectedCount = expectedDensity * boxW * boxH;
      let status = "valid";
      if (expectedCount < 12) status = "broken";
      else if (expectedCount < 36) status = "transition";

      if (status !== lastStatus) {
        lastStatus = status;
        const badge = document.getElementById("continuumStatusBadge");
        const insight = document.getElementById("continuumInsight");
        if (badge) {
          badge.className = `continuum-status-badge ${status}`;
          badge.textContent =
            status === "valid"
              ? "Continuum valid"
              : status === "transition"
              ? "Fluctuations emerging"
              : "Continuum breaks down";
        }
        if (insight) {
          insight.textContent =
            status === "valid"
              ? "Large sampling volume ΔV averages over many molecules—random thermal fluctuations cancel out and density behaves smoothly."
              : status === "transition"
              ? "As ΔV shrinks, individual molecules entering and leaving cause noticeable jitter in the macroscopic density reading."
              : "At molecular scales, only a handful of particles occupy ΔV. Density jumps wildly—the smooth continuum hypothesis fails.";
        }
      }
    }

    const boxCanvas = document.getElementById("continuumBoxCanvas");
    if (boxCanvas) {
      const rect = boxCanvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const ctx = syncCanvasSize(boxCanvas, rect.width, rect.height);
        drawContinuumBox(ctx, rect.width, rect.height, molecules, WORLD_W, WORLD_H, boxW, boxH, zoomPercent, lastStatus, colors);
      }
    }

    const sparkCanvas = document.getElementById("continuumSparkCanvas");
    if (sparkCanvas) {
      const rect = sparkCanvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const ctx = syncCanvasSize(sparkCanvas, rect.width, rect.height);
        drawDensitySparkline(ctx, rect.width, rect.height, densityHistory, lastStatus, colors);
      }
    }

    rafId = requestAnimationFrame(tick);
  }

  rafId = requestAnimationFrame(tick);
}

/* ==========================================================================
   1. HISTORICAL CONTEXT SKETCH RENDERER
   ========================================================================== */
function drawHistorySketch(ctx, w, h, idx, t, c) {
  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;

  if (idx === 0) {
    // Archimedes: Floating block bobbing in water with buoyancy vs gravity arrows
    const waterY = h * 0.48;
    const bob = Math.sin(t * 2.2) * 5;
    ctx.fillStyle = c.accentSoft;
    ctx.fillRect(0, waterY, w, h - waterY);
    ctx.strokeStyle = c.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 8) {
      const y = waterY + Math.sin(x * 0.05 + t * 3) * 2;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    const bw = 74, bh = 54;
    const bx = cx - bw / 2, by = waterY - 22 + bob;
    ctx.fillStyle = c.bgSoft;
    ctx.strokeStyle = c.ink;
    ctx.lineWidth = 2;
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeRect(bx, by, bw, bh);

    // Upward Buoyant Force arrow
    drawArrow(ctx, cx, by + bh + 18, cx, by + bh - 12, c.teal, 2.5);
    // Downward Weight arrow
    drawArrow(ctx, cx, by - 18, cx, by + 10, c.amber, 2.5);
    ctx.fillStyle = c.teal;
    ctx.font = "600 11px monospace";
    ctx.fillText("Fb", cx + 8, by + bh + 12);
    ctx.fillStyle = c.amber;
    ctx.fillText("W", cx + 8, by - 8);
  } else if (idx === 1) {
    // Bernoulli: Venturi streamtube + accelerating particles + pressure columns
    ctx.strokeStyle = c.ink;
    ctx.lineWidth = 2;
    const halfH = (x) => {
      const d = (x - cx) / (w * 0.25);
      return h * 0.34 - Math.exp(-d * d) * (h * 0.17);
    };
    ctx.beginPath();
    for (let x = 16; x <= w - 16; x += 6) {
      const y = cy - halfH(x) + 12;
      if (x === 16) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.beginPath();
    for (let x = 16; x <= w - 16; x += 6) {
      const y = cy + halfH(x) + 12;
      if (x === 16) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Accelerating tracer dots
    for (let i = 0; i < 14; i++) {
      const phase = ((t * 0.45 + i / 14) % 1);
      // Non-linear x so speed visibly increases at center
      const x = 18 + phase * (w - 36);
      const row = (i % 3) - 1;
      const y = cy + 12 + row * halfH(x) * 0.55;
      ctx.fillStyle = c.accent;
      ctx.beginPath();
      ctx.arc(x, y, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Pressure bars above inlet and throat
    const pLeft = 36, pMid = 14;
    ctx.fillStyle = c.teal;
    ctx.fillRect(w * 0.2 - 8, cy - halfH(w * 0.2) + 10 - pLeft, 16, pLeft);
    ctx.fillStyle = c.amber;
    ctx.fillRect(cx - 8, cy - halfH(cx) + 10 - pMid, 16, pMid);
    ctx.font = "600 10px monospace";
    ctx.fillStyle = c.muted;
    ctx.fillText("p1", w * 0.2 - 7, 18);
    ctx.fillText("p2 < p1", cx - 22, 18);
  } else if (idx === 2) {
    // Euler: Curved streamline with parcel and normal pressure gradient
    ctx.strokeStyle = c.accent;
    ctx.lineWidth = 2;
    for (let rOff of [-22, 0, 22]) {
      ctx.globalAlpha = rOff === 0 ? 1 : 0.35;
      ctx.beginPath();
      ctx.arc(cx, h + 30, 120 + rOff, Math.PI * 1.25, Math.PI * 1.75);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const ang = Math.PI * (1.32 + ((t * 0.25) % 0.36));
    const px = cx + Math.cos(ang) * 120;
    const py = h + 30 + Math.sin(ang) * 120;
    ctx.fillStyle = c.ink;
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fill();
    // Normal inward arrow dp/dn
    drawArrow(ctx, px, py, px - Math.cos(ang) * 32, py - Math.sin(ang) * 32, c.amber, 2);
    // Tangent velocity
    drawArrow(ctx, px, py, px - Math.sin(ang) * 36, py + Math.cos(ang) * 36, c.teal, 2);
  } else if (idx === 3) {
    // Navier-Stokes: Sheared Couette velocity profile between moving top plate and fixed bottom
    const topY = 34, botY = h - 26;
    ctx.strokeStyle = c.ink;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(24, botY); ctx.lineTo(w - 24, botY);
    ctx.moveTo(24, topY); ctx.lineTo(w - 24, topY);
    ctx.stroke();

    const plateShift = (t * 45) % 30;
    ctx.fillStyle = c.accent;
    for (let x = 30 + plateShift; x < w - 30; x += 30) {
      ctx.fillRect(x, topY - 6, 8, 4);
    }

    const numLayers = 6;
    for (let k = 1; k <= numLayers; k++) {
      const frac = k / numLayers;
      const y = botY - frac * (botY - topY - 6);
      const len = 15 + frac * 85;
      drawArrow(ctx, 50, y, 50 + len, y, c.accent, 2);
    }
  } else if (idx === 4) {
    // Reynolds: Pipe dye filament transitioning from laminar to turbulent
    const topY = 34, botY = h - 34;
    ctx.strokeStyle = c.ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(16, topY); ctx.lineTo(w - 16, topY);
    ctx.moveTo(16, botY); ctx.lineTo(w - 16, botY);
    ctx.stroke();

    const transX = w * (0.45 + 0.25 * Math.sin(t * 1.1));
    ctx.strokeStyle = c.teal;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let x = 20; x <= w - 20; x += 4) {
      let y = cy;
      if (x > transX) {
        const amp = Math.min(26, (x - transX) * 0.35);
        y += Math.sin(x * 0.22 - t * 10) * amp * Math.cos(x * 0.09 + t * 4);
      }
      if (x === 20) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = c.muted;
    ctx.font = "600 10px monospace";
    ctx.fillText("Laminar", 24, 24);
    ctx.fillText("Turbulent", w - 82, 24);
  } else if (idx === 5) {
    // Prandtl: Boundary layer growing along a flat plate
    const plateY = h - 32;
    ctx.strokeStyle = c.ink;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(40, plateY); ctx.lineTo(w - 20, plateY);
    ctx.stroke();

    // Outer inviscid streamlines
    ctx.strokeStyle = c.muted;
    ctx.lineWidth = 1.2;
    for (let row = 0; row < 4; row++) {
      const y = 26 + row * 22;
      ctx.beginPath();
      ctx.moveTo(18, y);
      ctx.lineTo(w - 18, y - 4);
      ctx.stroke();
    }

    // Growing boundary layer curve delta(x) ~ sqrt(x)
    ctx.fillStyle = c.accentSoft;
    ctx.strokeStyle = c.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(40, plateY);
    for (let x = 40; x <= w - 20; x += 5) {
      const d = Math.sqrt((x - 40) / (w - 60)) * 58;
      ctx.lineTo(x, plateY - d);
    }
    ctx.lineTo(w - 20, plateY);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(40, plateY);
    for (let x = 40; x <= w - 20; x += 5) {
      const d = Math.sqrt((x - 40) / (w - 60)) * 58;
      ctx.lineTo(x, plateY - d);
    }
    ctx.stroke();
  } else {
    // CFD: Grid + Kármán vortex street behind cylinder
    ctx.strokeStyle = c.border;
    ctx.lineWidth = 0.7;
    for (let x = 20; x < w; x += 22) {
      ctx.beginPath(); ctx.moveTo(x, 12); ctx.lineTo(x, h - 12); ctx.stroke();
    }
    for (let y = 16; y < h; y += 22) {
      ctx.beginPath(); ctx.moveTo(12, y); ctx.lineTo(w - 12, y); ctx.stroke();
    }
    const cylX = w * 0.25;
    ctx.fillStyle = c.ink;
    ctx.beginPath(); ctx.arc(cylX, cy, 14, 0, Math.PI * 2); ctx.fill();

    // Alternating vortex puffs moving downstream
    for (let i = 0; i < 6; i++) {
      const prog = ((t * 0.35 + i / 6) % 1);
      const vx = cylX + 24 + prog * (w - cylX - 40);
      const sign = i % 2 === 0 ? -1 : 1;
      const vy = cy + sign * (12 + prog * 12);
      ctx.strokeStyle = sign < 0 ? c.accent : c.teal;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(vx, vy, 9, t * 4 * sign, t * 4 * sign + Math.PI * 1.45);
      ctx.stroke();
    }
  }
}

/* ==========================================================================
   2. ENGINEERING APPLICATIONS LOOPING SCENES
   ========================================================================== */
function drawAppScene(ctx, w, h, id, t, c) {
  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2;

  if (id === "wing") {
    // Cambered airfoil + flowing streamlines
    ctx.strokeStyle = c.accent;
    ctx.lineWidth = 1.4;
    for (let row = -2; row <= 2; row++) {
      ctx.beginPath();
      for (let x = 8; x <= w - 8; x += 6) {
        const dx = (x - cx) / 36;
        const bump = Math.exp(-dx * dx) * (row <= 0 ? -10 : 6);
        const y = cy + row * 12 + bump;
        if (x === 8) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // Moving dot particles
    for (let i = 0; i < 5; i++) {
      const p = ((t * 0.7 + i * 0.2) % 1);
      const x = 10 + p * (w - 20);
      const row = (i % 3) - 1;
      const dx = (x - cx) / 36;
      const bump = Math.exp(-dx * dx) * (row <= 0 ? -10 : 6);
      ctx.fillStyle = c.teal;
      ctx.beginPath();
      ctx.arc(x, cy + row * 12 + bump, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Airfoil silhouette
    ctx.fillStyle = c.ink;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 28, 7, -0.14, 0, Math.PI * 2);
    ctx.fill();
  } else if (id === "blood") {
    // Vessel walls + parabolic Poiseuille RBCs
    ctx.fillStyle = c.accentSoft;
    ctx.fillRect(0, cy - 22, w, 44);
    ctx.strokeStyle = c.red;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, cy - 22); ctx.lineTo(w, cy - 22);
    ctx.moveTo(0, cy + 22); ctx.lineTo(w, cy + 22);
    ctx.stroke();

    for (let i = 0; i < 12; i++) {
      const rNorm = ((i % 5) - 2) / 2.4; // -0.83 to 0.83
      const speed = (1 - rNorm * rNorm) * 55 + 10;
      const x = ((t * speed + i * 27) % (w + 16)) - 8;
      const y = cy + rNorm * 18;
      ctx.fillStyle = c.red;
      ctx.beginPath();
      ctx.ellipse(x, y, 4.5, 2.8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (id === "pipe") {
    // Pipe with pressure head drop bars
    ctx.strokeStyle = c.ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(10, cy + 8); ctx.lineTo(w - 10, cy + 8);
    ctx.moveTo(10, cy + 24); ctx.lineTo(w - 10, cy + 24);
    ctx.stroke();

    const cols = [
      { x: w * 0.22, h: 32 },
      { x: w * 0.50, h: 21 },
      { x: w * 0.78, h: 11 },
    ];
    cols.forEach((col) => {
      ctx.strokeStyle = c.border;
      ctx.strokeRect(col.x - 4, cy + 8 - 36, 8, 36);
      ctx.fillStyle = c.accent;
      ctx.fillRect(col.x - 3, cy + 8 - col.h, 6, col.h);
    });
    for (let i = 0; i < 6; i++) {
      const x = 14 + ((t * 50 + i * 24) % (w - 28));
      ctx.fillStyle = c.teal;
      ctx.beginPath();
      ctx.arc(x, cy + 16, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (id === "ship") {
    // Top-down ship hull + Kelvin V-wake waves
    ctx.fillStyle = c.accentSoft;
    ctx.fillRect(0, 0, w, h);
    const hx = cx + 18;
    for (let k = 0; k < 4; k++) {
      const phase = ((t * 0.9 + k * 0.25) % 1);
      const len = 18 + phase * 65;
      ctx.strokeStyle = c.accent;
      ctx.globalAlpha = 1 - phase;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(hx - phase * 18, cy);
      ctx.lineTo(hx - len, cy - len * 0.42);
      ctx.moveTo(hx - phase * 18, cy);
      ctx.lineTo(hx - len, cy + len * 0.42);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = c.ink;
    ctx.beginPath();
    ctx.moveTo(hx + 16, cy);
    ctx.quadraticCurveTo(hx - 4, cy - 10, hx - 22, cy - 7);
    ctx.lineTo(hx - 22, cy + 7);
    ctx.quadraticCurveTo(hx - 4, cy + 10, hx + 16, cy);
    ctx.fill();
  } else if (id === "turbine") {
    // Spinning 3-blade wind turbine + expanding wind lines
    ctx.strokeStyle = c.muted;
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 4; i++) {
      const p = ((t * 0.65 + i * 0.25) % 1);
      const x = 8 + p * (w - 16);
      const y = cy - 18 + (i % 3) * 14;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 12, y);
      ctx.stroke();
    }
    ctx.strokeStyle = c.ink;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, h - 8);
    ctx.stroke();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * 2.4);
    ctx.strokeStyle = c.accent;
    ctx.lineWidth = 3;
    for (let b = 0; b < 3; b++) {
      ctx.rotate((Math.PI * 2) / 3);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -26);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = c.ink;
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* ==========================================================================
   3. CONTINUUM VS PARTICLE DYNAMICS RENDERER
   ========================================================================== */
function drawContinuumBox(ctx, w, h, molecules, worldW, worldH, boxW, boxH, zoomPercent, status, c) {
  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, w, h);

  // Camera zoom: smoothly magnify the center sampling region as zoomPercent goes 0 -> 100
  const baseScale = Math.min(w / worldW, h / worldH);
  const mag = 1 + (zoomPercent / 100) * 3.8;
  const scale = baseScale * mag;

  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(scale, scale);
  ctx.translate(-worldW / 2, -worldH / 2);

  // Outer chamber border
  ctx.strokeStyle = c.border;
  ctx.lineWidth = 2 / scale;
  ctx.strokeRect(0, 0, worldW, worldH);

  const boxX0 = (worldW - boxW) / 2;
  const boxY0 = (worldH - boxH) / 2;

  // Draw molecules
  const molR = 2.8;
  for (const m of molecules) {
    const inside = m.x >= boxX0 && m.x <= boxX0 + boxW && m.y >= boxY0 && m.y <= boxY0 + boxH;
    ctx.fillStyle = inside
      ? status === "valid"
        ? c.accent
        : status === "transition"
        ? c.amber
        : c.red
      : c.muted;
    ctx.globalAlpha = inside ? 0.95 : 0.35;
    ctx.beginPath();
    ctx.arc(m.x, m.y, molR, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Sampling box ΔV overlay
  const boxColor = status === "valid" ? c.green : status === "transition" ? c.amber : c.red;
  ctx.strokeStyle = boxColor;
  ctx.lineWidth = 2.2 / scale;
  ctx.setLineDash([6 / scale, 4 / scale]);
  ctx.strokeRect(boxX0, boxY0, boxW, boxH);
  ctx.setLineDash([]);

  ctx.restore();

  // Corner overlay tag
  ctx.fillStyle = c.bgSoft;
  ctx.fillRect(10, 10, 128, 22);
  ctx.strokeStyle = c.border;
  ctx.lineWidth = 1;
  ctx.strokeRect(10, 10, 128, 22);
  ctx.fillStyle = c.ink;
  ctx.font = "600 11px monospace";
  ctx.fillText(`Sampling Box ΔV`, 18, 25);
}

function drawDensitySparkline(ctx, w, h, history, status, c) {
  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, w, h);

  const padT = 14, padB = 14;
  const plotH = h - padT - padB;
  const yMax = 2.4;
  const toY = (val) => padT + plotH * (1 - Math.min(yMax, Math.max(0, val)) / yMax);

  // Naive smooth continuum reference line (rho / rho0 = 1.0)
  const yRef = toY(1.0);
  ctx.strokeStyle = c.muted;
  ctx.lineWidth = 1.4;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(0, yRef);
  ctx.lineTo(w, yRef);
  ctx.stroke();
  ctx.setLineDash([]);

  if (history.length < 2) return;

  const lineColor = status === "valid" ? c.green : status === "transition" ? c.amber : c.red;
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  const stepX = w / Math.max(1, history.length - 1);
  history.forEach((val, idx) => {
    const x = idx * stepX;
    const y = toY(val);
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function drawArrow(ctx, x1, y1, x2, y2, color, width = 2) {
  const head = 6;
  const ang = Math.atan2(y2 - y1, x2 - x1);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - head * Math.cos(ang - Math.PI / 6), y2 - head * Math.sin(ang - Math.PI / 6));
  ctx.lineTo(x2 - head * Math.cos(ang + Math.PI / 6), y2 - head * Math.sin(ang + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}
