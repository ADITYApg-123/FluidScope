/**
 * Central Workbench Store, Frozen Catalogs, Typed Event Bus & LocalStorage Persistence.
 * Frozen contract at Wave 0 for all Stations, Canvas Engines, and Components.
 */

export const LAB_CATALOG = [
  { id: "2A", bay: "02", sub: "kinematics", category: "kinematics", label: "Lab 2A · Equation Flow", shortLabel: "Equation Flow", chapter: "Ch. 3.3 · Ex. 3.10" },
  { id: "2B", bay: "02", sub: "vortex", category: "kinematics", label: "Lab 2B · Vortex Trap", shortLabel: "Vortex Trap", chapter: "Ch. 4.5 · Eq. 4.43" },
  { id: "2C", bay: "02", sub: "vessel", category: "kinematics", label: "Lab 2C · Rotating Vessel", shortLabel: "Rotating Vessel", chapter: "Ch. 4.5 · Ex. 4.8" },
  { id: "2D", bay: "02", sub: "potential", category: "kinematics", label: "Lab 2D · Magnus Cylinder", shortLabel: "Magnus Cylinder", chapter: "Ch. 7 · Kutta–Joukowski" },
  { id: "3A", bay: "03", sub: "separation", category: "viscous", label: "Lab 3A · BL Separation", shortLabel: "BL Separation", chapter: "Ch. 9.6 · Eq. 9.41" },
  { id: "3B", bay: "03", sub: "couette", category: "viscous", label: "Lab 3B · Couette-Poiseuille", shortLabel: "Couette-Poiseuille", chapter: "Ch. 8.3 · Ex. 8.4" },
  { id: "3C", bay: "03", sub: "twolayer", category: "viscous", label: "Lab 3C · Two-Layer (Ex 8.2)", shortLabel: "Two-Layer (Ex 8.2)", chapter: "Ch. 8.3 · Ex. 8.2" },
  { id: "3D", bay: "03", sub: "slip_hb", category: "viscous", label: "Lab 3D · Slip & Herschel-Bulkley", shortLabel: "Slip & Herschel-Bulkley", chapter: "Ch. 1.6 & Ch. 8" },
  { id: "4A", bay: "04", sub: "lbm", category: "conservation", label: "Lab 4A · 2D LBM Tunnel", shortLabel: "2D LBM Tunnel", chapter: "Ch. 10 · Numba D2Q9" },
  { id: "4B", bay: "04", sub: "jump", category: "conservation", label: "Lab 4B · Hydraulic Jump", shortLabel: "Hydraulic Jump", chapter: "Ch. 12.4 · Ex. 12.11" },
  { id: "4C", bay: "04", sub: "expansion", category: "conservation", label: "Lab 4C · Pipe Expansion", shortLabel: "Pipe Expansion", chapter: "Ch. 11.5 · Eq. 11.18" },
  { id: "4D", bay: "04", sub: "tank", category: "conservation", label: "Lab 4D · Accel / Free-Fall Tank", shortLabel: "Accel / Free-Fall Tank", chapter: "Ch. 2.9 · Eq. 2.86" },
];

export const ROCKER_DEFS = [
  ["steady", "Steady", "derived", false],
  ["incompressible", "Incomp.", "derived", false],
  ["irrotational", "Irrotat.", "derived", false],
  ["inviscid", "Inviscid", "perturb", false],
  ["no_slip", "No-Slip", "perturb", false],
  ["newtonian", "Newtonian", "perturb", false],
  ["inertial_frame", "Inertial", "perturb", false],
  ["adverse_pressure_gradient", "dp/dx > 0", "perturb", true],
  ["irreversible_jump", "Shock/Jump", "perturb", true],
];

const QUIZ_SCORES_KEY = "fluidscope_quiz_scores";
const LLM_CONFIG_KEY = "fluidscope_llm_cfg";

const DEFAULT_LLM_CONFIG = {
  provider: "offline",
  api_key: "",
  model: "",
  base_url: "https://api.openai.com/v1",
};

const listeners = new Map();

