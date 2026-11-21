/**
 * Station 03: Viscous Twists & Boundary-Layer Separation.
 * Paired tabular-nums inputs + unit tags + fmtNum, secondary metric toggles (incl. cylinder Cp(θ)
 * & analytical Couette-Poiseuille τ(y)), concise drawer + collapsible Full Diagnostics,
 * boundary_layer / ns_x SymPy audits, and ParsedPhysicsQuery coach context emission.
 */
import { fmtNum } from "../core/color_scales.js";
import { renderTex } from "../math_ui.js";
import { displaySolvedFamily } from "./scene_mapper.js";

const VISCOUS_META = {
  falkner_skan: {
    concept_twist:
      "Adverse Hartree β < 0 forces positive wall curvature and an interior inflection point ahead of separation at β ≈ -0.1988.",
    broken_shortcut:
      "Assuming boundary-layer velocity profiles stay monotonic without an inflection point under dp/dx > 0.",
    textbook_ref: "Falkner–Skan Boundary Layer & Inflection",
  },
  bl_separation: {
    concept_twist:
      "Adverse pressure gradient (dp/dx > 0) forces positive wall curvature and boundary-layer reversal past Λ = -12.",
    broken_shortcut:
      "Relying on inviscid potential flow (D'Alembert's paradox) which misses wake separation and pressure drag.",
    textbook_ref: "Boundary-Layer Separation & Pressure Gradient",
  },
  couette_poiseuille: {
    concept_twist:
      "Moving-wall Couette shear competes with opposing pressure gradient, reversing lower-wall shear for P < -1 and reaching Q = 0 at P = -3.",
    broken_shortcut:
      "Assuming a linear Couette velocity profile when a nonzero axial pressure gradient P is present.",
    textbook_ref: "Generalized Couette–Poiseuille Backflow",
  },
  two_layer_poiseuille: {
    concept_twist:
      "At an immiscible liquid interface, velocity and shear stress τ = μ(du/dy) match, producing a slope kink and off-center peak.",
    broken_shortcut:
      "Equating velocity gradients du1/dy = du2/dy across fluids of unequal viscosity.",
    textbook_ref: "Two-Layer Immiscible Channel Flow",
  },
  slip_herschel_bulkley: {
    concept_twist:
      "Yield-stress fluids move as a rigid plug where |τ| ≤ τ_y while Navier wall slip adds nonzero wall speed u_w.",
    broken_shortcut:
      "Applying classical no-slip parabolic Poiseuille flow to slip or yield-stress Herschel–Bulkley fluids.",
    textbook_ref: "Navier Wall Slip & Herschel–Bulkley Rheology",
  },
};

