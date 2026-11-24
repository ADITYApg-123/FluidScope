/**
 * Omnipresent Slide-Over Doubt Coach Drawer (#coachDrawerHost).
 * Grounded strictly to active solver residuals across Labs 2A-4D, AI Translator, and post-submit Quiz 05.
 * Kinematics Visualization: 3-panel layout —
 *   Panel A: Dense particle field (Eulerian view, earth.nullschool style)
 *   Panel D: Lagrangian tracker (single glowing particle + live readout)
 *   Panel below: Trajectory comparison x(y) chart (streamline / pathline / streakline)
 */
import { ROCKER_DEFS, bus, loadLLMConfig, state } from "../core/store.js";
import { formatInlineRichText, formatRichText } from "../math_ui.js";

const VALID_FAMILIES = new Set([
  "kinematics_equation",
  "vortex_flow",
  "rotating_vessel",
  "potential_superposition",
  "falkner_skan",
  "bl_separation",
  "couette_poiseuille",
  "two_layer_poiseuille",
  "slip_herschel_bulkley",
  "hydraulic_jump",
  "sudden_expansion",
  "accelerating_tank",
  "lbm_tunnel",
  "unsupported_3d",
]);

const BAY_SUB_TO_FAMILY = {
  "02:kinematics": "kinematics_equation",
  "02:vortex": "vortex_flow",
  "02:vessel": "rotating_vessel",
  "02:potential": "potential_superposition",
  "03:separation": "bl_separation",
  "03:couette": "couette_poiseuille",
  "03:twolayer": "two_layer_poiseuille",
  "03:slip_hb": "slip_herschel_bulkley",
  "04:lbm": "lbm_tunnel",
  "04:jump": "hydraulic_jump",
  "04:expansion": "sudden_expansion",
  "04:tank": "accelerating_tank",
};

const ENDPOINT_TO_FAMILY = {
  "/api/kinematics": "kinematics_equation",
  "/api/vortex": "vortex_flow",
  "/api/vessel": "rotating_vessel",
  "/api/potential": "potential_superposition",
  "/api/falkner_skan": "falkner_skan",
  "/api/bl_separation": "bl_separation",
  "/api/couette_poiseuille": "couette_poiseuille",
  "/api/two_layer": "two_layer_poiseuille",
  "/api/slip_hb": "slip_herschel_bulkley",
  "/api/hydraulic_jump": "hydraulic_jump",
  "/api/sudden_expansion": "sudden_expansion",
  "/api/accel_tank": "accelerating_tank",
  "/api/lbm_tunnel": "lbm_tunnel",
};

const FAMILY_META = {
  kinematics_equation: {
    label: "Equation Flow (Kinematics)",
    concept_twist: "Unsteady velocity separates streamline, pathline, and streakline; nonzero divergence violates incompressibility.",
    broken_shortcut: "Assuming streamlines match trajectories or streaklines when ∂V/∂t ≠ 0.",
    textbook_ref: "Fluid Kinematics & Flow Lines",
  },
  vortex_flow: {
    label: "Vortex Flow & Bernoulli Trap",
    concept_twist: "Radial pressure balances centrifugal acceleration; Bernoulli applies across streamlines only when Ωz = 0.",
    broken_shortcut: "Applying constant-head Bernoulli across streamlines inside a rotational forced vortex.",
    textbook_ref: "Vortex Flow & Radial Pressure Balance",
  },
  rotating_vessel: {
    label: "Open Rotating Vessel",
    concept_twist: "Open rotating cylinder spills liquid at the top rim before uncovering a dry center base.",
    broken_shortcut: "Assuming trapped liquid volume equals initial fill volume once the paraboloid hits the rim.",
    textbook_ref: "Rotating Vessel Free Surface Paraboloid",
  },
  potential_superposition: {
    label: "Magnus Cylinder & Potential Flow",
    concept_twist: "Superposing uniform stream, doublet, and circulation generates Kutta–Joukowski lift with zero inviscid drag.",
    broken_shortcut: "Expecting stagnation points to stay on the cylinder surface when |Γ| > 4πU∞a.",
    textbook_ref: "Potential Superposition & Magnus Effect",
  },
  falkner_skan: {
    label: "Falkner–Skan Wedge Boundary Layer",
    concept_twist: "Adverse Hartree β < 0 forces positive wall curvature and an inflection point ahead of separation at β ≈ -0.1988.",
    broken_shortcut: "Using Blasius flat-plate friction when streamwise pressure gradient β ≠ 0.",
    textbook_ref: "Falkner–Skan Boundary Layer & Inflection",
  },
  bl_separation: {
    label: "Boundary-Layer Separation",
    concept_twist: "Adverse pressure gradient (dp/dx > 0) forces positive wall curvature and boundary-layer reversal past Λ = -12.",
    broken_shortcut: "Relying on inviscid potential flow (D'Alembert's paradox) which misses wake separation.",
    textbook_ref: "Boundary-Layer Separation & Pressure Gradient",
  },
  couette_poiseuille: {
    label: "Couette–Poiseuille Backflow",
    concept_twist: "Moving-wall shear competes with opposing pressure gradient, reversing wall shear for P < -1 and yielding Q = 0 at P = -3.",
    broken_shortcut: "Assuming a linear Couette profile when axial pressure gradient P ≠ 0.",
    textbook_ref: "Generalized Couette–Poiseuille Backflow",
  },
  two_layer_poiseuille: {
    label: "Two-Layer Immiscible Flow",
    concept_twist: "Shear stress continuity μ1(du1/dy) = μ2(du2/dy) forces a slope kink and off-center peak velocity.",
    broken_shortcut: "Equating velocity gradients du1/dy = du2/dy across unequal-viscosity layers.",
    textbook_ref: "Two-Layer Immiscible Channel Flow",
  },
  slip_herschel_bulkley: {
    label: "Navier Slip & Herschel–Bulkley Plug",
    concept_twist: "Yield stress creates a rigid plug core where |τ| ≤ τ_y while Navier wall slip shifts wall velocity upward.",
    broken_shortcut: "Applying classical no-slip Newtonian Poiseuille flow to slip or yield-stress fluids.",
    textbook_ref: "Navier Wall Slip & Herschel–Bulkley Rheology",
  },
  hydraulic_jump: {
    label: "Hydraulic Jump (Specific Force)",
    concept_twist: "Hydraulic jumps conserve specific force Fs rather than specific energy Es due to turbulent roller dissipation.",
    broken_shortcut: "Setting Es1 = Es2 across a jump and ignoring irreversible eddy head loss hj.",
    textbook_ref: "Open-Channel Hydraulic Jump & Specific Force",
  },
  sudden_expansion: {
    label: "Sudden Pipe Expansion (Borda–Carnot)",
    concept_twist: "Annular corner eddies keep shoulder pressure ~p1, creating irreversible Borda–Carnot head loss.",
    broken_shortcut: "Using lossless Bernoulli Δp = ½ρ(V1² - V2²) across an abrupt pipe enlargement.",
    textbook_ref: "Borda–Carnot Sudden Pipe Expansion",
  },
  accelerating_tank: {
    label: "Accelerating / Free-Fall Tank",
    concept_twist: "Isobars align perpendicular to g_eff = g - a_frame; in free fall (az = -g), g_eff = 0 halts bottom orifice efflux.",
    broken_shortcut: "Using static Torricelli speed √(2gh) inside an accelerating or free-falling tank.",
    textbook_ref: "Accelerating & Free-Falling Tank Hydrostatics",
  },
  lbm_tunnel: {
    label: "2D LBM Wake Tunnel",
    concept_twist: "Viscous D2Q9 flow sheds alternating Kármán vortices past bluff obstacles unless stabilized by a wake splitter.",
    broken_shortcut: "Assuming steady symmetric potential streamlines behind a cylinder at Re ~ 100.",
    textbook_ref: "2D Lattice–Boltzmann Wind Tunnel & Wake",
  },
  unsupported_3d: {
    label: "Outside 2D/1D Scope",
    concept_twist: "3D compressible and turbomachinery flows fall outside built 2D/1D incompressible exact solvers.",
    broken_shortcut: "Extrapolating 2D incompressible Bernoulli across 3D shocks or blade passages.",
    textbook_ref: "3D Compressible & Turbomachinery Regime",
  },
};