export const bus = {
  on(event, fn) {
    if (typeof fn !== "function") return () => {};
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(fn);
    return () => this.off(event, fn);
  },
  off(event, fn) {
    const set = listeners.get(event);
    if (set) set.delete(fn);
  },
  emit(event, payload) {
    const set = listeners.get(event);
    if (!set) return;
    for (const fn of Array.from(set)) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[FluidScope bus] Listener error on '${event}':`, err);
      }
    }
  },
};

export function loadQuizScores() {
  try {
    const raw = localStorage.getItem(QUIZ_SCORES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch (_) {}
  return {};
}

export function persistQuizScore(id, correct) {
  const scores = loadQuizScores();
  if (id) {
    scores[String(id)] = Boolean(correct);
  }
  try {
    localStorage.setItem(QUIZ_SCORES_KEY, JSON.stringify(scores));
  } catch (_) {}
  return scores;
}

export function resetQuizScores() {
  try {
    localStorage.removeItem(QUIZ_SCORES_KEY);
  } catch (_) {}
  if (state?.s5) {
    state.s5.scores = {};
  }
  return {};
}

export function loadLLMConfig() {
  try {
    const raw = localStorage.getItem(LLM_CONFIG_KEY);
    if (!raw) return { ...DEFAULT_LLM_CONFIG };
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return {
        provider: String(parsed.provider || DEFAULT_LLM_CONFIG.provider),
        api_key: String(parsed.api_key || ""),
        model: String(parsed.model || ""),
        base_url: String(parsed.base_url || DEFAULT_LLM_CONFIG.base_url),
      };
    }
  } catch (_) {}
  return { ...DEFAULT_LLM_CONFIG };
}

export function persistLLMConfig(cfg) {
  const clean = {
    provider: String(cfg?.provider || DEFAULT_LLM_CONFIG.provider),
    api_key: String(cfg?.api_key || ""),
    model: String(cfg?.model || ""),
    base_url: String(cfg?.base_url || DEFAULT_LLM_CONFIG.base_url),
  };
  try {
    localStorage.setItem(LLM_CONFIG_KEY, JSON.stringify(clean));
  } catch (_) {}
  return clean;
}

export const state = {
  activeView: "overview", // overview | 01 | labs | 05
  activeBay: "02",
  bay02Mode: "kinematics", // kinematics | vortex | vessel | potential
  bay03Mode: "separation", // separation | couette | twolayer | slip_hb
  bay04Mode: "lbm", // lbm | jump | expansion | tank
  llmConfig: loadLLMConfig(),
  assumptions: {
    steady: false,
    incompressible: false,
    inviscid: true,
    irrotational: true,
    no_slip: true,
    newtonian: true,
    inertial_frame: true,
    adverse_pressure_gradient: false,
    irreversible_jump: false,
  },
  assumptionCauses: {
    steady: "",
    incompressible: "",
    irrotational: "",
  },
  equationContext: "ns_x",
  kinParams: {
    u_str: "x / (t + t0)",
    v_str: "v0",
    t0: 1.0,
    v0: 1.0,
    x0: 1.0,
    y0: 0.0,
    t_eval: 2.0,
    loop_cx: 1.5,
    loop_cy: 0.8,
    loop_r: 0.7,
  },
  vortexParams: {
    mode: "forced",
    strength_c: 0.9,
    omega: 10.0,
    core_radius: 0.30,
    radial_c2: -0.35,
    r1: 0.15,
    r2: 0.45,
    r_max: 0.60,
  },
  vesselParams: {
    radius: 0.30,
    vessel_height: 0.503,
    initial_depth: 0.503,
    rpm: 130.0,
  },
  potentialParams: {
    u_inf: 2.0,
    alpha_deg: 0.0,
    doublet_kappa: 12.566,
    gamma: -12.566,
  },
  s1: {
    text: "Compare streamline, pathline and streakline for unsteady velocity u = x/(t + t0), v = v0 at t0 = 1, t = 2",
    lastParsed: null,
    lastSolverData: null,
    lastCoach: null,
  },
  s3: {
    lambda_pg: -6.0,
    beta_fs: -0.15,
    use_falkner_skan: false,
    P_cp: -1.5,
    mu1: 0.005,
    mu2: 0.001,
    dp_dx: -1000.0,
    n_hb: 0.65,
    tau_y: 2.5,
    slip_mm: 0.25,
    plotView: "velocity",
  },
  s4: {
    lbmPreset: "cylinder",
    reynolds: 105.0,
    nSteps: 450,
    customObstacles: null,
    lbmPlotView: "wake",
    lbmScalarMode: "vorticity",
    lbmDrawTool: null,
    lastLbmData: null,
    jumpV1: 6.1,
    jumpH1: 0.305,
    jumpWidth: 6.1,
    jumpPlotView: "es",
    expD1: 0.10,
    expD2: 0.20,
    expV1: 4.0,
    expPlotView: "pressure",
    tankAx: 3.0,
    tankAz: 0.0,
  },
  s5: {
    twists: null,
    activeIndex: 0,
    chosenIdx: null,
    checked: false,
    scores: loadQuizScores(),
    lastSolvedData: null,
  },
  activeCoachContext: {
    parsedQuery: null,
    solverData: null,
    suggestedPrompt: "",
  },
  pendingNavPayload: null,
};