let lastSolvedS3 = { family: null, data: null };

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

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function finiteOr(val, fallback) {
  if (val === null || val === undefined || val === "") return fallback;
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function unwrapNavPayload(navPayload) {
  if (!navPayload || typeof navPayload !== "object") return null;
  const inner =
    navPayload.payload && typeof navPayload.payload === "object"
      ? navPayload.payload
      : navPayload;
  if (inner.params && typeof inner.params === "object") {
    return { ...inner.params, _family: inner.family || navPayload.family };
  }
  return { ...inner, _family: inner.family || navPayload.family };
}

function applyIncomingNavPayload(ctx) {
  const np = unwrapNavPayload(ctx.navPayload);
  if (!np) return;
  ctx.navPayload = null;

  const { state } = ctx;
  const m = state.bay03Mode;
  const p = state.s3;
  if (!p) return;

  if (m === "separation") {
    if (np._family === "falkner_skan" || np.beta !== undefined) {
      p.use_falkner_skan = true;
      p.beta_fs = clamp(roundDec(finiteOr(np.beta, p.beta_fs), 3), -0.198, 1.0);
    } else if (np._family === "bl_separation" || np.lambda_pg !== undefined) {
      p.use_falkner_skan = false;
      p.lambda_pg = clamp(roundDec(finiteOr(np.lambda_pg, p.lambda_pg), 1), -17.5, 10.0);
    }
  } else if (m === "couette") {
    p.P_cp = clamp(roundDec(finiteOr(np.P ?? np.P_cp, p.P_cp), 2), -4.5, 2.5);
  } else if (m === "twolayer") {
    p.mu1 = clamp(finiteOr(np.mu1, p.mu1), 0.0005, 0.012);
    p.mu2 = clamp(finiteOr(np.mu2, p.mu2), 0.0005, 0.012);
    p.dp_dx = clamp(roundDec(finiteOr(np.dp_dx, p.dp_dx), 0), -5000, -100);
  } else if (m === "slip_hb") {
    p.n_hb = clamp(roundDec(finiteOr(np.n ?? np.n_hb, p.n_hb), 2), 0.35, 1.6);
    p.tau_y = clamp(roundDec(finiteOr(np.tau_y, p.tau_y), 1), 0.0, 13.5);
    const slipMm =
      np.slip_length !== undefined
        ? finiteOr(np.slip_length, 0) * 1000
        : finiteOr(np.slip_mm, p.slip_mm);
    p.slip_mm = clamp(roundDec(slipMm, 2), 0.0, 0.8);
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
    <div class="field-group slider-pair"${fullWidth ? ' style="grid-column: 1 / -1;"' : ""}>
      <div class="slider-label-row">
        <span>${label}</span>
        <span class="slider-input-wrap">
          <input
            type="number"
            class="num-input"
            id="num${idBase}"
            data-param="${paramName}"
            name="${paramName}"
            min="${min}"
            max="${max}"
            step="${step}"
            value="${numVal}"
            aria-label="${label} (${unit})"
          />
          <span class="unit-tag">${unit}</span>
        </span>
      </div>
      <input
        type="range"
        id="rng${idBase}"
        data-param="${paramName}"
        min="${min}"
        max="${max}"
        step="${step}"
        value="${value}"
        aria-label="${label} slider"
      />
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
  getVal,
  setVal,
  onAfterChange,
}) {
  const rng = document.getElementById(`rng${idBase}`);
  const num = document.getElementById(`num${idBase}`);
  if (!rng || !num) return;

  const readModel = () => (typeof getVal === "function" ? getVal() : obj[key]);
  const writeModel = (v) => {
    if (typeof setVal === "function") setVal(v);
    else obj[key] = v;
  };

  const syncSliderBounds = (val) => {
    const rMin = parseFloat(rng.min);
    const rMax = parseFloat(rng.max);
    if (Number.isFinite(rMin) && val < rMin) rng.min = String(roundDec(val, dec));
    if (Number.isFinite(rMax) && val > rMax) rng.max = String(roundDec(val, dec));
  };

  rng.oninput = (e) => {
    const raw = parseFloat(e.target.value);
    if (!Number.isFinite(raw)) return;
    const val = roundDec(raw, dec);
    writeModel(val);
    num.value = fmt(val, dec);
    onAfterChange?.(val, "range");
  };

  num.oninput = (e) => {
    const raw = parseFloat(e.target.value);
    if (!Number.isFinite(raw)) return;
    const clamped = clamp(raw, clampMin, clampMax);
    writeModel(clamped);
    syncSliderBounds(clamped);
    rng.value = String(clamped);
    onAfterChange?.(clamped, "number-input");
  };

  num.onchange = () => {
    const raw = parseFloat(num.value);
    const cur = readModel();
    const val = Number.isFinite(raw) ? clamp(raw, clampMin, clampMax) : cur;
    const clean = roundDec(val, dec);
    writeModel(clean);
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

function appendFullDiagnosticsDetails(cards = []) {
  const body = document.getElementById("drawerBody");
  if (!body) return;
  const existing = body.querySelector(".diag-details");
  if (existing) existing.remove();
  if (!Array.isArray(cards) || !cards.length) return;

  const details = document.createElement("details");
  details.className = "diag-details";

  const summary = document.createElement("summary");
  summary.textContent = "Full Diagnostics & Formulas";
  details.appendChild(summary);

  const grid = document.createElement("div");
  grid.className = "diag-grid";

  for (const item of cards) {
    const cell = document.createElement("div");
    cell.className = "diag-cell";
    const kEl = document.createElement("div");
    kEl.className = "diag-key";
    kEl.textContent = item.k || "";
    const vEl = document.createElement("div");
    vEl.className = `diag-val ${item.tone || ""}`;
    if (item.tex) {
      renderTex(vEl, item.tex, false);
    } else if (item.html) {
      vEl.innerHTML = item.html;
    } else {
      vEl.textContent = item.v ?? "";
    }
    cell.appendChild(kEl);
    cell.appendChild(vEl);
    grid.appendChild(cell);
  }

  details.appendChild(grid);
  body.appendChild(details);
}

export function renderStation03(ctx) {
  const {
    state,
    bus,
    apiPost,
    debouncedRun,
    clearSecondaryControls,
    renderRockers,
    refreshAudit,
  } = ctx;

  clearSecondaryControls();
  lastSolvedS3 = { family: null, data: null };

  if (!state.bay03Mode) state.bay03Mode = "separation"; // separation | couette | twolayer | slip_hb
  if (!state.s3) {
    state.s3 = {
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
      sepPlotView: "profile",
      cachedCylinderCp: null,
    };
  }
  const p = state.s3;
  p.plotView = p.plotView === "shear" ? "shear" : "velocity";
  p.sepPlotView = p.sepPlotView === "cp" ? "cp" : "profile";
  if (p.cachedCylinderCp === undefined) p.cachedCylinderCp = null;
  if (!Number.isFinite(p.dp_dx)) p.dp_dx = -1000.0;

  applyIncomingNavPayload(ctx);

  const m = state.bay03Mode;
  const host = document.getElementById("bayControls");
  const titles = {
    separation: "3A · Boundary-Layer Separation",
    couette: "3B · Couette–Poiseuille Backflow",
    twolayer: "3C · Two-Layer Interface",
    slip_hb: "3D · Navier Slip + Yield Plug",
  };

  host.innerHTML = `
    <section class="panel-bay">
      <div class="bay-header">
        <span>${titles[m] || "Viscous & Separation Lab"}</span>
        <span class="tag-mono">Viscous &amp; BL</span>
      </div>
      <div id="s3Sub"></div>
    </section>
  `;

  const sub = document.getElementById("s3Sub");

  const isBayActive = (subMode) =>
    (!state.activeView || state.activeView === "labs") &&
    (!state.activeBay || state.activeBay === "03") &&
    state.bay03Mode === subMode &&
    sub?.isConnected !== false;

  const displayAndAppend = (family, d, options = {}) => {
    lastSolvedS3 = { family, data: d };
    const spec = displaySolvedFamily(family, d, ctx, options);
    appendFullDiagnosticsDetails(spec.deepCards || []);
    return spec;
  };

  const emitSolved = ({ family, subMode, params, solverData, rawQuery }) => {
    if (!bus || typeof bus.emit !== "function") return;
    const meta = VISCOUS_META[family] || VISCOUS_META.bl_separation;
    bus.emit("solver:updated", {
      bay: "03",
      sub: subMode,
      family,
      payload: { ...params },
      solverData,
      parsedQuery: {
        family,
        confidence: 1.0,
        parser_mode: "live_lab",
        assumptions: { ...state.assumptions },
        params: { ...params },
        obstacles: [],
        concept_twist: meta.concept_twist,
        broken_shortcut: meta.broken_shortcut,
        textbook_ref: meta.textbook_ref,
        unsupported_reason: null,
        raw_query: rawQuery,
      },
    });
  };

  const fetchCylinderCpIfNeeded = async () => {
    if (p.cachedCylinderCp) return;
    const modeAtStart = state.bay03Mode;
    const fsAtStart = p.use_falkner_skan;
    try {
      const cpData = await apiPost("/api/bl_separation", { lambda_pg: p.lambda_pg }, "cpHelper");
      if (cpData?.cylinder_cp) {
        p.cachedCylinderCp = cpData.cylinder_cp;
        if (
          isBayActive(modeAtStart) &&
          p.use_falkner_skan === fsAtStart &&
          p.sepPlotView === "cp" &&
          lastSolvedS3.family === "falkner_skan" &&
          lastSolvedS3.data
        ) {
          displayAndAppend("falkner_skan", lastSolvedS3.data, {
            sepPlotView: p.sepPlotView,
            cylinderCp: p.cachedCylinderCp,
          });
        }
      }
    } catch (err) {
      if (err?.name !== "AbortError") {
        const hud = document.getElementById("plotProbeHud");
        if (hud) hud.textContent = `Cp(θ) reference unavailable: ${err.message}`;
      }
    }
  };

  const renderSecondaryToggle = () => {
    const slot = document.getElementById("secondaryPlotControls");
    if (!slot) return;

    if (state.bay03Mode === "separation") {
      slot.innerHTML = `
        <div class="seg-toggle" role="tablist" aria-label="Separation Plot View">
          <button type="button" class="seg-btn ${p.sepPlotView === "profile" ? "active" : ""}" id="btnS3Profile" data-s3-sep="profile" role="tab" aria-selected="${p.sepPlotView === "profile"}">u(y) &amp; Inflection Point</button>
          <button type="button" class="seg-btn ${p.sepPlotView === "cp" ? "active" : ""}" id="btnS3Cp" data-s3-sep="cp" role="tab" aria-selected="${p.sepPlotView === "cp"}">Cylinder Cp(&theta;) Trap (Fig. 9.5)</button>
        </div>
      `;
      slot.querySelectorAll("[data-s3-sep]").forEach((btn) => {
        btn.onclick = () => {
          p.sepPlotView = btn.dataset.s3Sep === "cp" ? "cp" : "profile";
          renderSecondaryToggle();
          if (lastSolvedS3.data && (lastSolvedS3.family === "falkner_skan" || lastSolvedS3.family === "bl_separation")) {
            displayAndAppend(lastSolvedS3.family, lastSolvedS3.data, {
              sepPlotView: p.sepPlotView,
              cylinderCp: lastSolvedS3.data.cylinder_cp || p.cachedCylinderCp,
            });
            if (lastSolvedS3.family === "falkner_skan" && p.sepPlotView === "cp" && !p.cachedCylinderCp) {
              fetchCylinderCpIfNeeded();
            }
          } else {
            run();
          }
        };
      });
    } else {
      const fam =
        state.bay03Mode === "couette"
          ? "couette_poiseuille"
          : state.bay03Mode === "twolayer"
          ? "two_layer_poiseuille"
          : "slip_herschel_bulkley";
      slot.innerHTML = `
        <div class="seg-toggle" role="tablist" aria-label="Viscous Channel Plot Metric">
          <button type="button" class="seg-btn ${p.plotView === "velocity" ? "active" : ""}" id="btnS3Vel" data-s3-view="velocity" role="tab" aria-selected="${p.plotView === "velocity"}">Velocity u(y)</button>
          <button type="button" class="seg-btn ${p.plotView === "shear" ? "active" : ""}" id="btnS3Tau" data-s3-view="shear" role="tab" aria-selected="${p.plotView === "shear"}">Shear Stress &tau;(y)</button>
        </div>
      `;
      slot.querySelectorAll("[data-s3-view]").forEach((btn) => {
        btn.onclick = () => {
          p.plotView = btn.dataset.s3View === "shear" ? "shear" : "velocity";
          renderSecondaryToggle();
          if (lastSolvedS3.family === fam && lastSolvedS3.data) {
            displayAndAppend(fam, lastSolvedS3.data, { plotView: p.plotView });
          } else {
            run();
          }
        };
      });
    }
  };

  const run = async () => {
    try {
      if (state.bay03Mode === "separation") {
        Object.assign(state.assumptions, {
          steady: true,
          incompressible: true,
          inviscid: false,
          irrotational: false,
          no_slip: true,
          newtonian: true,
          inertial_frame: true,
          irreversible_jump: false,
          adverse_pressure_gradient: p.use_falkner_skan ? p.beta_fs < 0 : p.lambda_pg < 0,
        });
        state.assumptionCauses = {
          steady: "∂V/∂t = 0",
          incompressible: "∇·V = 0.000 s⁻¹",
          irrotational: "Ωz ≠ 0 (viscous BL)",
        };
        renderRockers();
        refreshAudit("boundary_layer");
        renderSecondaryToggle();

        if (p.use_falkner_skan) {
          const reqPayload = { beta: p.beta_fs };
          const d = await apiPost("/api/falkner_skan", reqPayload, "activeLab");
          if (!isBayActive("separation") || !p.use_falkner_skan) return;

          displayAndAppend("falkner_skan", d, {
            sepPlotView: p.sepPlotView,
            cylinderCp: p.cachedCylinderCp,
          });
          if (p.sepPlotView === "cp" && !p.cachedCylinderCp) {
            fetchCylinderCpIfNeeded();
          }
          emitSolved({
            family: "falkner_skan",
            subMode: "separation",
            params: reqPayload,
            solverData: d,
            rawQuery: `Falkner–Skan boundary layer at Hartree beta = ${fmt(p.beta_fs, 3)}`,
          });
        } else {
          const reqPayload = { lambda_pg: p.lambda_pg };
          const d = await apiPost("/api/bl_separation", reqPayload, "activeLab");
          if (!isBayActive("separation") || p.use_falkner_skan) return;
          if (d?.cylinder_cp) p.cachedCylinderCp = d.cylinder_cp;

          displayAndAppend("bl_separation", d, {
            sepPlotView: p.sepPlotView,
            cylinderCp: d?.cylinder_cp || p.cachedCylinderCp,
          });
          emitSolved({
            family: "bl_separation",
            subMode: "separation",
            params: reqPayload,
            solverData: d,
            rawQuery: `Pohlhausen boundary-layer separation at Lambda = ${fmt(p.lambda_pg, 1)}`,
          });
        }
      } else if (state.bay03Mode === "couette") {
        Object.assign(state.assumptions, {
          steady: true,
          incompressible: true,
          inviscid: false,
          irrotational: false,
          no_slip: true,
          newtonian: true,
          inertial_frame: true,
          irreversible_jump: false,
          adverse_pressure_gradient: p.P_cp < 0,
        });
        state.assumptionCauses = {
          steady: "∂V/∂t = 0",
          incompressible: "∇·V = 0.000 s⁻¹",
          irrotational: "Ωz ≠ 0 (Couette shear)",
        };
        renderRockers();
        refreshAudit("ns_x");
        renderSecondaryToggle();

        const reqPayload = { P: p.P_cp };
        const d = await apiPost("/api/couette_poiseuille", reqPayload, "activeLab");
        if (!isBayActive("couette")) return;

        displayAndAppend("couette_poiseuille", d, { plotView: p.plotView });
        emitSolved({
          family: "couette_poiseuille",
          subMode: "couette",
          params: reqPayload,
          solverData: d,
          rawQuery: `Generalized Couette-Poiseuille channel flow at P = ${fmt(p.P_cp, 2)}`,
        });
      } else if (state.bay03Mode === "twolayer") {
        Object.assign(state.assumptions, {
          steady: true,
          incompressible: true,
          inviscid: false,
          irrotational: false,
          no_slip: true,
          newtonian: true,
          inertial_frame: true,
          adverse_pressure_gradient: false,
          irreversible_jump: false,
        });
        state.assumptionCauses = {
          steady: "∂V/∂t = 0",
          incompressible: "∇·V = 0.000 s⁻¹",
          irrotational: "Ωz ≠ 0 (viscous channel)",
        };
        renderRockers();
        refreshAudit("ns_x");
        renderSecondaryToggle();

        const reqPayload = { mu1: p.mu1, mu2: p.mu2, dp_dx: p.dp_dx };
        const d = await apiPost("/api/two_layer", reqPayload, "activeLab");
        if (!isBayActive("twolayer")) return;

        displayAndAppend("two_layer_poiseuille", d, { plotView: p.plotView });
        emitSolved({
          family: "two_layer_poiseuille",
          subMode: "twolayer",
          params: reqPayload,
          solverData: d,
          rawQuery: `Two-layer immiscible channel flow mu1=${fmt(p.mu1 * 1000, 1)} mPa·s, mu2=${fmt(p.mu2 * 1000, 1)} mPa·s, dp/dx=${fmt(p.dp_dx, 0)} Pa/m`,
        });
      } else {
        Object.assign(state.assumptions, {
          steady: true,
          incompressible: true,
          inviscid: false,
          irrotational: false,
          no_slip: Math.abs(p.slip_mm) < 1e-6,
          newtonian: Math.abs(p.n_hb - 1) < 0.01 && Math.abs(p.tau_y) < 1e-6,
          inertial_frame: true,
          adverse_pressure_gradient: false,
          irreversible_jump: false,
        });
        state.assumptionCauses = {
          steady: "∂V/∂t = 0",
          incompressible: "∇·V = 0.000 s⁻¹",
          irrotational: "Ωz ≠ 0 (viscous slit)",
        };
        renderRockers();
        refreshAudit("ns_x");
        renderSecondaryToggle();

        const slipMeters = roundDec(p.slip_mm * 1e-3, 6);
        const reqPayload = { n: p.n_hb, tau_y: p.tau_y, slip_length: slipMeters };
        const d = await apiPost("/api/slip_hb", reqPayload, "activeLab");
        if (!isBayActive("slip_hb")) return;

        displayAndAppend("slip_herschel_bulkley", d, { plotView: p.plotView });
        emitSolved({
          family: "slip_herschel_bulkley",
          subMode: "slip_hb",
          params: reqPayload,
          solverData: d,
          rawQuery: `Navier slip + Herschel-Bulkley slit n=${fmt(p.n_hb, 2)}, tau_y=${fmt(p.tau_y, 1)} Pa, ls=${fmt(p.slip_mm, 2)} mm`,
        });
      }
    } catch (err) {
      if (err?.name === "AbortError") return;
      const hud = document.getElementById("flowProbeHud");
      if (hud) hud.textContent = `Solver error: ${err.message}`;
    }
  };

  if (m === "separation") {
    sub.innerHTML = `
      <div class="seg-toggle seg-toggle-full" role="tablist" aria-label="Boundary Layer Solver Formulation">
        <button type="button" class="seg-btn ${!p.use_falkner_skan ? "active" : ""}" id="btnPohl" role="tab" aria-selected="${!p.use_falkner_skan}">Pohlhausen &Lambda;</button>
        <button type="button" class="seg-btn ${p.use_falkner_skan ? "active" : ""}" id="btnFS" role="tab" aria-selected="${p.use_falkner_skan}">Exact Falkner–Skan &beta;</button>
      </div>
      <div style="margin-top:10px;">
        ${
          !p.use_falkner_skan
            ? `${pairedFieldHtml({
                idBase: "S3Lam",
                paramName: "lambda_pg",
                label: "Pressure Gradient Λ",
                unit: "dimless",
                min: -17.5,
                max: 10.0,
                step: 0.5,
                value: p.lambda_pg,
                dec: 1,
                fullWidth: true,
              })}
              <div class="preset-row" style="margin-top:8px;">
                <button type="button" class="btn-machined" id="preSepPt">At Sep (&Lambda; = -12)</button>
                <button type="button" class="btn-machined" id="preBackflow">Backflow (&Lambda; = -16)</button>
                <button type="button" class="btn-machined" id="preZpg">Zero PG (&Lambda; = 0)</button>
              </div>`
            : `${pairedFieldHtml({
                idBase: "S3Beta",
                paramName: "beta",
                label: "Hartree Parameter β",
                unit: "dimless",
                min: -0.198,
                max: 1.0,
                step: 0.001,
                value: p.beta_fs,
                dec: 3,
                fullWidth: true,
              })}
              <div class="preset-row" style="margin-top:8px;">
                <button type="button" class="btn-machined" id="preFsBlasius">Blasius (&beta; = 0)</button>
                <button type="button" class="btn-machined" id="preFsAdverse">Adverse (&beta; = -0.15)</button>
                <button type="button" class="btn-machined" id="preFsSep">Near Sep (&beta; = -0.198)</button>
              </div>`
        }
      </div>
    `;

    document.getElementById("btnPohl").onclick = () => {
      p.use_falkner_skan = false;
      renderStation03(ctx);
    };
    document.getElementById("btnFS").onclick = () => {
      p.use_falkner_skan = true;
      renderStation03(ctx);
    };

    const scheduleSep = () => debouncedRun("bay03", run, 65);
    if (!p.use_falkner_skan) {
      bindPairedControl({
        idBase: "S3Lam",
        obj: p,
        key: "lambda_pg",
        dec: 1,
        clampMin: -18.0,
        clampMax: 12.0,
        onAfterChange: scheduleSep,
      });
      document.getElementById("preSepPt").onclick = () => {
        p.lambda_pg = -12.0;
        syncPairedValues("S3Lam", p.lambda_pg, 1);
        run();
      };
      document.getElementById("preBackflow").onclick = () => {
        p.lambda_pg = -16.0;
        syncPairedValues("S3Lam", p.lambda_pg, 1);
        run();
      };
      document.getElementById("preZpg").onclick = () => {
        p.lambda_pg = 0.0;
        syncPairedValues("S3Lam", p.lambda_pg, 1);
        run();
      };
    } else {
      bindPairedControl({
        idBase: "S3Beta",
        obj: p,
        key: "beta_fs",
        dec: 3,
        clampMin: -0.198,
        clampMax: 2.0,
        onAfterChange: scheduleSep,
      });
      document.getElementById("preFsBlasius").onclick = () => {
        p.beta_fs = 0.0;
        syncPairedValues("S3Beta", p.beta_fs, 3);
        run();
      };
      document.getElementById("preFsAdverse").onclick = () => {
        p.beta_fs = -0.15;
        syncPairedValues("S3Beta", p.beta_fs, 3);
        run();
      };
      document.getElementById("preFsSep").onclick = () => {
        p.beta_fs = -0.198;
        syncPairedValues("S3Beta", p.beta_fs, 3);
        run();
      };
    }
  } else if (m === "couette") {
    sub.innerHTML = `
      ${pairedFieldHtml({
        idBase: "Pcp",
        paramName: "P",
        label: "Pressure Param P = (-dp/dx)H²/(2μU)",
        unit: "dimless",
        min: -4.5,
        max: 2.5,
        step: 0.1,
        value: p.P_cp,
        dec: 2,
        fullWidth: true,
      })}
      <div class="preset-row" style="margin-top:8px;">
        <button type="button" class="btn-machined" id="preP1">P = -1 (Zero Shear)</button>
        <button type="button" class="btn-machined" id="preP3">P = -3 (Zero Net Flux)</button>
        <button type="button" class="btn-machined" id="preP0">P = 0 (Couette)</button>
      </div>
    `;
    bindPairedControl({
      idBase: "Pcp",
      obj: p,
      key: "P_cp",
      dec: 2,
      clampMin: -6.0,
      clampMax: 4.0,
      onAfterChange: () => debouncedRun("bay03", run, 65),
    });
    document.getElementById("preP1").onclick = () => {
      p.P_cp = -1.0;
      syncPairedValues("Pcp", p.P_cp, 2);
      run();
    };
    document.getElementById("preP3").onclick = () => {
      p.P_cp = -3.0;
      syncPairedValues("Pcp", p.P_cp, 2);
      run();
    };
    document.getElementById("preP0").onclick = () => {
      p.P_cp = 0.0;
      syncPairedValues("Pcp", p.P_cp, 2);
      run();
    };
  } else if (m === "twolayer") {
    const mu1Mpa = roundDec(p.mu1 * 1000, 1);
    const mu2Mpa = roundDec(p.mu2 * 1000, 1);
    sub.innerHTML = `
      <div class="grid-2">
        ${pairedFieldHtml({
          idBase: "M1",
          paramName: "mu1_mPas",
          label: "Lower μ₁",
          unit: "mPa·s",
          min: 0.5,
          max: 12.0,
          step: 0.5,
          value: mu1Mpa,
          dec: 1,
        })}
        ${pairedFieldHtml({
          idBase: "M2",
          paramName: "mu2_mPas",
          label: "Upper μ₂",
          unit: "mPa·s",
          min: 0.5,
          max: 12.0,
          step: 0.5,
          value: mu2Mpa,
          dec: 1,
        })}
        ${pairedFieldHtml({
          idBase: "DpDx",
          paramName: "dp_dx",
          label: "Pressure Gradient dp/dx",
          unit: "Pa/m",
          min: -3000,
          max: -200,
          step: 100,
          value: p.dp_dx,
          dec: 0,
          fullWidth: true,
        })}
      </div>
      <div class="preset-row" style="margin-top:8px;">
        <button type="button" class="btn-machined" id="preEx82">Standard (μ₁=5, μ₂=1 mPa·s)</button>
        <button type="button" class="btn-machined" id="preEqualMu">Equal Viscosity (μ₁=μ₂=3)</button>
      </div>
    `;
    const scheduleTwo = () => debouncedRun("bay03", run, 65);
    bindPairedControl({
      idBase: "M1",
      obj: p,
      key: "mu1",
      dec: 1,
      clampMin: 0.5,
      clampMax: 25.0,
      getVal: () => roundDec(p.mu1 * 1000, 1),
      setVal: (val) => {
        p.mu1 = roundDec(val * 1e-3, 6);
      },
      onAfterChange: scheduleTwo,
    });
    bindPairedControl({
      idBase: "M2",
      obj: p,
      key: "mu2",
      dec: 1,
      clampMin: 0.5,
      clampMax: 25.0,
      getVal: () => roundDec(p.mu2 * 1000, 1),
      setVal: (val) => {
        p.mu2 = roundDec(val * 1e-3, 6);
      },
      onAfterChange: scheduleTwo,
    });
    bindPairedControl({
      idBase: "DpDx",
      obj: p,
      key: "dp_dx",
      dec: 0,
      clampMin: -5000,
      clampMax: -100,
      onAfterChange: scheduleTwo,
    });
    document.getElementById("preEx82").onclick = () => {
      p.mu1 = 0.005;
      p.mu2 = 0.001;
      p.dp_dx = -1000.0;
      syncPairedValues("M1", 5.0, 1);
      syncPairedValues("M2", 1.0, 1);
      syncPairedValues("DpDx", -1000, 0);
      run();
    };
    document.getElementById("preEqualMu").onclick = () => {
      p.mu1 = 0.003;
      p.mu2 = 0.003;
      syncPairedValues("M1", 3.0, 1);
      syncPairedValues("M2", 3.0, 1);
      run();
    };
  } else {
    sub.innerHTML = `
      <div class="grid-2">
        ${pairedFieldHtml({
          idBase: "Nhb",
          paramName: "n",
          label: "Power Index n",
          unit: "dimless",
          min: 0.35,
          max: 1.60,
          step: 0.05,
          value: p.n_hb,
          dec: 2,
        })}
        ${pairedFieldHtml({
          idBase: "Ty",
          paramName: "tau_y",
          label: "Yield τ_y",
          unit: "Pa",
          min: 0.0,
          max: 13.5,
          step: 0.5,
          value: p.tau_y,
          dec: 1,
        })}
        ${pairedFieldHtml({
          idBase: "Ls",
          paramName: "slip_mm",
          label: "Navier Slip Length l_s",
          unit: "mm",
          min: 0.0,
          max: 0.80,
          step: 0.05,
          value: p.slip_mm,
          dec: 2,
          fullWidth: true,
        })}
      </div>
      <div class="preset-row" style="margin-top:8px;">
        <button type="button" class="btn-machined" id="preSlipTwist">Twist 10 (n=0.65, τ_y=2.5, l_s=0.25)</button>
        <button type="button" class="btn-machined" id="preLocked">Flow Locked (τ_y=12.5)</button>
      </div>
    `;
    const scheduleSlip = () => debouncedRun("bay03", run, 65);
    bindPairedControl({
      idBase: "Nhb",
      obj: p,
      key: "n_hb",
      dec: 2,
      clampMin: 0.2,
      clampMax: 2.0,
      onAfterChange: scheduleSlip,
    });
    bindPairedControl({
      idBase: "Ty",
      obj: p,
      key: "tau_y",
      dec: 1,
      clampMin: 0.0,
      clampMax: 20.0,
      onAfterChange: scheduleSlip,
    });
    bindPairedControl({
      idBase: "Ls",
      obj: p,
      key: "slip_mm",
      dec: 2,
      clampMin: 0.0,
      clampMax: 2.0,
      onAfterChange: scheduleSlip,
    });
    document.getElementById("preSlipTwist").onclick = () => {
      p.n_hb = 0.65;
      p.tau_y = 2.5;
      p.slip_mm = 0.25;
      syncPairedValues("Nhb", p.n_hb, 2);
      syncPairedValues("Ty", p.tau_y, 1);
      syncPairedValues("Ls", p.slip_mm, 2);
      run();
    };
    document.getElementById("preLocked").onclick = () => {
      p.tau_y = 12.5;
      syncPairedValues("Ty", p.tau_y, 1);
      run();
    };
  }

  run();
}