const PROMPT_CHIPS = [
  "Why did Bernoulli fail?",
  "Check this shortcut trap",
  "Show exact governing formula",
];

function esc(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function clampNegZeroText(str) {
  return String(str ?? "").replace(
    /(^|[\s=:(\[,${<>~≈≤≥|*+"'])-(0(?:\.0+)?)(?![\d.])/g,
    "$1$2"
  );
}

function clampNum(v, lo, hi, def) {
  const parsed = v === null || v === undefined || v === "" ? def : Number(v);
  const n = Number.isFinite(parsed) ? parsed : def;
  return Math.max(lo, Math.min(hi, n));
}

function roundObstacleCoord(n) {
  return Math.round(n * 10000) / 10000;
}

function formatProviderLabel(rawProvider) {
  const key = String(rawProvider || "offline").toLowerCase().trim();
  if (key.includes("offline")) return "Offline Grounded Coach";
  if (key.includes("gemini")) return "Google Gemini Coach";
  if (key.includes("openai") || key.includes("groq") || key.includes("ollama")) {
    return "OpenAI-Compatible Coach";
  }
  return key.replaceAll("_", " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function sanitizeObstacles(raw) {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set(["circle", "rect", "splitter", "step"]);
  return raw
    .map((o) => {
      if (!o || typeof o !== "object") return null;
      const t = String(o.type || "").toLowerCase();
      if (!allowed.has(t)) return null;
      if (t === "circle") {
        return {
          type: "circle",
          x: roundObstacleCoord(clampNum(o.x, 0.02, 0.95, 0.25)),
          y: roundObstacleCoord(clampNum(o.y, 0.05, 0.95, 0.5)),
          r: roundObstacleCoord(clampNum(o.r, 0.03, 0.35, 0.1)),
        };
      }
      const x0 = roundObstacleCoord(clampNum(o.x0, 0.02, 0.95, 0.3));
      const y0 = roundObstacleCoord(clampNum(o.y0, 0.02, 0.95, 0.45));
      const x1 = roundObstacleCoord(clampNum(o.x1, Math.max(0.05, x0 + 0.01), 0.98, 0.55));
      const y1 = roundObstacleCoord(clampNum(o.y1, Math.max(0.05, y0 + 0.01), 0.98, 0.55));
      return { type: t, x0, y0, x1, y1 };
    })
    .filter(Boolean);
}

export function sanitizeParsedQuery(raw, fallbackFamily = null) {
  if (!raw || typeof raw !== "object") return null;
  const famCand = VALID_FAMILIES.has(raw.family) ? raw.family : fallbackFamily;
  const family = VALID_FAMILIES.has(famCand) ? famCand : "kinematics_equation";
  const meta = FAMILY_META[family] || FAMILY_META.kinematics_equation;

  const cleanAssumptions = {};
  const srcA = raw.assumptions && typeof raw.assumptions === "object" && !Array.isArray(raw.assumptions)
    ? raw.assumptions
    : state.assumptions;
  for (const [k, v] of Object.entries(srcA || {})) {
    cleanAssumptions[String(k)] = Boolean(v);
  }

  const conf = Number(raw.confidence);
  return {
    family,
    confidence: Number.isFinite(conf) ? Math.max(0, Math.min(1, conf)) : 0.95,
    parser_mode: String(raw.parser_mode || "").trim() || "live_lab",
    assumptions: cleanAssumptions,
    params:
      raw.params && typeof raw.params === "object" && !Array.isArray(raw.params)
        ? { ...raw.params }
        : {},
    obstacles: sanitizeObstacles(raw.obstacles),
    concept_twist: String(raw.concept_twist || "").trim() || meta.concept_twist,
    broken_shortcut: String(raw.broken_shortcut || "").trim() || meta.broken_shortcut,
    textbook_ref: String(raw.textbook_ref || "").trim() || meta.textbook_ref,
    unsupported_reason: raw.unsupported_reason ? String(raw.unsupported_reason) : null,
    raw_query: String(raw.raw_query || "").trim() || meta.label,
  };
}

function synthesizeContextFromState() {
  if (state.activeView === "01" && state.s1?.lastParsed) {
    return {
      parsed: sanitizeParsedQuery(state.s1.lastParsed),
      solverData: state.s1.lastSolverData ?? null,
    };
  }
  if (state.activeView === "05") {
    const twists = state.s5?.twists || [];
    const prob = twists[state.s5?.activeIndex || 0];
    if (prob && state.s5?.checked) {
      const fam = ENDPOINT_TO_FAMILY[prob.endpoint] || "kinematics_equation";
      return {
        parsed: sanitizeParsedQuery({
          family: fam,
          confidence: 1.0,
          parser_mode: "quiz_verified",
          assumptions: { ...state.assumptions },
          params: prob.payload || {},
          concept_twist: prob.options?.[prob.correct_index] || prob.title,
          broken_shortcut: prob.tempting_shortcut,
          textbook_ref: prob.book_ref,
          raw_query: prob.prompt,
        }),
        solverData: state.s5.lastSolvedData ?? null,
      };
    }
    return { parsed: null, solverData: null };
  }
  if (state.activeView === "labs") {
    const bay = state.activeBay || "02";
    const sub =
      bay === "02"
        ? state.bay02Mode
        : bay === "03"
        ? state.bay03Mode
        : state.bay04Mode;
    let fam = BAY_SUB_TO_FAMILY[`${bay}:${sub}`] || "kinematics_equation";
    if (bay === "03" && sub === "separation" && state.s3?.use_falkner_skan) {
      fam = "falkner_skan";
    }
    return {
      parsed: sanitizeParsedQuery({
        family: fam,
        confidence: 1.0,
        parser_mode: "live_lab",
        assumptions: { ...state.assumptions },
        params: {},
      }),
      solverData: state.activeCoachContext?.solverData ?? null,
    };
  }
  return { parsed: null, solverData: null };
}

function applyRichAndKatex(containerEl, rawText, inline = false) {
  if (!containerEl) return;
  const clean = rawText || "";
  containerEl.innerHTML = inline ? formatInlineRichText(clean) : formatRichText(clean);
}

function getBrokenAssumptionLabels(assumptions) {
  const src = assumptions && typeof assumptions === "object" ? assumptions : state.assumptions;
  const broken = [];
  for (const [key, label, , hazardFlag] of ROCKER_DEFS) {
    const val = Boolean(src[key]);
    const isBroken = hazardFlag ? val : !val;
    if (isBroken) {
      broken.push({ key, label: hazardFlag ? label : `Non-${label}` });
    }
  }
  return broken;
}

async function defaultApiPost(url, payload) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Kinematics 3-Panel Animated Visualizer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build and return a self-contained 3-panel kinematics visualization element.
 * Returns { el, destroy } — call destroy() to cancel all RAF loops.
 *
 * Layout:
 *   ┌──────────────────┬──────────────────┐
 *   │  Panel A         │  Panel D         │
 *   │  Dense particle  │  Lagrangian      │
 *   │  field (Euler.)  │  tracker         │
 *   └──────────────────┴──────────────────┘
 *   ┌─────────────────────────────────────┐
 *   │  Trajectory x(y) comparison chart   │
 *   └─────────────────────────────────────┘
 */
function buildKinematicsViz(d) {
  if (!d?.field?.U || !d?.field?.xs || !d?.curves) return null;

  const field  = d.field;
  const curves = d.curves;
  const probe  = d.point_probe || {};
  const [xmin, xmax, ymin, ymax] = field.bounds;
  const xs = field.xs;
  const ys = field.ys;
  const U  = field.U;   // [row][col] row=y, col=x
  const V  = field.V;

  const nx = xs.length;
  const ny = ys.length;

  // ── Bilinear interpolation of U/V ─────────────────────────────────────────
  function sampleUV(wx, wy) {
    if (wx < xmin || wx > xmax || wy < ymin || wy > ymax) return null;
    const tx = (wx - xmin) / (xmax - xmin) * (nx - 1);
    const ty = (wy - ymin) / (ymax - ymin) * (ny - 1);
    const ix = Math.max(0, Math.min(nx - 2, Math.floor(tx)));
    const iy = Math.max(0, Math.min(ny - 2, Math.floor(ty)));
    const fx = tx - ix;
    const fy = ty - iy;

    function blerp(A) {
      const r0 = A[iy]?.[ix];
      const r1 = A[iy]?.[ix + 1];
      const r2 = A[iy + 1]?.[ix];
      const r3 = A[iy + 1]?.[ix + 1];
      if (r0 == null || r1 == null || r2 == null || r3 == null) return null;
      return (r0 * (1 - fx) + r1 * fx) * (1 - fy) + (r2 * (1 - fx) + r3 * fx) * fy;
    }

    const u = blerp(U);
    const v = blerp(V);
    if (u == null || v == null) return null;
    return { u, v, speed: Math.hypot(u, v) };
  }

  // ── World → canvas coordinate mappers ─────────────────────────────────────
  function makeMapper(canvas, padL = 0, padR = 0, padT = 0, padB = 0) {
    return function(wx, wy) {
      const W = canvas.width  - padL - padR;
      const H = canvas.height - padT - padB;
      const cx = padL + (wx - xmin) / (xmax - xmin) * W;
      const cy = padT + (1 - (wy - ymin) / (ymax - ymin)) * H;
      return [cx, cy];
    };
  }

  // ── Speed color: dark-blue (slow) → cyan → white (fast) ───────────────────
  function speedColor(speed, maxSpeed, alpha = 1) {
    const t = Math.min(1, speed / (maxSpeed || 1));
    // dark-indigo → blue-cyan → white
    const r = Math.round(20  + t * 220);
    const g = Math.round(40  + t * 200);
    const b = Math.round(160 + t * 90);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  // Pre-compute max speed from grid
  let _maxSpeed = 0;
  for (let r = 0; r < ny; r++) {
    for (let c = 0; c < nx; c++) {
      const u = U[r]?.[c], v = V[r]?.[c];
      if (u != null && v != null) {
        const spd = Math.hypot(u, v);
        if (Number.isFinite(spd) && spd < 1e4) _maxSpeed = Math.max(_maxSpeed, spd);
      }
    }
  }
  const MAX_SPEED = _maxSpeed || 1;

  const rafIds = [];
  const cleanups = [];

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PANEL A — Dense Eulerian Particle Field
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  function initPanelA(canvas) {
    const ctx2d = canvas.getContext("2d");
    const N_PARTICLES = 350;
    const TAIL_LEN    = 18;   // frames of trail
    const DT          = 0.016; // seconds per frame (60fps)

    function makeParticle() {
      return {
        x: xmin + Math.random() * (xmax - xmin),
        y: ymin + Math.random() * (ymax - ymin),
        trail: [],   // [{x,y,speed}]
        age: Math.random() * 100,
      };
    }

    const particles = Array.from({ length: N_PARTICLES }, makeParticle);

    function stepParticle(p) {
      const sv = sampleUV(p.x, p.y);
      if (!sv || !Number.isFinite(sv.u) || sv.speed > 1e4) {
        // reset if out or singular
        const np = makeParticle();
        p.x = np.x; p.y = np.y; p.trail = []; p.age = 0;
        return;
      }
      p.trail.push({ x: p.x, y: p.y, speed: sv.speed });
      if (p.trail.length > TAIL_LEN) p.trail.shift();

      const scale = Math.min(1 / (sv.speed + 0.01), 2.0); // normalize flow speed
      p.x += sv.u * scale * DT * (xmax - xmin) * 0.5;
      p.y += sv.v * scale * DT * (ymax - ymin) * 0.5;
      p.age++;

      if (p.x < xmin || p.x > xmax || p.y < ymin || p.y > ymax || p.age > 180) {
        const np = makeParticle();
        p.x = np.x; p.y = np.y; p.trail = []; p.age = 0;
      }
    }

    let rafId;
    function draw() {
      const W = canvas.clientWidth  || canvas.width;
      const H = canvas.clientHeight || canvas.height;
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W; canvas.height = H;
      }
      const toC = makeMapper(canvas, 2, 2, 2, 2);

      // Dark gradient background
      ctx2d.fillStyle = "#0a0e1a";
      ctx2d.fillRect(0, 0, W, H);

      // Draw particle trails
      for (const p of particles) {
        stepParticle(p);
        const tlen = p.trail.length;
        if (tlen < 2) continue;
        for (let i = 1; i < tlen; i++) {
          const a0 = p.trail[i - 1];
          const a1 = p.trail[i];
          const frac = i / tlen;
          const alpha = frac * 0.75;
          const col = speedColor(a1.speed, MAX_SPEED, alpha);
          const [x0, y0] = toC(a0.x, a0.y);
          const [x1, y1] = toC(a1.x, a1.y);
          ctx2d.beginPath();
          ctx2d.strokeStyle = col;
          ctx2d.lineWidth = 1.2;
          ctx2d.moveTo(x0, y0);
          ctx2d.lineTo(x1, y1);
          ctx2d.stroke();
        }
        // Bright head dot
        const tail = p.trail[tlen - 1];
        const [hx, hy] = toC(tail.x, tail.y);
        const col = speedColor(tail.speed, MAX_SPEED, 1.0);
        ctx2d.beginPath();
        ctx2d.arc(hx, hy, 1.5, 0, Math.PI * 2);
        ctx2d.fillStyle = col;
        ctx2d.fill();
      }

      // Label
      ctx2d.font = "bold 10px 'Inter', sans-serif";
      ctx2d.fillStyle = "rgba(255,255,255,0.45)";
      ctx2d.fillText("EULERIAN FIELD", 8, 14);

      rafId = requestAnimationFrame(draw);
    }

    rafId = requestAnimationFrame(draw);
    rafIds.push(() => cancelAnimationFrame(rafId));
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PANEL D — Lagrangian Particle Tracker
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  function initPanelD(canvas, infoEl) {
    const ctx2d = canvas.getContext("2d");
    const DT    = 0.025;
    const MAX_TRAIL = 300;
    const MAX_STREAK_TAIL = 60;

    // Lagrangian particle starting at seed
    const seedX = Number.isFinite(probe.x) ? probe.x : (xmin + xmax) / 2;
    const seedY = Number.isFinite(probe.y) ? probe.y : (ymin + ymax) / 2;

    const pathParticle = {
      x: seedX, y: seedY,
      trail: [],  // [{x,y}]
      done: false,
    };

    // Streakline: periodically release particles from seed, track tips
    const streakParticles = [];  // [{x,y,trail:[]}]
    let streakTimer = 0;
    const STREAK_INTERVAL = 20; // frames between releases

    // Sim time
    let simTime = 0;

    function stepLagrangian() {
      if (pathParticle.done) return;
      const sv = sampleUV(pathParticle.x, pathParticle.y);
      if (!sv || sv.speed > 1e4) { pathParticle.done = true; return; }
      pathParticle.trail.push({ x: pathParticle.x, y: pathParticle.y, speed: sv.speed });
      if (pathParticle.trail.length > MAX_TRAIL) pathParticle.trail.shift();
      pathParticle.x += sv.u * DT;
      pathParticle.y += sv.v * DT;
      if (pathParticle.x < xmin || pathParticle.x > xmax ||
          pathParticle.y < ymin || pathParticle.y > ymax) {
        pathParticle.done = true;
      }
      simTime += DT;
    }

    function stepStreakline() {
      streakTimer++;
      if (streakTimer % STREAK_INTERVAL === 0 && streakParticles.length < 50) {
        streakParticles.push({ x: seedX, y: seedY, trail: [] });
      }
      for (const sp of streakParticles) {
        const sv = sampleUV(sp.x, sp.y);
        if (!sv || sv.speed > 1e4) continue;
        sp.trail.push({ x: sp.x, y: sp.y });
        if (sp.trail.length > MAX_STREAK_TAIL) sp.trail.shift();
        sp.x += sv.u * DT;
        sp.y += sv.v * DT;
      }
    }

    let rafId;
    function draw() {
      const W = canvas.clientWidth  || canvas.width;
      const H = canvas.clientHeight || canvas.height;
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W; canvas.height = H;
      }
      const toC = makeMapper(canvas, 2, 2, 2, 2);

      ctx2d.fillStyle = "#080d18";
      ctx2d.fillRect(0, 0, W, H);

      stepLagrangian();
      stepStreakline();

      // Draw pathline trail (blue-white gradient)
      const trail = pathParticle.trail;
      for (let i = 1; i < trail.length; i++) {
        const frac = i / trail.length;
        const alpha = frac * 0.9;
        const [x0, y0] = toC(trail[i - 1].x, trail[i - 1].y);
        const [x1, y1] = toC(trail[i].x,     trail[i].y);
        ctx2d.beginPath();
        ctx2d.strokeStyle = `rgba(80,160,255,${alpha})`;
        ctx2d.lineWidth = 2;
        ctx2d.moveTo(x0, y0);
        ctx2d.lineTo(x1, y1);
        ctx2d.stroke();
      }

      // Draw streakline particles (orange trails)
      for (const sp of streakParticles) {
        for (let i = 1; i < sp.trail.length; i++) {
          const frac = i / sp.trail.length;
          const [x0, y0] = toC(sp.trail[i - 1].x, sp.trail[i - 1].y);
          const [x1, y1] = toC(sp.trail[i].x,     sp.trail[i].y);
          ctx2d.beginPath();
          ctx2d.strokeStyle = `rgba(255,160,60,${frac * 0.6})`;
          ctx2d.lineWidth = 1.5;
          ctx2d.moveTo(x0, y0);
          ctx2d.lineTo(x1, y1);
          ctx2d.stroke();
        }
        // tip dot
        const [tx, ty] = toC(sp.x, sp.y);
        ctx2d.beginPath();
        ctx2d.arc(tx, ty, 1.8, 0, Math.PI * 2);
        ctx2d.fillStyle = "rgba(255,180,80,0.9)";
        ctx2d.fill();
      }

      // Seed point marker
      const [sx, sy] = toC(seedX, seedY);
      ctx2d.beginPath();
      ctx2d.arc(sx, sy, 5, 0, Math.PI * 2);
      ctx2d.fillStyle = "rgba(255,255,255,0.15)";
      ctx2d.fill();
      ctx2d.beginPath();
      ctx2d.arc(sx, sy, 5, 0, Math.PI * 2);
      ctx2d.strokeStyle = "rgba(255,255,255,0.8)";
      ctx2d.lineWidth = 1.5;
      ctx2d.stroke();

      // Lagrangian particle glow
      if (!pathParticle.done) {
        const [px, py] = toC(pathParticle.x, pathParticle.y);
        const grd = ctx2d.createRadialGradient(px, py, 0, px, py, 10);
        grd.addColorStop(0, "rgba(100,200,255,0.9)");
        grd.addColorStop(1, "rgba(100,200,255,0)");
        ctx2d.beginPath();
        ctx2d.arc(px, py, 10, 0, Math.PI * 2);
        ctx2d.fillStyle = grd;
        ctx2d.fill();
        ctx2d.beginPath();
        ctx2d.arc(px, py, 3, 0, Math.PI * 2);
        ctx2d.fillStyle = "#fff";
        ctx2d.fill();
      }

      // Label
      ctx2d.font = "bold 10px 'Inter', sans-serif";
      ctx2d.fillStyle = "rgba(255,255,255,0.45)";
      ctx2d.fillText("LAGRANGIAN TRACKER", 8, 14);

      // Update live info card
      if (infoEl) {
        const sv = sampleUV(pathParticle.x, pathParticle.y);
        const spd = sv ? sv.speed.toFixed(3) : "—";
        const px = pathParticle.done ? "out" : pathParticle.x.toFixed(3);
        const py2 = pathParticle.done ? "out" : pathParticle.y.toFixed(3);
        infoEl.innerHTML = `
          <span style="color:#50a0ff">● Pathline</span> &nbsp;
          <span style="color:#ffa040">● Streakline</span>
          <br><span style="opacity:0.65;font-size:10px">
            x: ${px} &nbsp; y: ${py2} &nbsp; |V|: ${spd}
            &nbsp; t: ${simTime.toFixed(2)}s
          </span>`;
      }

      rafId = requestAnimationFrame(draw);
    }

    rafId = requestAnimationFrame(draw);
    rafIds.push(() => cancelAnimationFrame(rafId));
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PANEL C — Trajectory x(y) Comparison Chart (static SVG/canvas)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  function drawTrajectoryChart(canvas) {
    const ctx2d = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;
    const pad = { l: 44, r: 14, t: 20, b: 36 };

    const sl = curves.streamline  || [];
    const pl = curves.pathline    || [];
    const sk = curves.streakline  || [];

    // find data bounds
    const allPts = [...sl, ...pl, ...sk].filter(p => p && p[0] != null && p[1] != null);
    if (allPts.length === 0) {
      ctx2d.fillStyle = "#111";
      ctx2d.fillRect(0, 0, W, H);
      ctx2d.fillStyle = "#888";
      ctx2d.font = "12px Inter";
      ctx2d.fillText("No trajectory data", 20, H / 2);
      return;
    }

    const dxs = allPts.map(p => p[0]);
    const dys = allPts.map(p => p[1]);
    let dxMin = Math.min(...dxs), dxMax = Math.max(...dxs);
    let dyMin = Math.min(...dys), dyMax = Math.max(...dys);
    const dxr = dxMax - dxMin || 1;
    const dyr = dyMax - dyMin || 1;
    dxMin -= dxr * 0.05; dxMax += dxr * 0.05;
    dyMin -= dyr * 0.05; dyMax += dyr * 0.05;

    function toCh(wx, wy) {
      return [
        pad.l + (wx - dxMin) / (dxMax - dxMin) * (W - pad.l - pad.r),
        pad.t + (1 - (wy - dyMin) / (dyMax - dyMin)) * (H - pad.t - pad.b),
      ];
    }

    ctx2d.fillStyle = "#0d1117";
    ctx2d.fillRect(0, 0, W, H);

    // Grid lines
    ctx2d.strokeStyle = "rgba(255,255,255,0.08)";
    ctx2d.lineWidth = 0.5;
    for (let i = 0; i <= 5; i++) {
      const x = pad.l + (i / 5) * (W - pad.l - pad.r);
      const y = pad.t + (i / 5) * (H - pad.t - pad.b);
      ctx2d.beginPath(); ctx2d.moveTo(x, pad.t); ctx2d.lineTo(x, H - pad.b); ctx2d.stroke();
      ctx2d.beginPath(); ctx2d.moveTo(pad.l, y); ctx2d.lineTo(W - pad.r, y); ctx2d.stroke();
    }

    // Axes
    ctx2d.strokeStyle = "rgba(255,255,255,0.3)";
    ctx2d.lineWidth = 1;
    ctx2d.beginPath();
    ctx2d.moveTo(pad.l, pad.t); ctx2d.lineTo(pad.l, H - pad.b); ctx2d.lineTo(W - pad.r, H - pad.b);
    ctx2d.stroke();

    // Axis labels
    ctx2d.font = "10px 'Inter', sans-serif";
    ctx2d.fillStyle = "rgba(255,255,255,0.45)";
    ctx2d.textAlign = "center";
    ctx2d.fillText("x (m)", W / 2, H - 4);
    ctx2d.save();
    ctx2d.translate(12, H / 2);
    ctx2d.rotate(-Math.PI / 2);
    ctx2d.fillText("y (m)", 0, 0);
    ctx2d.restore();
    ctx2d.textAlign = "left";

    // Tick labels
    ctx2d.font = "9px 'Inter', sans-serif";
    ctx2d.fillStyle = "rgba(255,255,255,0.4)";
    for (let i = 0; i <= 4; i++) {
      const wx = dxMin + (i / 4) * (dxMax - dxMin);
      const wy = dyMin + (i / 4) * (dyMax - dyMin);
      const [cx] = toCh(wx, dyMin);
      const [, cy] = toCh(dxMin, wy);
      ctx2d.fillText(wx.toFixed(1), cx - 8, H - pad.b + 12);
      ctx2d.fillText(wy.toFixed(1), 2, cy + 3);
    }

    // Draw curves
    function drawCurve(pts, color, dash = []) {
      if (!pts || pts.length < 2) return;
      ctx2d.beginPath();
      ctx2d.setLineDash(dash);
      ctx2d.strokeStyle = color;
      ctx2d.lineWidth = 2;
      let first = true;
      for (const p of pts) {
        if (!p || p[0] == null || p[1] == null) continue;
        const [cx, cy] = toCh(p[0], p[1]);
        if (first) { ctx2d.moveTo(cx, cy); first = false; }
        else ctx2d.lineTo(cx, cy);
      }
      ctx2d.stroke();
      ctx2d.setLineDash([]);
    }

    drawCurve(sl, "#4fa8ff");        // streamline — blue
    drawCurve(pl, "#ff7c3a");        // pathline   — orange
    drawCurve(sk, "#ffd966", [4,4]); // streakline — yellow dashed

    // Legend
    const LX = pad.l + 8;
    const LY = pad.t + 10;
    ctx2d.font = "9.5px 'Inter', sans-serif";
    [["Streamline", "#4fa8ff", []], ["Pathline", "#ff7c3a", []], ["Streakline", "#ffd966", [4,4]]].forEach(([label, color, dash], i) => {
      const lx = LX + i * 90;
      ctx2d.setLineDash(dash);
      ctx2d.strokeStyle = color;
      ctx2d.lineWidth = 2;
      ctx2d.beginPath(); ctx2d.moveTo(lx, LY); ctx2d.lineTo(lx + 20, LY); ctx2d.stroke();
      ctx2d.setLineDash([]);
      ctx2d.fillStyle = "rgba(255,255,255,0.75)";
      ctx2d.fillText(label, lx + 24, LY + 3.5);
    });

    ctx2d.fillStyle = "rgba(255,255,255,0.4)";
    ctx2d.font = "bold 10px 'Inter', sans-serif";
    ctx2d.fillText("TRAJECTORY COMPARISON", pad.l + 8, H - pad.b - 6);
  }

  // ── Assemble DOM ───────────────────────────────────────────────────────────
  const wrap = document.createElement("div");
  wrap.style.cssText = "display:flex;flex-direction:column;gap:6px;margin-top:10px;";

  // Top row: Panel A + Panel D
  const topRow = document.createElement("div");
  topRow.style.cssText = "display:flex;gap:6px;height:220px;";

  // Panel A wrapper
  const panelAWrap = document.createElement("div");
  panelAWrap.style.cssText = "flex:1;position:relative;border-radius:8px;overflow:hidden;background:#0a0e1a;";
  const canvasA = document.createElement("canvas");
  canvasA.style.cssText = "width:100%;height:100%;display:block;";
  panelAWrap.appendChild(canvasA);

  // Panel D wrapper
  const panelDWrap = document.createElement("div");
  panelDWrap.style.cssText = "flex:1;position:relative;border-radius:8px;overflow:hidden;background:#080d18;";
  const canvasD = document.createElement("canvas");
  canvasD.style.cssText = "width:100%;height:100%;display:block;";
  const infoCard = document.createElement("div");
  infoCard.style.cssText = `
    position:absolute;bottom:6px;left:6px;right:6px;
    background:rgba(0,0,0,0.65);border-radius:5px;
    padding:5px 8px;font-size:11px;line-height:1.5;
    color:#ccc;font-family:'Inter',sans-serif;pointer-events:none;
  `;
  infoCard.textContent = "Tracking particle…";
  panelDWrap.appendChild(canvasD);
  panelDWrap.appendChild(infoCard);

  topRow.appendChild(panelAWrap);
  topRow.appendChild(panelDWrap);

  // Panel C — Trajectory chart below
  const chartWrap = document.createElement("div");
  chartWrap.style.cssText = "border-radius:8px;overflow:hidden;background:#0d1117;height:200px;";
  const canvasC = document.createElement("canvas");
  canvasC.style.cssText = "width:100%;height:100%;display:block;";
  chartWrap.appendChild(canvasC);

  wrap.appendChild(topRow);
  wrap.appendChild(chartWrap);

  // Start animations after first layout
  requestAnimationFrame(() => {
    // Size the canvases
    for (const c of [canvasA, canvasD, canvasC]) {
      const rect = c.parentElement.getBoundingClientRect();
      c.width  = Math.round(rect.width  || 240);
      c.height = Math.round(rect.height || 200);
    }
    initPanelA(canvasA);
    initPanelD(canvasD, infoCard);
    // Trajectory chart is static — draw once (and on resize)
    drawTrajectoryChart(canvasC);
  });

  // Redraw chart on resize
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => {
    const rect = canvasC.parentElement.getBoundingClientRect();
    canvasC.width  = Math.round(rect.width  || 240);
    canvasC.height = Math.round(rect.height || 200);
    drawTrajectoryChart(canvasC);
  }) : null;
  if (ro) ro.observe(chartWrap);
  cleanups.push(() => ro?.disconnect());

  return {
    el: wrap,
    destroy() {
      for (const cancel of rafIds) cancel();
      for (const cleanup of cleanups) cleanup();
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────

export function initCoachDrawer(ctx = {}) {
  const host = document.getElementById("coachDrawerHost");
  if (!host) return;

  if (typeof host._coachCleanup === "function") {
    host._coachCleanup();
  }

  const activeBus = ctx.bus || bus;
  const postFn = ctx.apiPost || defaultApiPost;

  let currentParsed = sanitizeParsedQuery(state.activeCoachContext?.parsedQuery) || null;
  let currentSolverData = state.activeCoachContext?.solverData ?? null;
  let lastReply = null;

  const isQuizLocked = () => state.activeView === "05" && !state.s5?.checked;
  const isOpen = () =>
    host.classList.contains("open") || host.getAttribute("aria-hidden") === "false";

  const clearDrawerDom = () => {
    if (typeof _vizDestroy === "function") { _vizDestroy(); _vizDestroy = null; }
    host.classList.remove("open");
    host.setAttribute("aria-hidden", "true");
    host.innerHTML = "";
  };

  const renderContextBox = () => {
    const ctxBox = host.querySelector("#coachDrawerContext");
    if (!ctxBox) return;

    if (isQuizLocked()) {
      ctxBox.innerHTML = `
        <div class="coach-quiz-lock-card">
          <strong>Predict First Mode Active:</strong> Select an option (A–D) and click
          <em>"Check Prediction &amp; Prove on Canvas"</em> to unlock solver-grounded coaching without spoilers.
        </div>
      `;
      return;
    }

    if (!currentParsed) {
      ctxBox.innerHTML = `
        <div class="coach-context-box">
          <div class="coach-context-family">No Active Solver Scenario</div>
          <div style="font-size:12px;color:var(--ink-secondary);line-height:1.45;">
            Run any Lab (2A–4D) or translate a problem in Station 01 to ground answers to exact residuals.
          </div>
        </div>
      `;
      return;
    }

    const meta = FAMILY_META[currentParsed.family] || {};
    const broken = getBrokenAssumptionLabels(currentParsed.assumptions);
    const chipsHtml = broken.length
      ? broken
          .map(
            (b) =>
              `<span class="coach-assumption-chip coach-chip-broken" data-assumption="${esc(b.key)}">${esc(b.label)}</span>`
          )
          .join("")
      : `<span class="coach-assumption-chip coach-chip-ok">All ideal assumptions hold</span>`;

    ctxBox.innerHTML = `
      <div class="coach-context-box">
        <div class="coach-context-header">
          <span class="coach-context-family">${esc(meta.label || currentParsed.family.replaceAll("_", " "))}</span>
          <span class="coach-citation-text">${esc(currentParsed.textbook_ref)}</span>
        </div>
        <div class="coach-assumption-chips" aria-label="Broken Physics Assumptions">${chipsHtml}</div>
        <div class="coach-context-trap"><strong>Shortcut Trap:</strong> ${esc(currentParsed.broken_shortcut)}</div>
      </div>
    `;
  };

  const renderReply = (reply) => {
    const replyEl = host.querySelector("#coachDrawerReply");
    if (!replyEl) return;
    if (!reply) {
      replyEl.innerHTML = "";
      return;
    }

    replyEl.innerHTML = "";
    const cell = document.createElement("div");
    cell.className = "diag-cell";

    const provRow = document.createElement("div");
    provRow.className = "coach-provider-row";

    const provBadge = document.createElement("span");
    provBadge.className = "coach-provider-badge";
    provBadge.textContent = formatProviderLabel(reply.provider_used);
    provRow.appendChild(provBadge);

    if (reply.textbook_citation) {
      const cite = document.createElement("span");
      cite.className = "coach-citation-text";
      cite.textContent = reply.textbook_citation;
      provRow.appendChild(cite);
    }

    const ansBody = document.createElement("div");
    ansBody.className = "coach-answer-body";
    ansBody.style.marginTop = "8px";
    applyRichAndKatex(ansBody, clampNegZeroText(reply.answer || ""));

    cell.appendChild(provRow);
    cell.appendChild(ansBody);

    const facts = Array.isArray(reply.grounded_facts) ? reply.grounded_facts : [];
    const details = document.createElement("details");
    details.className = "coach-facts-details";

    const summary = document.createElement("summary");
    summary.className = "coach-facts-summary";
    summary.textContent = "View Grounded Telemetry Facts";
    details.appendChild(summary);

    const ul = document.createElement("ul");
    ul.className = "coach-facts-list";
    if (facts.length) {
      for (const f of facts) {
        const li = document.createElement("li");
        applyRichAndKatex(li, clampNegZeroText(f), true);
        ul.appendChild(li);
      }
    } else {
      const li = document.createElement("li");
      li.textContent = "No numerical telemetry residuals returned for this scope.";
      ul.appendChild(li);
    }
    details.appendChild(ul);
    cell.appendChild(details);

    replyEl.appendChild(cell);
  };

  const ask = async (questionText) => {
    const replyEl = host.querySelector("#coachDrawerReply");
    if (!replyEl) return;
    if (isQuizLocked()) {
      renderContextBox();
      replyEl.innerHTML = `<div class="warning-line">Quiz prediction locked — submit A–D first to unlock solver-grounded coaching.</div>`;
      return;
    }

    if (!currentParsed) {
      const fallback = synthesizeContextFromState();
      currentParsed = fallback.parsed;
      currentSolverData = fallback.solverData;
      renderContextBox();
    }

    const validParsed = sanitizeParsedQuery(currentParsed);
    if (!validParsed) {
      replyEl.innerHTML = `<div class="warning-line">Solve or run a physics lab first so the Doubt Coach can anchor to exact solver residuals.</div>`;
      return;
    }

    const cfg = loadLLMConfig();
    state.llmConfig = cfg;

    replyEl.innerHTML = `<div class="diag-cell coach-loading" style="color:var(--ink-secondary);font-size:12px;">Inspecting active solver residuals...</div>`;
    try {
      const reply = await postFn(
        "/api/coach",
        {
          question: questionText,
          parsed: validParsed,
          solver_data: currentSolverData,
          llm_config: cfg,
        },
        "coach"
      );
      lastReply = reply;
      renderReply(reply);
    } catch (err) {
      if (err?.name === "AbortError") return;
      replyEl.innerHTML = `<div class="warning-line">Coach error: ${esc(err?.message || String(err))}</div>`;
    }
  };

  let _vizDestroy = null;

  const openDrawer = (payload = {}) => {
    const candidateParsed = payload?.parsedQuery || state.activeCoachContext?.parsedQuery;
    if (candidateParsed) {
      currentParsed = sanitizeParsedQuery(candidateParsed);
      currentSolverData =
        payload?.solverData ?? state.activeCoachContext?.solverData ?? currentSolverData;
    } else {
      const synth = synthesizeContextFromState();
      currentParsed = synth.parsed;
      currentSolverData = payload?.solverData ?? synth.solverData;
    }

    // Kill any previous animation loops
    if (typeof _vizDestroy === "function") { _vizDestroy(); _vizDestroy = null; }

    const cfg = loadLLMConfig();
    state.llmConfig = cfg;
    const defaultPrompt =
      payload?.suggestedPrompt || "Why doesn't the standard shortcut hold here?";

    const isKinematics = currentParsed?.family === "kinematics_equation" && currentSolverData?.field?.U;
    const vizPlaceholder = isKinematics ? `<div id="coachKinViz"></div>` : "";

    host.classList.add("open");
    host.setAttribute("aria-hidden", "false");
    host.innerHTML = `
      <div class="coach-drawer-header">
        <span class="coach-drawer-title">Solver-Grounded Doubt Coach</span>
        <div class="coach-drawer-actions">
          <span class="coach-provider-badge" id="coachDrawerProviderBadge">${esc(formatProviderLabel(cfg.provider))}</span>
          <button type="button" class="coach-close-btn" id="coachDrawerClose" aria-label="Close Doubt Coach">&times;</button>
        </div>
      </div>
      <div id="coachDrawerContext"></div>
      ${vizPlaceholder}
      <div class="coach-chips-row" id="coachDrawerChips" role="group" aria-label="Quick Coach Prompts"></div>
      <div class="field-group">
        <div class="field-label-row" style="font-size:12px;"><span>Ask a Conceptual Question</span></div>
        <textarea class="text-input" id="coachDrawerQuestion" rows="3" style="font-size:12.5px;line-height:1.45;">${esc(defaultPrompt)}</textarea>
      </div>
      <button type="button" class="btn-machined btn-primary" id="coachDrawerSubmit" style="font-size:12.5px;">Ask Coach (Grounded to Residuals)</button>
      <div id="coachDrawerReply" class="coach-drawer-reply"></div>
    `;

    // Mount kinematics 3-panel viz
    if (isKinematics) {
      const vizHost = host.querySelector("#coachKinViz");
      if (vizHost) {
        const viz = buildKinematicsViz(currentSolverData);
        if (viz) {
          vizHost.appendChild(viz.el);
          _vizDestroy = viz.destroy;
        }
      }
    }

    renderContextBox();
    if (lastReply && !isQuizLocked()) {
      renderReply(lastReply);
    }

    const chipsHost = host.querySelector("#coachDrawerChips");
    if (chipsHost) {
      PROMPT_CHIPS.forEach((chipText) => {
        const chipBtn = document.createElement("button");
        chipBtn.type = "button";
        chipBtn.className = "coach-chip-btn";
        chipBtn.textContent = chipText;
        chipBtn.disabled = isQuizLocked();
        chipBtn.onclick = () => {
          const qInput = host.querySelector("#coachDrawerQuestion");
          if (qInput) qInput.value = chipText;
          ask(chipText);
        };
        chipsHost.appendChild(chipBtn);
      });
    }

    const closeBtn = host.querySelector("#coachDrawerClose");
    if (closeBtn) closeBtn.onclick = clearDrawerDom;

    const qEl = host.querySelector("#coachDrawerQuestion");
    const submitBtn = host.querySelector("#coachDrawerSubmit");
    const triggerSubmit = () => {
      const q = qEl?.value.trim() || "";
      if (q) return ask(q);
      return null;
    };
    if (submitBtn) {
      submitBtn.disabled = isQuizLocked();
      submitBtn.onclick = triggerSubmit;
    }
    if (qEl) {
      qEl.onkeydown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          triggerSubmit();
        }
      };
      try {
        qEl.focus({ preventScroll: true });
      } catch (_) {}
    }
  };

  const onCloseEvent = () => {
    lastReply = null;
    if (!state.activeCoachContext?.parsedQuery) {
      currentParsed = null;
      currentSolverData = null;
    }
    clearDrawerDom();
  };

  const onSolverUpdated = (payload = {}) => {
    const pq = payload?.parsedQuery || state.activeCoachContext?.parsedQuery || null;
    if (pq) {
      currentParsed = sanitizeParsedQuery(pq, payload?.family);
    }
    if (payload?.solverData !== undefined) {
      currentSolverData = payload.solverData;
    } else if (state.activeCoachContext?.solverData !== undefined) {
      currentSolverData = state.activeCoachContext.solverData;
    }
    if (isOpen()) {
      renderContextBox();
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape" && isOpen()) {
      clearDrawerDom();
    }
  };

  const unsubOpen = activeBus.on("coach:open", openDrawer);
  const unsubClose = activeBus.on("coach:close", onCloseEvent);
  const unsubSolver = activeBus.on("solver:updated", onSolverUpdated);
  document.addEventListener("keydown", onKeyDown);

  host._coachCleanup = () => {
    if (typeof _vizDestroy === "function") { _vizDestroy(); _vizDestroy = null; }
    unsubOpen?.();
    unsubClose?.();
    unsubSolver?.();
    document.removeEventListener("keydown", onKeyDown);
  };
}
