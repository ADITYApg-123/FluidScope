/**
 * Station 02: Kinematics & Potential/Vortex Labs (2A Equation Flow, 2B Vortex Trap, 2C Rotating Vessel, 2D Magnus Cylinder).
 * Wave 1 Agent C upgrade: paired tabular-nums numeric inputs + units, -0.000 clamping,
 * 2A t0 + classification truth sync + 120ms debounce + dirty formula guard + local/convective card + Ex 3.10 scrubber + drag handles,
 * 2B Water badge + p(r)/H(r)-H1 plot toggle + r1/r2 drag handles + r_max + radial_euler audit,
 * 2C Spin-Up animation, 2D alpha_deg + presets, concise readouts + collapsible Full Diagnostics.
 */
import { fmtNum, OKABE_ITO } from "../core/color_scales.js";
import { renderTex } from "../math_ui.js";
import { displaySolvedFamily } from "./scene_mapper.js";

let activeAnimToken = 0;
let activeFlowDragUnsub = null;
let formulaDirty = false;
let appliedFormula = { u_str: "", v_str: "" };
let cachedVortexData = null;

function fmt(v, d = 3) {
  if (v === null || v === undefined || v === "") return "-";
  return fmtNum(v, d);
}

function roundDec(v, d = 2) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  const f = Math.pow(10, d);
  const r = Math.round(n * f) / f;
  return Object.is(r, -0) ? 0 : r;
}

function finiteOr(val, fallback) {
  if (val === null || val === undefined || val === "") return fallback;
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function prefersReducedMotion() {
  try {
    return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  } catch (_) {
    return false;
  }
}

function stopActiveAnimations() {
  activeAnimToken += 1;
}

function clearFlowDragListener() {
  if (typeof activeFlowDragUnsub === "function") {
    activeFlowDragUnsub();
    activeFlowDragUnsub = null;
  }
}

function unwrapNavPayload(navPayload) {
  if (!navPayload || typeof navPayload !== "object") return null;
  const inner =
    navPayload.payload && typeof navPayload.payload === "object"
      ? navPayload.payload
      : navPayload;
  if (inner.family && inner.params && typeof inner.params === "object") {
    return { ...inner.params, _family: inner.family };
  }
  return inner;
}

function applyIncomingNavPayload(ctx) {
  const np = unwrapNavPayload(ctx.navPayload);
  if (!np) return;
  ctx.navPayload = null;

  const { state } = ctx;
  const m = state.bay02Mode;

  if (m === "kinematics") {
    const kp = state.kinParams;
    if (typeof np.u_str === "string" && np.u_str.trim()) kp.u_str = np.u_str.trim();
    if (typeof np.v_str === "string" && np.v_str.trim()) kp.v_str = np.v_str.trim();
    kp.t0 = Math.max(0.05, finiteOr(np.t0 ?? np.params?.t0, kp.t0));
    kp.v0 = finiteOr(np.v0 ?? np.params?.v0, kp.v0);
    kp.x0 = finiteOr(np.x0, kp.x0);
    kp.y0 = finiteOr(np.y0, kp.y0);
    kp.t_eval = Math.max(kp.t0, finiteOr(np.t_eval, kp.t_eval));
    kp.loop_cx = finiteOr(np.loop_cx ?? np.loop_center?.[0], kp.loop_cx);
    kp.loop_cy = finiteOr(np.loop_cy ?? np.loop_center?.[1], kp.loop_cy);
    kp.loop_r = Math.max(0.1, finiteOr(np.loop_r ?? np.loop_radius, kp.loop_r));
  } else if (m === "vortex") {
    const vp = state.vortexParams;
    if (typeof np.mode === "string" && ["free", "forced", "rankine", "spiral"].includes(np.mode)) {
      vp.mode = np.mode;
    }
    vp.strength_c = finiteOr(np.strength_c, vp.strength_c);
    vp.omega = finiteOr(np.omega, vp.omega);
    vp.core_radius = Math.max(0.05, finiteOr(np.core_radius, vp.core_radius));
    vp.radial_c2 = finiteOr(np.radial_c2, vp.radial_c2);
    vp.r1 = Math.max(0.02, finiteOr(np.r1, vp.r1));
    vp.r2 = Math.max(vp.r1 + 0.03, finiteOr(np.r2, vp.r2));
    vp.r_max = Math.max(vp.r2 + 0.02, finiteOr(np.r_max, vp.r_max ?? 0.6));
  } else if (m === "vessel") {
    const tv = state.vesselParams;
    tv.radius = Math.max(0.1, finiteOr(np.radius, tv.radius));
    tv.vessel_height = Math.max(0.15, finiteOr(np.vessel_height, tv.vessel_height));
    tv.initial_depth = Math.max(0.05, finiteOr(np.initial_depth ?? np.vessel_height, tv.initial_depth));
    tv.rpm = Math.max(0, finiteOr(np.rpm, tv.rpm));
  } else if (m === "potential") {
    const pp = state.potentialParams;
    pp.u_inf = Math.max(0.2, finiteOr(np.u_inf, pp.u_inf));
    pp.alpha_deg = Math.max(-20, Math.min(20, finiteOr(np.alpha_deg, pp.alpha_deg ?? 0)));
    if (Array.isArray(np.sources) && np.sources.length && (!Array.isArray(np.doublets) || !np.doublets.length)) {
      pp.presetMode = "halfbody";
      pp.source_m = finiteOr(np.sources[0]?.m, pp.source_m ?? 12.0);
      pp.source_x = finiteOr(np.sources[0]?.x, -0.5);
      pp.source_y = finiteOr(np.sources[0]?.y, 0.0);
      pp.doublet_kappa = null;
      pp.gamma = 0.0;
    } else {
      const hasExplicitGamma = np.gamma !== undefined;
      const hasVorticesArr = Array.isArray(np.vortices);
      pp.gamma = hasExplicitGamma
        ? finiteOr(np.gamma, pp.gamma)
        : hasVorticesArr
        ? np.vortices.length
          ? finiteOr(np.vortices[0]?.gamma, pp.gamma)
          : 0.0
        : pp.gamma;
      const rawKappa = np.doublet_kappa ?? np.doublets?.[0]?.kappa;
      pp.doublet_kappa = rawKappa !== undefined && rawKappa !== null ? finiteOr(rawKappa, null) : null;
      pp.source_x = null;
      pp.source_y = null;
      pp.presetMode = Math.abs(pp.gamma) < 1e-6 ? "dalembert" : "magnus";
    }
  }
}

function pairedFieldHtml({
  idBase,
  paramName,
  label,
  unit,
  min,
  max,
  step,
  value,
  dec = 2,
  fullWidth = false,
}) {
  const numVal = fmt(value, dec);
  return `
    <div class="field-group" style="min-width:0;${fullWidth ? 'grid-column: 1 / -1;' : ''}">
      <div class="field-label-row" style="font-size:12px;flex-wrap:wrap;gap:4px;">
        <span>${label}</span>
        <span style="display:inline-flex;align-items:center;gap:4px;min-width:0;">
          <input
            type="number"
            id="num${idBase}"
            data-param="${paramName}"
            name="${paramName}"
            min="${min}"
            max="${max}"
            step="${step}"
            value="${numVal}"
            aria-label="${label} (${unit})"
            style="width:66px;max-width:100%;padding:3px 6px;font-family:var(--font-mono);font-size:12px;font-variant-numeric:tabular-nums;font-weight:600;color:var(--ink-primary);background:var(--bg-input);border:1px solid var(--seam-bright);border-radius:4px;text-align:right;"
          />
          <span style="font-family:var(--font-mono);font-size:12px;color:var(--ink-muted);min-width:22px;">${unit}</span>
        </span>
      </div>
      <input type="range" id="rng${idBase}" data-param="${paramName}" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${label} slider" />
    </div>
  `;
}

function bindPairedControl({
  idBase,
  obj,
  key,
  dec = 2,
  clampMin = -Infinity,
  clampMax = Infinity,
  onAfterChange,
}) {
  const rng = document.getElementById(`rng${idBase}`);
  const num = document.getElementById(`num${idBase}`);
  if (!rng || !num) return;

  const syncSliderBounds = (val) => {
    const rMin = parseFloat(rng.min);
    const rMax = parseFloat(rng.max);
    if (Number.isFinite(rMin) && val < rMin) rng.min = String(roundDec(val, dec));
    if (Number.isFinite(rMax) && val > rMax) rng.max = String(roundDec(val, dec));
  };

  rng.oninput = (e) => {
    const val = roundDec(parseFloat(e.target.value), dec);
    obj[key] = val;
    num.value = fmt(val, dec);
    onAfterChange?.(val, "range");
  };

  num.oninput = (e) => {
    const raw = parseFloat(e.target.value);
    if (!Number.isFinite(raw)) return;
    const clamped = Math.max(clampMin, Math.min(clampMax, raw));
    obj[key] = clamped;
    syncSliderBounds(clamped);
    rng.value = String(clamped);
    onAfterChange?.(clamped, "number-input");
  };

  num.onchange = () => {
    const raw = parseFloat(num.value);
    const val = Number.isFinite(raw) ? Math.max(clampMin, Math.min(clampMax, raw)) : obj[key];
    const clean = roundDec(val, dec);
    obj[key] = clean;
    syncSliderBounds(clean);
    rng.value = String(clean);
    num.value = fmt(clean, dec);
    onAfterChange?.(clean, "number-commit");
  };
}

function syncPairedValues(idBase, val, dec = 2) {
  const rng = document.getElementById(`rng${idBase}`);
  const num = document.getElementById(`num${idBase}`);
  const clean = roundDec(val, dec);
  if (rng) {
    const rMin = parseFloat(rng.min);
    const rMax = parseFloat(rng.max);
    if (Number.isFinite(rMin) && clean < rMin) rng.min = String(clean);
    if (Number.isFinite(rMax) && clean > rMax) rng.max = String(clean);
    rng.value = String(clean);
  }
  if (num) num.value = fmt(clean, dec);
}

function appendFullDiagnosticsDetails(cards = [], texItems = []) {
  const body = document.getElementById("drawerBody");
  if (!body) return;
  const existing = body.querySelector(".diag-full-details");
  if (existing) existing.remove();

  if (!cards.length && !texItems.length) return;
  const details = document.createElement("details");
  details.className = "diag-full-details";
  details.style.cssText =
    "margin-top:10px;border:1px solid var(--seam);border-radius:6px;background:var(--bg-input);padding:8px 10px;font-size:12px;";

  const summary = document.createElement("summary");
  summary.style.cssText =
    "cursor:pointer;font-weight:600;color:var(--ink-primary);font-size:12.5px;user-select:none;";
  summary.textContent = "Full Diagnostics & Symbolic Expressions";
  details.appendChild(summary);

  const grid = document.createElement("div");
  grid.className = "diag-grid";
  grid.style.marginTop = "8px";

  for (const item of cards) {
    const cell = document.createElement("div");
    cell.className = "diag-cell";
    const kEl = document.createElement("div");
    kEl.className = "diag-key";
    kEl.style.fontSize = "12px";
    kEl.textContent = item.k;
    const vEl = document.createElement("div");
    vEl.className = `diag-val ${item.tone || ""}`;
    vEl.style.fontSize = "12.5px";
    vEl.textContent = item.v ?? "";
    cell.appendChild(kEl);
    cell.appendChild(vEl);
    grid.appendChild(cell);
  }

  for (const t of texItems) {
    if (!t.tex) continue;
    const cell = document.createElement("div");
    cell.className = "diag-cell";
    const kEl = document.createElement("div");
    kEl.className = "diag-key";
    kEl.style.fontSize = "12px";
    kEl.textContent = t.k;
    const vEl = document.createElement("div");
    vEl.className = "diag-val";
    vEl.style.fontSize = "12.5px";
    renderTex(vEl, t.tex, false);
    cell.appendChild(kEl);
    cell.appendChild(vEl);
    grid.appendChild(cell);
  }

  details.appendChild(grid);
  body.appendChild(details);
}

function enhanceKinematicsDrawer(d) {
  const body = document.getElementById("drawerBody");
  if (!body || !d) return;
  const pr = d.point_probe || {};
  const expr = d.expressions || {};
  const st = d.stokes_check || {};
  const grid = body.querySelector(".diag-grid");
  if (!grid) return;

  // Render an unmistakable Local vs. Convective Acceleration Breakdown Card with both numbers and KaTeX TeX
  const breakdownCard = document.createElement("div");
  breakdownCard.className = "diag-cell";
  breakdownCard.id = "kinAccelBreakdownCard";
  breakdownCard.style.cssText =
    "grid-column: 1 / -1; border-color: var(--accent-border); background: var(--accent-soft);";
  breakdownCard.innerHTML = `
    <div class="diag-key" style="font-size:12px;color:var(--cobalt-ink);">Local vs. Convective Acceleration Breakdown</div>
    <div class="diag-val" style="font-size:12.5px;display:grid;grid-template-columns:repeat(auto-fit, minmax(min(100%, 160px), 1fr));gap:8px;margin-top:6px;">
      <div>
        <div><strong>ax_local</strong> = ${fmt(pr.ax_local, 3)} m/s²</div>
        <div><strong>ax_convective</strong> = ${fmt(pr.ax_convective, 3)} m/s²</div>
        <div><strong>Total ax</strong> = ${fmt(pr.ax, 3)} m/s²</div>
      </div>
      <div>
        <div><strong>ay_local</strong> = ${fmt(pr.ay_local, 3)} m/s²</div>
        <div><strong>ay_convective</strong> = ${fmt(pr.ay_convective, 3)} m/s²</div>
        <div><strong>Total ay</strong> = ${fmt(pr.ay, 3)} m/s²</div>
      </div>
    </div>
    <div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:12px;font-size:12.5px;color:var(--ink-primary);">
      <span id="kinAxLocTex"></span>
      <span id="kinAxConvTex"></span>
    </div>
  `;

  // Replace the generic ax card if present, or prepend cleanly keeping concise 5 cards total
  const cards = Array.from(grid.children);
  const existingAx = cards.find((c) => c.textContent.includes("Local vs. Convective Accel (x)"));
  if (existingAx) existingAx.remove();
  const existingSymAx = cards.find((c) => c.textContent.includes("Symbolic Accel Split"));
  if (existingSymAx) existingSymAx.remove();

  grid.prepend(breakdownCard);
  renderTex(
    breakdownCard.querySelector("#kinAxLocTex"),
    `a_{x,\\text{loc}} = ${expr.ax_local_tex || "0"}`,
    false
  );
  renderTex(
    breakdownCard.querySelector("#kinAxConvTex"),
    `a_{x,\\text{conv}} = ${expr.ax_conv_tex || "0"}`,
    false
  );

  appendFullDiagnosticsDetails(
    [
      {
        k: "Probe Coordinates (x₀, y₀, t)",
        v: `(${fmt(pr.x, 2)}, ${fmt(pr.y, 2)}) m at t = ${fmt(pr.t, 2)} s`,
      },
      {
        k: "Probe Velocity (u, v, |V|)",
        v: `u = ${fmt(pr.u, 3)}, v = ${fmt(pr.v, 3)}, |V| = ${fmt(pr.speed, 3)} m/s`,
      },
      {
        k: "Rotation Rate ωz & Divergence",
        v: `ωz = ${fmt(pr.rotation_z, 3)} s⁻¹ | div = ${fmt(pr.divergence, 3)} s⁻¹`,
      },
      {
        k: "Stokes Singularity Check",
        v: st.singularity_suspected
          ? "Singularity detected inside loop disk"
          : "Smooth interior across loop disk",
        tone: st.singularity_suspected ? "coral" : "ok",
      },
    ],
    [
      { k: "u(x, y, t)", tex: `u = ${expr.u_tex || ""}` },
      { k: "v(x, y, t)", tex: `v = ${expr.v_tex || ""}` },
      { k: "ay Local", tex: `a_{y,\\text{loc}} = ${expr.ay_local_tex || "0"}` },
      { k: "ay Convective", tex: `a_{y,\\text{conv}} = ${expr.ay_conv_tex || "0"}` },
      { k: "Shear Rate γ̇_xy", tex: `\\dot{\\gamma}_{xy} = ${expr.shear_rate_tex || "0"}` },
    ]
  );
}

function computeKinRequestBounds(kp) {
  const xs = [
    kp.x0,
    kp.x0 + 2.2,
    kp.loop_cx - kp.loop_r - 0.5,
    kp.loop_cx + kp.loop_r + 0.5,
  ];
  const ys = [
    kp.y0,
    kp.y0 + kp.v0 * Math.max(0.5, kp.t_eval - kp.t0) + 0.6,
    kp.loop_cy - kp.loop_r - 0.5,
    kp.loop_cy + kp.loop_r + 0.5,
  ];
  if (kp.u_str.includes("y") && kp.u_str.includes("x")) {
    return [-2.6, 2.6, -2.6, 2.6];
  }
  return [
    Math.min(...xs) - 0.8,
    Math.max(...xs) + 1.2,
    Math.min(...ys) - 0.6,
    Math.max(...ys) + 1.0,
  ];
}

function updateFormulaDirtyUI(kp) {
  const inU = document.getElementById("inU");
  const inV = document.getElementById("inV");
  const btn = document.getElementById("btnRunKin");
  const badge = document.getElementById("kinFormulaStatus");
  if (!inU || !inV || !btn) return;
  formulaDirty =
    inU.value.trim() !== appliedFormula.u_str.trim() ||
    inV.value.trim() !== appliedFormula.v_str.trim();
  if (formulaDirty) {
    btn.textContent = "Apply Edited u, v Equations";
    btn.style.boxShadow = "0 0 0 2px var(--amber-border)";
    btn.style.borderColor = "var(--amber-ink)";
    btn.style.background = "var(--amber-ink)";
    if (badge) {
      badge.textContent = "Edited (Click Apply)";
      badge.style.display = "inline-block";
    }
  } else {
    btn.textContent = "Apply u, v Equations";
    btn.style.boxShadow = "";
    btn.style.borderColor = "";
    btn.style.background = "";
    if (badge) {
      badge.textContent = "Synced";
      badge.style.display = "none";
    }
  }
}

function wireKinematicsHandles(ctx) {
  const { state, flowEngine, debouncedRun } = ctx;
  const kp = state.kinParams;
  const handles = [
    { id: "seed", kind: "point", x: kp.x0, y: kp.y0, label: "(x₀, y₀)", color: OKABE_ITO.vermilion },
    { id: "stokes_center", kind: "point", x: kp.loop_cx, y: kp.loop_cy, label: "Loop Center", color: OKABE_ITO.green },
    {
      id: "stokes_rim",
      kind: "ring",
      x: kp.loop_cx,
      y: kp.loop_cy,
      r: kp.loop_r,
      minR: 0.15,
      maxR: 2.5,
      fixedCenter: [kp.loop_cx, kp.loop_cy],
      label: "Loop Rim",
      color: OKABE_ITO.green,
    },
  ];

  let lastDragRef = null;
  const handleEvent = (ev) => {
    if (!ev || ev === lastDragRef) return;
    if (state.activeView !== "labs" || state.activeBay !== "02" || state.bay02Mode !== "kinematics") return;
    lastDragRef = ev;

    if (ev.handleId === "seed") {
      kp.x0 = roundDec(ev.x, 2);
      kp.y0 = roundDec(ev.y, 2);
      syncPairedValues("X0", kp.x0, 2);
      syncPairedValues("Y0", kp.y0, 2);
      if (flowEngine?.scene) flowEngine.scene.seedPoint = [kp.x0, kp.y0];
    } else if (ev.handleId === "stokes_center") {
      kp.loop_cx = roundDec(ev.x, 2);
      kp.loop_cy = roundDec(ev.y, 2);
      syncPairedValues("LoopCx", kp.loop_cx, 2);
      syncPairedValues("LoopCy", kp.loop_cy, 2);
      if (flowEngine?.scene?.stokesLoop) {
        flowEngine.scene.stokesLoop.center = [kp.loop_cx, kp.loop_cy];
      }
      const rim = flowEngine?.interactiveHandles?.find((h) => h.id === "stokes_rim");
      if (rim) {
        rim.fixedCenter = [kp.loop_cx, kp.loop_cy];
        rim.x = kp.loop_cx;
        rim.y = kp.loop_cy;
      }
    } else if (ev.handleId === "stokes_rim") {
      const rVal = Number.isFinite(ev.r)
        ? ev.r
        : Math.hypot((ev.x ?? 0) - kp.loop_cx, (ev.y ?? 0) - kp.loop_cy);
      kp.loop_r = Math.max(0.15, Math.min(2.5, roundDec(rVal, 2)));
      syncPairedValues("LoopR", kp.loop_r, 2);
      if (flowEngine?.scene?.stokesLoop) {
        flowEngine.scene.stokesLoop.radius = kp.loop_r;
      }
    } else {
      return;
    }

    if (ev.phase === "commit") {
      debouncedRun("bay02", () => runBay02(ctx), 120);
    }
  };

  flowEngine?.setInteractiveHandles?.(handles, handleEvent);
  clearFlowDragListener();
  if (ctx.bus) {
    activeFlowDragUnsub = ctx.bus.on("flow:drag", handleEvent);
  }
}

function wireVortexHandles(ctx) {
  const { state, flowEngine, debouncedRun } = ctx;
  const vp = state.vortexParams;
  const rMax = vp.r_max ?? 0.6;
  const handles = [
    {
      id: "probe_r1",
      kind: "ring",
      x: 0,
      y: 0,
      r: vp.r1,
      minR: 0.05,
      maxR: Math.max(0.1, roundDec(rMax - 0.04, 2)),
      fixedCenter: [0, 0],
      label: "r₁",
      color: "#475569",
    },
    {
      id: "probe_r2",
      kind: "ring",
      x: 0,
      y: 0,
      r: vp.r2,
      minR: 0.08,
      maxR: rMax,
      fixedCenter: [0, 0],
      label: "r₂",
      color: OKABE_ITO.vermilion,
    },
  ];

  let lastDragRef = null;
  const handleEvent = (ev) => {
    if (!ev || ev === lastDragRef) return;
    if (state.activeView !== "labs" || state.activeBay !== "02" || state.bay02Mode !== "vortex") return;
    lastDragRef = ev;

    const rawR = Number.isFinite(ev.r) ? ev.r : Math.hypot(ev.x ?? 0, ev.y ?? 0);
    if (ev.handleId === "probe_r1") {
      vp.r1 = Math.max(0.05, Math.min(vp.r2 - 0.03, roundDec(rawR, 2)));
      syncPairedValues("R1", vp.r1, 2);
      const h1 = flowEngine?.interactiveHandles?.find((h) => h.id === "probe_r1");
      if (h1) h1.r = vp.r1;
    } else if (ev.handleId === "probe_r2") {
      vp.r2 = Math.max(vp.r1 + 0.03, Math.min(rMax, roundDec(rawR, 2)));
      syncPairedValues("R2", vp.r2, 2);
      const h2 = flowEngine?.interactiveHandles?.find((h) => h.id === "probe_r2");
      if (h2) h2.r = vp.r2;
    } else {
      return;
    }

    if (ev.phase === "commit") {
      debouncedRun("bay02", () => runBay02(ctx), 120);
    }
  };

  flowEngine?.setInteractiveHandles?.(handles, handleEvent);
  clearFlowDragListener();
  if (ctx.bus) {
    activeFlowDragUnsub = ctx.bus.on("flow:drag", handleEvent);
  }
}

function renderVortexSecondaryToggle(ctx) {
  const slot = document.getElementById("secondaryPlotControls");
  if (!slot) return;
  const vp = ctx.state.vortexParams;
  const activeView = vp.plotView === "head" ? "head" : "pressure";
  slot.innerHTML = `
    <div style="display:inline-flex;gap:4px;" role="group" aria-label="Vortex Secondary Plot Metric">
      <button type="button" class="btn-machined btn-xs ${activeView === "pressure" ? "btn-primary" : ""}" id="btnVortexPlotP" data-vortex-plot="pressure" style="font-size:12px;">Pressure p(r)</button>
      <button type="button" class="btn-machined btn-xs ${activeView === "head" ? "btn-primary" : ""}" id="btnVortexPlotH" data-vortex-plot="head" style="font-size:12px;">Total Head H(r) - H₁</button>
    </div>
  `;

  slot.querySelectorAll("[data-vortex-plot]").forEach((btn) => {
    btn.onclick = () => {
      vp.plotView = btn.dataset.vortexPlot === "head" ? "head" : "pressure";
      renderVortexSecondaryToggle(ctx);
      if (cachedVortexData) {
        displaySolvedFamily("vortex_flow", cachedVortexData, ctx, {
          vortexPlotView: vp.plotView,
          vortexCoreRadius: vp.mode === "rankine" ? vp.core_radius : null,
        });
        appendVortexDiagnostics(cachedVortexData, vp);
      } else {
        runBay02(ctx);
      }
    };
  });
}

function appendVortexDiagnostics(d, vp) {
  const pr = d.probes || {};
  appendFullDiagnosticsDetails([
    { k: "Probe Velocities", v: `v₁ = ${fmt(pr.v1, 2)} m/s @ r₁, v₂ = ${fmt(pr.v2, 2)} m/s @ r₂` },
    { k: "Normal Accel a_n = -vθ²/r", v: `r₁: ${fmt(pr.an_r1, 2)} m/s², r₂: ${fmt(pr.an_r2, 2)} m/s²` },
    { k: "Radial Gradient dp/dr", v: `r₁: ${fmt((pr.dp_dx_wall_r1 || 0) / 1000, 2)} kPa/m, r₂: ${fmt((pr.dp_dx_wall_r2 || 0) / 1000, 2)} kPa/m` },
    { k: "Discrepancy Δp_true - Δp_naive", v: `${fmt((pr.dp_discrepancy || 0) / 1000, 3)} kPa`, tone: Math.abs(pr.dp_discrepancy || 0) > 1 ? "coral" : "ok" },
    ...(d.mode === "rankine"
      ? [{ k: "Rankine Core & Total Dip", v: `Rc = ${fmt(vp.core_radius, 2)} m | Total Δz = ${fmt(pr.rankine_total_depression, 3)} m` }]
      : []),
  ]);
}

function renderBay02Controls(ctx) {
  const { state, debouncedRun, renderRockers, refreshAudit, flowEngine } = ctx;
  stopActiveAnimations();
  clearFlowDragListener();
  flowEngine?.setInteractiveHandles?.([], null);

  const host = document.getElementById("bayControls");
  const m = state.bay02Mode;
  const titles = {
    kinematics: "2A · Kinematics & Flow Lines",
    vortex: "2B · Radial Vortex Trap",
    vessel: "2C · Rotating Vessel (Ex. 4.8)",
    potential: "2D · Magnus Lift Cylinder",
  };
  host.innerHTML = `
    <section class="panel-bay">
      <div class="bay-header">
        <span>${titles[m]}</span>
        <span class="tag-mono" style="font-size:12px;">Ch. 3 / 4.5 / 7</span>
      </div>
      <div id="subControls"></div>
    </section>
  `;

  const sub = document.getElementById("subControls");
  if (m === "kinematics") {
    const kp = state.kinParams;
    if (!Number.isFinite(kp.t0)) kp.t0 = 1.0;
    if (!Number.isFinite(kp.loop_cx)) kp.loop_cx = 1.5;
    if (!Number.isFinite(kp.loop_cy)) kp.loop_cy = 0.8;
    if (!Number.isFinite(kp.loop_r)) kp.loop_r = 0.7;
    if (kp.t_eval < kp.t0) kp.t_eval = kp.t0;

    appliedFormula = { u_str: kp.u_str, v_str: kp.v_str };
    formulaDirty = false;
    const tMaxScrub = Math.max(4.0, roundDec(4.0 * kp.t0, 2));

    sub.innerHTML = `
      <div class="preset-row" style="margin-bottom:8px;">
        <button type="button" class="btn-machined" id="preEx310">Ex 3.10 Unsteady</button>
        <button type="button" class="btn-machined" id="preShear">Pure Shear</button>
        <button type="button" class="btn-machined" id="preFreeV">Free Vortex</button>
        <button type="button" class="btn-machined" id="preForcedV">Solid Rotation</button>
      </div>
      <div class="field-group">
        <div class="field-label-row" style="font-size:12px;">
          <span>u(x, y, t) =</span>
          <span class="tag-mono" id="kinFormulaStatus" style="display:none;font-size:12px;color:var(--amber-ink);background:var(--amber-soft);border-color:var(--amber-border);">Edited</span>
        </div>
        <input class="text-input mono-input" id="inU" aria-label="Velocity component u(x,y,t)" />
      </div>
      <div class="field-group" style="margin-top:8px;">
        <div class="field-label-row" style="font-size:12px;"><span>v(x, y, t) =</span></div>
        <input class="text-input mono-input" id="inV" aria-label="Velocity component v(x,y,t)" />
      </div>
      <button type="button" class="btn-machined btn-primary" id="btnRunKin" style="width:100%;margin-top:8px;font-size:12.5px;">Apply u, v Equations</button>
      <div id="kinFormulaError" class="warning-line" style="display:none;margin-top:6px;"></div>

      <div class="grid-2" style="margin-top:10px;">
        ${pairedFieldHtml({ idBase: "Teval", paramName: "t_eval", label: "Eval Time t", unit: "s", min: kp.t0, max: tMaxScrub, step: 0.05, value: kp.t_eval, dec: 2 })}
        ${pairedFieldHtml({ idBase: "T0", paramName: "t0", label: "Ref Time t₀", unit: "s", min: 0.2, max: 3.0, step: 0.1, value: kp.t0, dec: 2 })}
        ${pairedFieldHtml({ idBase: "V0", paramName: "v0", label: "Param v₀", unit: "m/s", min: 0.1, max: 3.0, step: 0.1, value: kp.v0, dec: 2 })}
        ${pairedFieldHtml({ idBase: "LoopR", paramName: "loop_r", label: "Stokes r", unit: "m", min: 0.15, max: 2.0, step: 0.05, value: kp.loop_r, dec: 2 })}
        ${pairedFieldHtml({ idBase: "X0", paramName: "x0", label: "Seed x₀", unit: "m", min: -2.5, max: 3.5, step: 0.1, value: kp.x0, dec: 2 })}
        ${pairedFieldHtml({ idBase: "Y0", paramName: "y0", label: "Seed y₀", unit: "m", min: -2.5, max: 3.0, step: 0.1, value: kp.y0, dec: 2 })}
        ${pairedFieldHtml({ idBase: "LoopCx", paramName: "loop_cx", label: "Loop cx", unit: "m", min: -2.5, max: 3.5, step: 0.1, value: kp.loop_cx, dec: 2 })}
        ${pairedFieldHtml({ idBase: "LoopCy", paramName: "loop_cy", label: "Loop cy", unit: "m", min: -2.5, max: 3.0, step: 0.1, value: kp.loop_cy, dec: 2 })}
      </div>

      <div style="margin-top:10px;padding:8px 10px;border:1px solid var(--seam);border-radius:6px;background:var(--bg-input);display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:6px;">
          <button type="button" class="btn-machined btn-xs" id="btnKinPlay" style="font-size:12px;">&#9654; Play t&#8320;&rarr;4t&#8320;</button>
          <button type="button" class="btn-machined btn-xs" id="btnKinReset" style="font-size:12px;">Reset 2t&#8320;</button>
        </div>
        <span id="kinScrubStatus" style="font-family:var(--font-mono);font-size:12px;font-variant-numeric:tabular-nums;color:var(--ink-secondary);">t = ${fmt(kp.t_eval, 2)} / ${fmt(4 * kp.t0, 2)} s</span>
      </div>
    `;

    document.getElementById("inU").value = kp.u_str;
    document.getElementById("inV").value = kp.v_str;

    const markFormulaEdited = () => updateFormulaDirtyUI(kp);
    document.getElementById("inU").oninput = markFormulaEdited;
    document.getElementById("inV").oninput = markFormulaEdited;

    document.getElementById("btnRunKin").onclick = () => {
      kp.u_str = document.getElementById("inU").value;
      kp.v_str = document.getElementById("inV").value;
      appliedFormula = { u_str: kp.u_str, v_str: kp.v_str };
      updateFormulaDirtyUI(kp);
      runBay02(ctx);
    };

    const scheduleKinSolve = () => {
      const scrubLbl = document.getElementById("kinScrubStatus");
      if (scrubLbl) scrubLbl.textContent = `t = ${fmt(kp.t_eval, 2)} / ${fmt(4 * kp.t0, 2)} s`;
      debouncedRun("bay02", () => runBay02(ctx), 120);
    };

    bindPairedControl({
      idBase: "Teval",
      obj: kp,
      key: "t_eval",
      dec: 2,
      clampMin: kp.t0,
      clampMax: 20.0,
      onAfterChange: scheduleKinSolve,
    });
    bindPairedControl({
      idBase: "T0",
      obj: kp,
      key: "t0",
      dec: 2,
      clampMin: 0.1,
      clampMax: 10.0,
      onAfterChange: () => {
        const rngTeval = document.getElementById("rngTeval");
        const numTeval = document.getElementById("numTeval");
        const newMax = Math.max(4.0, roundDec(4.0 * kp.t0, 2));
        if (rngTeval) {
          rngTeval.min = String(kp.t0);
          rngTeval.max = String(newMax);
        }
        if (numTeval) {
          numTeval.min = String(kp.t0);
          numTeval.max = String(newMax);
        }
        if (kp.t_eval < kp.t0) {
          kp.t_eval = kp.t0;
          syncPairedValues("Teval", kp.t_eval, 2);
        }
        scheduleKinSolve();
      },
    });
    bindPairedControl({ idBase: "V0", obj: kp, key: "v0", dec: 2, clampMin: -5.0, clampMax: 5.0, onAfterChange: scheduleKinSolve });
    bindPairedControl({ idBase: "X0", obj: kp, key: "x0", dec: 2, clampMin: -10, clampMax: 10, onAfterChange: scheduleKinSolve });
    bindPairedControl({ idBase: "Y0", obj: kp, key: "y0", dec: 2, clampMin: -10, clampMax: 10, onAfterChange: scheduleKinSolve });
    bindPairedControl({ idBase: "LoopCx", obj: kp, key: "loop_cx", dec: 2, clampMin: -10, clampMax: 10, onAfterChange: scheduleKinSolve });
    bindPairedControl({ idBase: "LoopCy", obj: kp, key: "loop_cy", dec: 2, clampMin: -10, clampMax: 10, onAfterChange: scheduleKinSolve });
    bindPairedControl({ idBase: "LoopR", obj: kp, key: "loop_r", dec: 2, clampMin: 0.1, clampMax: 4.0, onAfterChange: scheduleKinSolve });

    let isPlaying = false;
    const playBtn = document.getElementById("btnKinPlay");
    const resetBtn = document.getElementById("btnKinReset");

    const stopScrubber = () => {
      isPlaying = false;
      stopActiveAnimations();
      if (playBtn) playBtn.textContent = "\u25B6 Play t\u2080\u21924t\u2080";
    };

    playBtn.onclick = async () => {
      if (isPlaying) {
        stopScrubber();
        return;
      }
      isPlaying = true;
      const token = ++activeAnimToken;
      playBtn.textContent = "\u23F8 Pause";
      const reduced = prefersReducedMotion();
      const tStart = kp.t0;
      const tEnd = Math.max(tStart + 0.2, roundDec(4.0 * kp.t0, 2));
      const dt = reduced ? Math.max(0.2, (tEnd - tStart) / 6) : Math.max(0.08, (tEnd - tStart) / 24);
      if (kp.t_eval >= tEnd - 1e-4) kp.t_eval = tStart;

      while (isPlaying && token === activeAnimToken && playBtn.isConnected && state.activeView === "labs" && state.activeBay === "02" && state.bay02Mode === "kinematics") {
        kp.t_eval = roundDec(Math.min(tEnd, kp.t_eval + dt), 2);
        syncPairedValues("Teval", kp.t_eval, 2);
        const scrubLbl = document.getElementById("kinScrubStatus");
        if (scrubLbl) scrubLbl.textContent = `t = ${fmt(kp.t_eval, 2)} / ${fmt(tEnd, 2)} s`;
        await runBay02(ctx, { preserveScrub: true });
        if (!isPlaying || token !== activeAnimToken || !playBtn.isConnected) break;
        if (kp.t_eval >= tEnd - 1e-4) {
          kp.t_eval = tStart;
          if (reduced) {
            stopScrubber();
            break;
          }
        }
        await new Promise((r) => setTimeout(r, reduced ? 450 : 120));
      }
      if (token === activeAnimToken) stopScrubber();
    };

    resetBtn.onclick = () => {
      stopScrubber();
      kp.t_eval = roundDec(2.0 * kp.t0, 2);
      syncPairedValues("Teval", kp.t_eval, 2);
      const scrubLbl = document.getElementById("kinScrubStatus");
      if (scrubLbl) scrubLbl.textContent = `t = ${fmt(kp.t_eval, 2)} / ${fmt(4 * kp.t0, 2)} s`;
      runBay02(ctx);
    };

    document.getElementById("preEx310").onclick = () => {
      Object.assign(kp, { u_str: "x / (t + t0)", v_str: "v0", x0: 1.0, y0: 0.0, t0: 1.0, t_eval: 2.0, v0: 1.0, loop_cx: 1.5, loop_cy: 0.8, loop_r: 0.7 });
      renderBay02Controls(ctx);
      runBay02(ctx);
    };
    document.getElementById("preShear").onclick = () => {
      Object.assign(kp, { u_str: "1.2 * y + 0.5", v_str: "0", x0: 0.5, y0: 1.0, t0: 1.0, t_eval: 2.2, loop_cx: 1.5, loop_cy: 0.8, loop_r: 0.7 });
      renderBay02Controls(ctx);
      runBay02(ctx);
    };
    document.getElementById("preFreeV").onclick = () => {
      Object.assign(kp, { u_str: "-2*y / (x^2 + y^2 + 0.04)", v_str: "2*x / (x^2 + y^2 + 0.04)", x0: 1.4, y0: 0.0, t0: 1.0, t_eval: 1.8, loop_cx: 1.2, loop_cy: 0.8, loop_r: 0.65 });
      renderBay02Controls(ctx);
      runBay02(ctx);
    };
    document.getElementById("preForcedV").onclick = () => {
      Object.assign(kp, { u_str: "-1.5*y", v_str: "1.5*x", x0: 1.4, y0: 0.0, t0: 1.0, t_eval: 1.8, loop_cx: 0.0, loop_cy: 0.0, loop_r: 0.8 });
      renderBay02Controls(ctx);
      runBay02(ctx);
    };

    wireKinematicsHandles(ctx);
  } else if (m === "vortex") {
    const vp = state.vortexParams;
    vp.r_max = Math.max(vp.r2 + 0.02, finiteOr(vp.r_max, 0.60));
    const isForced = vp.mode === "forced";
    const isFree = vp.mode === "free";
    const isRankine = vp.mode === "rankine";
    const isSpiral = vp.mode === "spiral";
    const rMaxLimit = vp.r_max;

    let slidersHtml = "";
    if (isForced || isRankine) {
      slidersHtml += pairedFieldHtml({
        idBase: "Om",
        paramName: "omega",
        label: "Angular Speed &omega;",
        unit: "rad/s",
        min: 1,
        max: 30,
        step: 0.5,
        value: vp.omega,
        dec: 1,
      });
    }
    if (isFree || isSpiral) {
      slidersHtml += pairedFieldHtml({
        idBase: "C",
        paramName: "strength_c",
        label: "Swirl C",
        unit: "m²/s",
        min: 0.1,
        max: 3.0,
        step: 0.05,
        value: vp.strength_c,
        dec: 2,
      });
    }
    if (isRankine) {
      slidersHtml += pairedFieldHtml({
        idBase: "Rc",
        paramName: "core_radius",
        label: "Core Radius Rc",
        unit: "m",
        min: 0.08,
        max: Math.max(0.55, roundDec(rMaxLimit * 0.85, 2)),
        step: 0.02,
        value: vp.core_radius,
        dec: 2,
      });
    }
    if (isSpiral) {
      slidersHtml += pairedFieldHtml({
        idBase: "C2",
        paramName: "radial_c2",
        label: "Radial C₂",
        unit: "m²/s",
        min: -1.5,
        max: 1.5,
        step: 0.05,
        value: vp.radial_c2,
        dec: 2,
      });
    }
    slidersHtml += pairedFieldHtml({
      idBase: "R1",
      paramName: "r1",
      label: "Inner Probe r₁",
      unit: "m",
      min: 0.05,
      max: Math.max(0.5, roundDec(rMaxLimit - 0.05, 2)),
      step: 0.01,
      value: vp.r1,
      dec: 2,
    });
    slidersHtml += pairedFieldHtml({
      idBase: "R2",
      paramName: "r2",
      label: "Outer Probe r₂",
      unit: "m",
      min: 0.10,
      max: Math.max(0.58, roundDec(rMaxLimit, 2)),
      step: 0.01,
      value: vp.r2,
      dec: 2,
    });
    slidersHtml += pairedFieldHtml({
      idBase: "Rmax",
      paramName: "r_max",
      label: "Domain r_max",
      unit: "m",
      min: 0.40,
      max: 2.00,
      step: 0.05,
      value: rMaxLimit,
      dec: 2,
    });

    sub.innerHTML = `
      <div id="vortexSpecimenBadge" style="margin-bottom:8px;padding:6px 9px;border:1px solid var(--accent-border);background:var(--accent-soft);color:var(--cobalt-ink);border-radius:5px;font-family:var(--font-mono);font-size:12px;font-weight:600;">
        Fluid: Water (&rho; = 1000 kg/m&sup3;)
      </div>
      <div class="field-group">
        <div class="field-label-row" style="font-size:12px;"><span>Vortex Regime</span></div>
        <select class="select-input" id="selVortex">
          <option value="forced" ${isForced ? "selected" : ""}>Forced Vortex (vθ = ωr, Rotational)</option>
          <option value="free" ${isFree ? "selected" : ""}>Free Vortex (vθ = C/r, Ex 4.7)</option>
          <option value="rankine" ${isRankine ? "selected" : ""}>Rankine Combined Vortex</option>
          <option value="spiral" ${isSpiral ? "selected" : ""}>Spiral Free Vortex (Log Spiral)</option>
        </select>
      </div>
      <div class="grid-2" style="margin-top:10px;">
        ${slidersHtml}
      </div>
    `;

    document.getElementById("selVortex").onchange = (e) => {
      vp.mode = e.target.value;
      state.assumptions.irrotational = vp.mode === "free" || vp.mode === "spiral";
      state.assumptions.steady = true;
      renderBay02Controls(ctx);
      renderRockers();
      refreshAudit("radial_euler");
      runBay02(ctx);
    };

    const scheduleVortex = () => debouncedRun("bay02", () => runBay02(ctx), 120);
    bindPairedControl({ idBase: "Om", obj: vp, key: "omega", dec: 1, clampMin: 0.5, clampMax: 50, onAfterChange: scheduleVortex });
    bindPairedControl({ idBase: "C", obj: vp, key: "strength_c", dec: 2, clampMin: 0.05, clampMax: 10, onAfterChange: scheduleVortex });
    bindPairedControl({ idBase: "Rc", obj: vp, key: "core_radius", dec: 2, clampMin: 0.05, clampMax: 1.5, onAfterChange: scheduleVortex });
    bindPairedControl({ idBase: "C2", obj: vp, key: "radial_c2", dec: 2, clampMin: -5, clampMax: 5, onAfterChange: scheduleVortex });
    bindPairedControl({
      idBase: "R1",
      obj: vp,
      key: "r1",
      dec: 2,
      clampMin: 0.02,
      clampMax: 1.9,
      onAfterChange: () => {
        if (vp.r1 >= vp.r2) {
          vp.r2 = roundDec(vp.r1 + 0.03, 2);
          if (vp.r2 > vp.r_max) {
            vp.r_max = roundDec(vp.r2 + 0.05, 2);
            syncPairedValues("Rmax", vp.r_max, 2);
          }
          syncPairedValues("R2", vp.r2, 2);
        }
        scheduleVortex();
      },
    });
    bindPairedControl({
      idBase: "R2",
      obj: vp,
      key: "r2",
      dec: 2,
      clampMin: 0.06,
      clampMax: 1.98,
      onAfterChange: () => {
        if (vp.r2 <= vp.r1) {
          vp.r1 = Math.max(0.02, roundDec(vp.r2 - 0.03, 2));
          syncPairedValues("R1", vp.r1, 2);
        }
        if (vp.r2 >= vp.r_max) {
          vp.r_max = roundDec(vp.r2 + 0.05, 2);
          syncPairedValues("Rmax", vp.r_max, 2);
        }
        scheduleVortex();
      },
    });
    bindPairedControl({
      idBase: "Rmax",
      obj: vp,
      key: "r_max",
      dec: 2,
      clampMin: 0.25,
      clampMax: 3.0,
      onAfterChange: () => {
        if (vp.r2 >= vp.r_max) {
          vp.r2 = Math.max(0.08, roundDec(vp.r_max - 0.03, 2));
          syncPairedValues("R2", vp.r2, 2);
          if (vp.r1 >= vp.r2) {
            vp.r1 = Math.max(0.02, roundDec(vp.r2 - 0.03, 2));
            syncPairedValues("R1", vp.r1, 2);
          }
        }
        const r2El = document.getElementById("rngR2");
        if (r2El) r2El.max = String(vp.r_max);
        scheduleVortex();
      },
    });

    wireVortexHandles(ctx);
  } else if (m === "vessel") {
    const tv = state.vesselParams;
    sub.innerHTML = `
      <div class="grid-2" style="margin-top:4px;">
        ${pairedFieldHtml({ idBase: "Rpm", paramName: "rpm", label: "Spin Speed", unit: "RPM", min: 0, max: 220, step: 1, value: tv.rpm, dec: 0 })}
        ${pairedFieldHtml({ idBase: "H", paramName: "vessel_height", label: "Height H", unit: "m", min: 0.25, max: 0.85, step: 0.005, value: tv.vessel_height, dec: 3 })}
      </div>
      <div class="preset-row" style="margin-top:10px;">
        <button type="button" class="btn-machined btn-primary" id="btnSpinUp" style="font-size:12px;">&#9654; Spin-Up (0 &rarr; Target RPM)</button>
        <button type="button" class="btn-machined" id="preEx48a">Ex 4.8 @ 100 RPM</button>
        <button type="button" class="btn-machined" id="preEx48b">Ex 4.8 @ 130 RPM</button>
      </div>
    `;

    const scheduleVessel = () => debouncedRun("bay02", () => runBay02(ctx), 120);
    bindPairedControl({ idBase: "Rpm", obj: tv, key: "rpm", dec: 0, clampMin: 0, clampMax: 400, onAfterChange: scheduleVessel });
    bindPairedControl({
      idBase: "H",
      obj: tv,
      key: "vessel_height",
      dec: 3,
      clampMin: 0.15,
      clampMax: 1.5,
      onAfterChange: () => {
        tv.initial_depth = tv.vessel_height;
        scheduleVessel();
      },
    });

    let spinningUp = false;
    const spinBtn = document.getElementById("btnSpinUp");
    const stopSpin = () => {
      spinningUp = false;
      stopActiveAnimations();
      if (spinBtn) spinBtn.textContent = "\u25B6 Spin-Up (0 \u2192 Target RPM)";
    };

    spinBtn.onclick = async () => {
      if (spinningUp) {
        stopSpin();
        return;
      }
      const targetRpm = tv.rpm > 10 ? tv.rpm : 130;
      if (prefersReducedMotion()) {
        tv.rpm = targetRpm;
        syncPairedValues("Rpm", tv.rpm, 0);
        await runBay02(ctx);
        return;
      }
      spinningUp = true;
      const token = ++activeAnimToken;
      spinBtn.textContent = "\u23F8 Stop Spin-Up";
      const stepRpm = Math.max(6, Math.round(targetRpm / 14));
      tv.rpm = 0;
      while (spinningUp && token === activeAnimToken && spinBtn.isConnected && state.activeView === "labs" && state.activeBay === "02" && state.bay02Mode === "vessel") {
        syncPairedValues("Rpm", tv.rpm, 0);
        await runBay02(ctx);
        if (!spinningUp || token !== activeAnimToken || !spinBtn.isConnected) break;
        if (tv.rpm >= targetRpm) break;
        tv.rpm = Math.min(targetRpm, tv.rpm + stepRpm);
        await new Promise((r) => setTimeout(r, 95));
      }
      if (token === activeAnimToken) stopSpin();
    };

    document.getElementById("preEx48a").onclick = () => {
      stopSpin();
      tv.rpm = 100;
      tv.vessel_height = 0.503;
      tv.initial_depth = 0.503;
      renderBay02Controls(ctx);
      runBay02(ctx);
    };
    document.getElementById("preEx48b").onclick = () => {
      stopSpin();
      tv.rpm = 130;
      tv.vessel_height = 0.503;
      tv.initial_depth = 0.503;
      renderBay02Controls(ctx);
      runBay02(ctx);
    };
  } else {
    const pp = state.potentialParams;
    if (!Number.isFinite(pp.alpha_deg)) pp.alpha_deg = 0.0;
    if (!Number.isFinite(pp.source_m)) pp.source_m = 12.0;
    const isHalfBody = pp.presetMode === "halfbody";

    sub.innerHTML = `
      <div class="preset-row" style="margin-bottom:8px;">
        <button type="button" class="btn-machined ${!isHalfBody && Math.abs(pp.gamma) > 1e-6 ? "btn-primary" : ""}" id="prePotMagnus">Magnus Lifting Flow</button>
        <button type="button" class="btn-machined ${!isHalfBody && Math.abs(pp.gamma) < 1e-6 ? "btn-primary" : ""}" id="prePotDalembert">Zero-Spin Ideal D'Alembert</button>
        <button type="button" class="btn-machined ${isHalfBody ? "btn-primary" : ""}" id="prePotHalfbody">Rankine Half-Body / Source</button>
      </div>
      <div class="grid-2" style="margin-top:4px;">
        ${pairedFieldHtml({ idBase: "Uinf", paramName: "u_inf", label: "Freestream U∞", unit: "m/s", min: 0.5, max: 5.0, step: 0.1, value: pp.u_inf, dec: 1 })}
        ${pairedFieldHtml({ idBase: "AlphaDeg", paramName: "alpha_deg", label: "Angle of Attack α", unit: "°", min: -20, max: 20, step: 1, value: pp.alpha_deg, dec: 1 })}
        ${
          isHalfBody
            ? pairedFieldHtml({ idBase: "SourceM", paramName: "source_m", label: "Source Strength m", unit: "m²/s", min: 2, max: 25, step: 0.5, value: pp.source_m, dec: 1, fullWidth: true })
            : pairedFieldHtml({ idBase: "Gam", paramName: "gamma", label: "Circulation Γ", unit: "m²/s", min: -25, max: 25, step: 0.5, value: pp.gamma, dec: 1, fullWidth: true })
        }
      </div>
    `;

    const schedulePot = () => debouncedRun("bay02", () => runBay02(ctx), 120);
    bindPairedControl({
      idBase: "Uinf",
      obj: pp,
      key: "u_inf",
      dec: 1,
      clampMin: 0.2,
      clampMax: 15,
      onAfterChange: () => {
        pp.doublet_kappa = null;
        schedulePot();
      },
    });
    bindPairedControl({ idBase: "AlphaDeg", obj: pp, key: "alpha_deg", dec: 1, clampMin: -20, clampMax: 20, onAfterChange: schedulePot });
    if (isHalfBody) {
      bindPairedControl({ idBase: "SourceM", obj: pp, key: "source_m", dec: 1, clampMin: 0.5, clampMax: 40, onAfterChange: schedulePot });
    } else {
      bindPairedControl({ idBase: "Gam", obj: pp, key: "gamma", dec: 1, clampMin: -40, clampMax: 40, onAfterChange: schedulePot });
    }

    document.getElementById("prePotMagnus").onclick = () => {
      Object.assign(pp, {
        u_inf: 2.0,
        alpha_deg: 0.0,
        gamma: -12.566,
        doublet_kappa: null,
        source_x: null,
        source_y: null,
        presetMode: "magnus",
      });
      renderBay02Controls(ctx);
      runBay02(ctx);
    };
    document.getElementById("prePotDalembert").onclick = () => {
      Object.assign(pp, {
        u_inf: 2.0,
        alpha_deg: 0.0,
        gamma: 0.0,
        doublet_kappa: null,
        source_x: null,
        source_y: null,
        presetMode: "dalembert",
      });
      renderBay02Controls(ctx);
      runBay02(ctx);
    };
    document.getElementById("prePotHalfbody").onclick = () => {
      Object.assign(pp, {
        u_inf: 2.0,
        alpha_deg: 0.0,
        gamma: 0.0,
        source_m: 12.0,
        source_x: -0.5,
        source_y: 0.0,
        doublet_kappa: null,
        presetMode: "halfbody",
      });
      renderBay02Controls(ctx);
      runBay02(ctx);
    };
  }
}

async function runBay02(ctx, opts = {}) {
  const {
    state,
    bus,
    apiPost,
    clearSecondaryControls,
    renderRockers,
    refreshAudit,
  } = ctx;

  if (!opts.preserveScrub) {
    clearSecondaryControls();
  }
  const m = state.bay02Mode;
  try {
    if (m === "kinematics") {
      const kp = state.kinParams;
      const errBox = document.getElementById("kinFormulaError");
      if (errBox) errBox.style.display = "none";

      const reqBounds = computeKinRequestBounds(kp);
      const reqPayload = {
        u_str: kp.u_str,
        v_str: kp.v_str,
        params: { t0: kp.t0, v0: kp.v0 },
        x0: kp.x0,
        y0: kp.y0,
        t0: kp.t0,
        t_eval: kp.t_eval,
        bounds: reqBounds,
        loop_center: [kp.loop_cx, kp.loop_cy],
        loop_radius: kp.loop_r,
      };
      const d = await apiPost("/api/kinematics", reqPayload, "activeLab");

      if (d?.classification) {
        state.assumptions.steady = Boolean(d.classification.steady);
        if (d.classification.incompressible !== undefined) {
          state.assumptions.incompressible = Boolean(d.classification.incompressible);
        }
        state.assumptions.irrotational = Boolean(d.classification.irrotational);
        state.assumptionCauses = {
          steady: d.classification.steady ? "∂V/∂t = 0" : "∂V/∂t ≠ 0",
          incompressible: `div = ${fmt(d.point_probe?.divergence, 3)} s⁻¹`,
          irrotational: `Ωz = ${fmt(d.point_probe?.vorticity_z, 3)} s⁻¹`,
        };
        renderRockers();
        refreshAudit("ns_x");
      }

      displaySolvedFamily("kinematics_equation", d, ctx);
      enhanceKinematicsDrawer(d);
      wireKinematicsHandles(ctx);

      if (bus) {
        bus.emit("solver:updated", {
          bay: "02",
          sub: "kinematics",
          family: "kinematics_equation",
          payload: reqPayload,
          solverData: d,
          parsedQuery: {
            family: "kinematics_equation",
            confidence: 1.0,
            parser_mode: "live_lab",
            assumptions: { ...state.assumptions },
            params: reqPayload,
            obstacles: [],
            concept_twist: d.classification?.steady
              ? "Steady velocity field: streamline, pathline, and streakline coincide; inspect Ωz and local vs convective acceleration."
              : "Unsteady flows separate streamline, pathline, and streakline; nonzero divergence violates incompressibility.",
            broken_shortcut: "Assuming streamlines equal particle trajectories or steady streamlines when ∂V/∂t ≠ 0.",
            textbook_ref: "Som, Biswas & Chakraborty Ch. 3.3.3 (Example 3.10)",
            unsupported_reason: null,
            raw_query: `u = ${kp.u_str}, v = ${kp.v_str} at t0 = ${kp.t0}, t = ${kp.t_eval}`,
          },
        });
      }
    } else if (m === "vortex") {
      const vp = state.vortexParams;
      const reqPayload = { ...vp, r_max: vp.r_max ?? 0.60 };
      const d = await apiPost("/api/vortex", reqPayload, "activeLab");
      cachedVortexData = d;

      state.assumptions.steady = true;
      state.assumptions.incompressible = true;
      state.assumptions.irrotational = vp.mode === "free" || vp.mode === "spiral";
      state.assumptionCauses = {
        steady: "∂V/∂t = 0",
        incompressible: "div = 0.000 s⁻¹",
        irrotational:
          vp.mode === "free" || vp.mode === "spiral"
            ? "Ωz = 0.000 s⁻¹ (r > 0)"
            : `Ωz = ${fmt(2 * vp.omega, 3)} s⁻¹`,
      };
      renderRockers();
      refreshAudit("radial_euler");

      displaySolvedFamily("vortex_flow", d, ctx, {
        vortexPlotView: vp.plotView,
        vortexCoreRadius: vp.mode === "rankine" ? vp.core_radius : null,
      });
      renderVortexSecondaryToggle(ctx);
      appendVortexDiagnostics(d, vp);
      wireVortexHandles(ctx);

      if (bus) {
        bus.emit("solver:updated", {
          bay: "02",
          sub: "vortex",
          family: "vortex_flow",
          payload: reqPayload,
          solverData: d,
          parsedQuery: {
            family: "vortex_flow",
            confidence: 1.0,
            parser_mode: "live_lab",
            assumptions: { ...state.assumptions },
            params: reqPayload,
            obstacles: [],
            concept_twist: d.bernoulli_globally_valid
              ? "Free vortex is irrotational outside r=0 so total head H stays constant across streamlines."
              : "Rotational core has Ωz = 2ω ≠ 0 so Bernoulli cannot cross streamlines (∂H/∂n = VΩz/g).",
            broken_shortcut: "Applying constant-head Bernoulli across streamlines in a rotational forced vortex.",
            textbook_ref: "Som, Biswas & Chakraborty Ch. 4.5 (Eq. 4.43–4.60)",
            unsupported_reason: null,
            raw_query: `${vp.mode} vortex from r1=${vp.r1} to r2=${vp.r2}`,
          },
        });
      }
    } else if (m === "vessel") {
      const reqPayload = { ...state.vesselParams };
      const d = await apiPost("/api/vessel", reqPayload, "activeLab");

      state.assumptions.steady = true;
      state.assumptions.incompressible = true;
      state.assumptions.irrotational = false;
      state.assumptionCauses = {
        steady: "∂V/∂t = 0",
        incompressible: "div = 0.000 s⁻¹",
        irrotational: `Ωz = ${fmt(2 * d.omega, 3)} s⁻¹`,
      };
      renderRockers();
      refreshAudit("ns_x");

      displaySolvedFamily("rotating_vessel", d, ctx);
      appendFullDiagnosticsDetails([
        { k: "Angular Velocity ω", v: `${fmt(d.omega, 3)} rad/s` },
        { k: "Cylinder Radius R & Height H", v: `R = ${fmt(d.radius, 3)} m, H = ${fmt(d.vessel_height, 3)} m` },
        { k: "Uncovered Dry Radius R₁", v: `${fmt(d.uncovered_radius, 3)} m` },
        { k: "Peak Rim Gauge Pressure", v: `${fmt((d.p_bottom_gauge?.[d.p_bottom_gauge.length - 1] || 0) / 1000, 3)} kPa` },
      ]);

      if (bus) {
        bus.emit("solver:updated", {
          bay: "02",
          sub: "vessel",
          family: "rotating_vessel",
          payload: reqPayload,
          solverData: d,
          parsedQuery: {
            family: "rotating_vessel",
            confidence: 1.0,
            parser_mode: "live_lab",
            assumptions: { ...state.assumptions },
            params: reqPayload,
            obstacles: [],
            concept_twist: "Open vessel spills over its rim first rather than conserving full initial water volume.",
            broken_shortcut: "Assuming trapped fluid volume equals initial fill volume once paraboloid reaches the top rim.",
            textbook_ref: "Som, Biswas & Chakraborty Ch. 4.5 (Example 4.8)",
            unsupported_reason: null,
            raw_query: `Open rotating vessel at ${reqPayload.rpm} RPM`,
          },
        });
      }
    } else {
      const pp = state.potentialParams;
      const isHalfBody = pp.presetMode === "halfbody";
      const kappa = Number.isFinite(pp.doublet_kappa) ? pp.doublet_kappa : 2 * Math.PI * pp.u_inf * 1.0;
      const reqPayload = isHalfBody
        ? {
            u_inf: pp.u_inf,
            alpha_deg: pp.alpha_deg ?? 0.0,
            sources: [
              {
                x: Number.isFinite(pp.source_x) ? pp.source_x : -0.5,
                y: Number.isFinite(pp.source_y) ? pp.source_y : 0,
                m: pp.source_m ?? 12.0,
              },
            ],
            doublets: [],
            vortices: [],
          }
        : {
            u_inf: pp.u_inf,
            alpha_deg: pp.alpha_deg ?? 0.0,
            doublets: [{ x: 0, y: 0, kappa }],
            vortices: [{ x: 0, y: 0, gamma: pp.gamma }],
          };
      const d = await apiPost("/api/potential", reqPayload, "activeLab");

      state.assumptions.steady = true;
      state.assumptions.incompressible = true;
      state.assumptions.irrotational = true;
      state.assumptionCauses = {
        steady: "∂V/∂t = 0",
        incompressible: "div = 0.000 s⁻¹",
        irrotational: "Ωz = 0.000 s⁻¹ (potential)",
      };
      renderRockers();
      refreshAudit("ns_x");

      displaySolvedFamily("potential_superposition", d, ctx);
      appendFullDiagnosticsDetails([
        { k: "Angle of Attack α", v: `${fmt(pp.alpha_deg ?? 0, 1)}°` },
        { k: "Freestream U∞", v: `${fmt(pp.u_inf, 2)} m/s` },
        { k: "Equivalent Cylinder Radius a", v: d.equivalent_cylinder_radius ? `${fmt(d.equivalent_cylinder_radius, 3)} m` : "None (Source Half-Body)" },
      ]);

      if (bus) {
        bus.emit("solver:updated", {
          bay: "02",
          sub: "potential",
          family: "potential_superposition",
          payload: reqPayload,
          solverData: d,
          parsedQuery: {
            family: "potential_superposition",
            confidence: 1.0,
            parser_mode: "live_lab",
            assumptions: { ...state.assumptions },
            params: reqPayload,
            obstacles: [],
            concept_twist: "Ideal potential flow with Γ predicts Kutta–Joukowski lift but zero D'Alembert drag.",
            broken_shortcut: "Expecting stagnation points to remain on the cylinder wall when |Γ| > 4πU∞a.",
            textbook_ref: "Som, Biswas & Chakraborty Ch. 7 (Potential Flow & Magnus Effect)",
            unsupported_reason: null,
            raw_query: `Magnus cylinder Uinf=${pp.u_inf}, alpha=${pp.alpha_deg ?? 0} deg, Gamma=${pp.gamma}`,
          },
        });
      }
    }
  } catch (err) {
    if (err.name === "AbortError") return;
    const hud = document.getElementById("flowProbeHud");
    if (hud) hud.textContent = `Solver error: ${err.message}`;
    const errBox = document.getElementById("kinFormulaError");
    if (errBox && m === "kinematics") {
      errBox.textContent = `Formula error: ${err.message}`;
      errBox.style.display = "block";
    }
  }
}

export function applyStation02Assumption(key, ctx) {
  const { state, renderRockers, refreshAudit } = ctx;
  const val = state.assumptions[key];
  if (state.bay02Mode === "kinematics" && key === "steady") {
    state.kinParams.u_str = val ? "x / t0" : "x / (t + t0)";
    state.kinParams.v_str = "v0";
    renderBay02Controls(ctx);
    runBay02(ctx);
    return true;
  }
  if (state.bay02Mode === "kinematics" && key === "irrotational") {
    if (val) {
      Object.assign(state.kinParams, { u_str: "x / (t + t0)", v_str: "v0", x0: 1.0, y0: 0.0, t_eval: 2.0 });
      state.assumptions.steady = false;
    } else {
      Object.assign(state.kinParams, { u_str: "1.2 * y + 0.5", v_str: "0", x0: 0.5, y0: 1.0, t_eval: 2.2 });
      state.assumptions.steady = true;
    }
    renderRockers();
    renderBay02Controls(ctx);
    runBay02(ctx);
    return true;
  }
  if (state.bay02Mode === "vortex" && key === "irrotational") {
    state.vortexParams.mode = val ? "free" : "forced";
    renderBay02Controls(ctx);
    refreshAudit("radial_euler");
    runBay02(ctx);
    return true;
  }
  return false;
}

export function renderStation02(ctx) {
  const { state, renderRockers, refreshAudit } = ctx;
  cachedVortexData = null;
  applyIncomingNavPayload(ctx);

  const eqCtx = state.bay02Mode === "vortex" ? "radial_euler" : "ns_x";
  Object.assign(state.assumptions, {
    steady: state.bay02Mode !== "kinematics" || !/\bt\b/.test(state.kinParams.u_str),
    incompressible: state.bay02Mode !== "kinematics",
    inviscid: true,
    irrotational:
      state.bay02Mode === "potential" ||
      state.bay02Mode === "kinematics" ||
      (state.bay02Mode === "vortex" && ["free", "spiral"].includes(state.vortexParams.mode)),
    no_slip: true,
    newtonian: true,
    inertial_frame: true,
    adverse_pressure_gradient: false,
    irreversible_jump: false,
  });
  state.assumptionCauses = {
    steady: state.assumptions.steady ? "∂V/∂t = 0" : "∂V/∂t ≠ 0",
    incompressible: state.bay02Mode === "kinematics" ? "Evaluating..." : "div = 0.000 s⁻¹",
    irrotational: state.assumptions.irrotational ? "Ωz = 0.000 s⁻¹" : "Ωz ≠ 0",
  };
  renderRockers();
  refreshAudit(eqCtx);
  renderBay02Controls(ctx);
  runBay02(ctx);
}
