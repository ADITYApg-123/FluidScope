/**
 * Station 05: 12-Problem Concept-Twist Quiz Bank (Unspoiled Predict First -> Verify Live on Canvas).
 */
import { displaySolvedFamily } from "./scene_mapper.js";

const ENDPOINT_TO_FAMILY = {
  "/api/kinematics": "kinematics_equation",
  "/api/vortex": "vortex_flow",
  "/api/vessel": "rotating_vessel",
  "/api/accel_tank": "accelerating_tank",
  "/api/two_layer": "two_layer_poiseuille",
  "/api/couette_poiseuille": "couette_poiseuille",
  "/api/bl_separation": "bl_separation",
  "/api/slip_hb": "slip_herschel_bulkley",
  "/api/sudden_expansion": "sudden_expansion",
  "/api/hydraulic_jump": "hydraulic_jump",
};

function esc(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function syncQuizParamsToLab(state, prob) {
  const pl = prob.payload || {};
  if (prob.station === "02") {
    if (prob.mode === "kinematics") {
      Object.assign(state.kinParams, {
        u_str: pl.u_str ?? state.kinParams.u_str,
        v_str: pl.v_str ?? state.kinParams.v_str,
        x0: pl.x0 ?? 1.0,
        y0: pl.y0 ?? 0.0,
        t_eval: pl.t_eval ?? 2.0,
        v0: pl.params?.v0 ?? 1.0,
        t0: pl.params?.t0 ?? 1.0,
      });
    } else if (prob.mode === "vortex") {
      Object.assign(state.vortexParams, {
        mode: pl.mode ?? "forced",
        strength_c: pl.strength_c ?? state.vortexParams.strength_c,
        omega: pl.omega ?? state.vortexParams.omega,
        core_radius: pl.core_radius ?? state.vortexParams.core_radius,
        r1: pl.r1 ?? 0.15,
        r2: pl.r2 ?? 0.45,
      });
    } else if (prob.mode === "vessel") {
      Object.assign(state.vesselParams, {
        radius: pl.radius ?? 0.3,
        vessel_height: pl.vessel_height ?? 0.503,
        initial_depth: pl.initial_depth ?? 0.503,
        rpm: pl.rpm ?? 130,
      });
    }
  } else if (prob.station === "03" && state.s3) {
    if (prob.mode === "twolayer") {
      Object.assign(state.s3, { mu1: pl.mu1 ?? 0.005, mu2: pl.mu2 ?? 0.001, dp_dx: pl.dp_dx ?? -1000 });
    } else if (prob.mode === "couette") {
      state.s3.P_cp = pl.P ?? -3.0;
    } else if (prob.mode === "separation") {
      state.s3.use_falkner_skan = false;
      state.s3.lambda_pg = pl.lambda_pg ?? -12.0;
    } else if (prob.mode === "slip_hb") {
      state.s3.n_hb = pl.n ?? 0.65;
      state.s3.tau_y = pl.tau_y ?? 2.5;
      state.s3.slip_mm = (pl.slip_length ?? 0.00025) * 1000;
    }
  } else if (prob.station === "04" && state.s4) {
    if (prob.mode === "tank") {
      state.s4.tankAx = pl.ax ?? 0.0;
      state.s4.tankAz = pl.az ?? -9.81;
    } else if (prob.mode === "expansion") {
      state.s4.expD1 = pl.D1 ?? 0.1;
      state.s4.expD2 = pl.D2 ?? 0.2;
      state.s4.expV1 = pl.V1 ?? 4.0;
    } else if (prob.mode === "jump") {
      state.s4.jumpWidth = pl.width ?? 6.1;
      state.s4.jumpV1 = pl.v1 ?? 6.1;
      const qUnit = (pl.discharge ?? 11.32) / (pl.width ?? 6.1);
      state.s4.jumpH1 = pl.h1 ?? qUnit / (pl.v1 ?? 6.1);
    }
  }
}

export async function renderStation05(ctx) {
  const {
    state,
    apiPost,
    flowEngine,
    plotEngine,
    setLegend,
    setConceptBanner,
    clearSecondaryControls,
    renderRockers,
    refreshAudit,
    setDrawerMetrics,
    setDrawerCards,
    openLab,
  } = ctx;

  clearSecondaryControls();

  if (!state.s5) {
    state.s5 = { twists: null, activeIndex: 0, chosenIdx: null, checked: false, scores: {} };
  }

  if (!state.s5.twists) {
    const res = await fetch("/api/twists").then((r) => r.json());
    state.s5.twists = res.data || [];
  }

  const twists = state.s5.twists;
  const prob = twists[state.s5.activeIndex] || twists[0];
  const host = document.getElementById("bayControls");

  const solvedCount = Object.keys(state.s5.scores || {}).length;
  const rightCount = Object.values(state.s5.scores || {}).filter(Boolean).length;

  host.innerHTML = `
    <section class="panel-bay">
      <div class="bay-header">
        <span>12-Twist Quiz Bank</span>
        <span class="tag-mono">${esc(prob.id)}${solvedCount > 0 ? ` \u00b7 ${rightCount}/${solvedCount} Correct` : ""}</span>
      </div>
      <div class="field-group">
        <select class="select-input" id="selTwist">
          ${twists.map((t, i) => `<option value="${i}" ${i === state.s5.activeIndex ? "selected" : ""}>${esc(t.id)}: ${esc(t.title)}</option>`).join("")}
        </select>
      </div>
      <div style="font-size:12.5px;line-height:1.5;color:var(--ink-primary);margin-top:6px;">${esc(prob.prompt)}</div>
      <div style="font-size:11.5px;line-height:1.4;color:var(--coral-ink);background:var(--coral-soft);border:1px solid var(--coral-border);border-radius:5px;padding:7px 9px;margin-top:6px;">
        <strong>Shortcut Trap:</strong> ${esc(prob.tempting_shortcut)}
      </div>
      <div class="bay-header" style="margin-top:8px;">
        <span>Predict First</span>
        <span class="tag-mono">${esc(prob.book_ref)}</span>
      </div>
      <div style="font-size:12.5px;color:var(--ink-primary);font-weight:600;line-height:1.45;">${esc(prob.question)}</div>
      <div id="twistOpts" style="display:flex;flex-direction:column;gap:6px;margin-top:6px;"></div>
      <div id="twistFeedback" style="font-size:12px;margin-top:6px;"></div>
      <button class="btn-machined btn-primary" id="btnVerifyTwist" style="width:100%;margin-top:8px;">Check Prediction &amp; Prove on Canvas</button>
    </section>
  `;

  document.getElementById("selTwist").onchange = (e) => {
    state.s5.activeIndex = parseInt(e.target.value, 10);
    state.s5.chosenIdx = null;
    state.s5.checked = false;
    renderStation05(ctx);
  };

  const renderQuizOptions = () => {
    const optsBox = document.getElementById("twistOpts");
    if (!optsBox) return;
    optsBox.innerHTML = "";
    prob.options.forEach((optText, i) => {
      const btn = document.createElement("button");
      const selected = state.s5.chosenIdx === i;
      const isRight = state.s5.checked && i === prob.correct_index;
      const isWrongSel = state.s5.checked && selected && i !== prob.correct_index;

      let cls = "quiz-opt-btn";
      if (isRight) cls += " correct";
      else if (isWrongSel) cls += " wrong";
      else if (selected) cls += " selected";

      btn.className = cls;
      btn.textContent = `${String.fromCharCode(65 + i)}. ${optText}`;
      btn.onclick = () => {
        if (state.s5.checked) return; // Keep graded selection clear until switching problems
        state.s5.chosenIdx = i;
        document.getElementById("twistFeedback").innerHTML = "";
        renderQuizOptions();
      };
      optsBox.appendChild(btn);
    });
  };

  const renderFeedbackBox = () => {
    const fb = document.getElementById("twistFeedback");
    if (!fb) return;
    if (!state.s5.checked) {
      fb.innerHTML = "";
      return;
    }
    const correct = state.s5.chosenIdx === prob.correct_index;
    const statusHtml = correct
      ? `<div style="color:var(--ok-green);font-weight:600;padding:7px 9px;background:var(--ok-soft);border:1px solid var(--ok-border);border-radius:5px;">
           Verified! Exact concept matches solver proof on the right.
         </div>`
      : `<div style="color:var(--coral-ink);font-weight:600;padding:7px 9px;background:var(--coral-soft);border:1px solid var(--coral-border);border-radius:5px;">
           Concept Trap Hit — Correct option is ${String.fromCharCode(65 + prob.correct_index)}. Inspect broken assumptions &amp; plots.
         </div>`;

    fb.innerHTML = `${statusHtml}<button class="btn-machined btn-xs" id="btnOpenLabFromQuiz" style="width:100%;margin-top:6px;">Open in Physics Lab with Live Sliders \u2192</button>`;
    const labBtn = document.getElementById("btnOpenLabFromQuiz");
    if (labBtn && typeof openLab === "function") {
      labBtn.onclick = () => {
        syncQuizParamsToLab(state, prob);
        openLab(prob.station, prob.mode);
      };
    }
  };

  const showUnspoiledCanvas = () => {
    Object.assign(state.assumptions, {
      steady: true,
      incompressible: true,
      inviscid: true,
      irrotational: true,
      no_slip: true,
      newtonian: true,
      inertial_frame: true,
      adverse_pressure_gradient: false,
      irreversible_jump: false,
    });
    renderRockers();
    refreshAudit();

    document.getElementById("primaryTitle").textContent = `Predict First \u00b7 ${prob.id}: ${prob.title}`;
    document.getElementById("secondaryTitle").textContent = "Verification Plot (Revealed After Checking Prediction)";
    setLegend("primaryLegend", []);
    setLegend("secondaryLegend", []);

    setConceptBanner(
      `<strong>${esc(prob.id)} \u2014 ${esc(prob.title)} (${esc(prob.book_ref)}):</strong> ${esc(prob.prompt)}`,
      `Predict first on the left (watch out for trap: ${esc(prob.tempting_shortcut)})`
    );

    flowEngine.setScene({
      bounds: [0, 1, 0, 1],
      field: null,
      xLabel: "Flow Domain (Awaiting Prediction)",
      yLabel: "",
      emptyTone: "primary",
      emptyMessage: "Predict the Physics First (Select A\u2013D on Left)",
      emptySub: `${prob.book_ref} \u00b7 Choose an option & click Check Prediction to reveal solver proof`,
      defaultHud: "Prediction locked \u2014 select A, B, C, or D and click Check Prediction",
    });

    plotEngine.setPlot({
      series: [],
      xLabel: "Exact Governing Solution vs. Shortcut Trap",
      yLabel: "",
      emptyTone: "primary",
      emptyMessage: "Curve Hidden Until Verification",
      emptySub: "Click 'Check Prediction & Prove on Canvas' to compute exact curves",
      defaultHud: "Unspoiled quiz mode active",
    });

    setDrawerMetrics([
      { k: "Problem", v: prob.id, color: "var(--accent)" },
      { k: "Status", v: "Awaiting Prediction", color: "var(--amber)" },
    ]);
    setDrawerCards([
      { k: "Textbook Specimen", v: prob.book_ref },
      { k: "Predict First Protocol", v: "Select A\u2013D on the left, then click 'Check Prediction & Prove on Canvas' to unlock the flow field & comparison curve." },
    ]);
  };

  const solveTwist = async () => {
    try {
      Object.assign(state.assumptions, {
        steady: true,
        incompressible: true,
        inviscid: true,
        irrotational: true,
        no_slip: true,
        newtonian: true,
        inertial_frame: true,
        adverse_pressure_gradient: false,
        irreversible_jump: false,
      });
      for (const k of prob.broken_assumptions) {
        state.assumptions[k] = k === "adverse_pressure_gradient" || k === "irreversible_jump";
      }
      renderRockers();
      await refreshAudit();

      const fam = ENDPOINT_TO_FAMILY[prob.endpoint];
      const data = await apiPost(prob.endpoint, prob.payload, "activeLab");
      displaySolvedFamily(fam, data, ctx);

      // Update concept banner with confirmed verdict + exact trap breakdown
      setConceptBanner(
        `<strong>Verified Proof (${esc(prob.id)} \u00b7 ${esc(prob.book_ref)}):</strong> ${esc(prob.options[prob.correct_index])}`,
        `Trap Broken: ${esc(prob.tempting_shortcut)}`
      );

      // Prepend Quiz Diagnosis cards while preserving displaySolvedFamily's quantitative solver numbers!
      const grid = document.querySelector("#drawerBody .diag-grid");
      if (grid) {
        const prependCard = (kTxt, vTxt, tone) => {
          const cell = document.createElement("div");
          cell.className = "diag-cell";
          const kEl = document.createElement("div");
          kEl.className = "diag-key";
          kEl.textContent = kTxt;
          const vEl = document.createElement("div");
          vEl.className = `diag-val ${tone || ""}`;
          vEl.textContent = vTxt;
          cell.appendChild(kEl);
          cell.appendChild(vEl);
          grid.prepend(cell);
        };
        prependCard("Tempting Exam Shortcut", prob.tempting_shortcut, "coral");
        prependCard(`Quiz Diagnosis (${prob.id})`, prob.options[prob.correct_index], "ok");
      }

      const metricsBox = document.getElementById("drawerMetrics");
      if (metricsBox) {
        const badge = document.createElement("span");
        badge.style.color = "var(--accent)";
        badge.textContent = `${prob.id} \u00b7 ${prob.book_ref}`;
        metricsBox.prepend(badge);
      }
    } catch (err) {
      if (err.name === "AbortError") return;
      document.getElementById("flowProbeHud").textContent = `Verification error: ${err.message}`;
    }
  };

  document.getElementById("btnVerifyTwist").onclick = async () => {
    if (state.s5.chosenIdx === null || state.s5.chosenIdx === undefined) {
      document.getElementById("twistFeedback").innerHTML = `<div style="color:var(--amber);font-weight:600;padding:6px 8px;background:var(--amber-soft);border:1px solid var(--amber-border);border-radius:5px;">Select an option (A\u2013D) above before verifying your prediction.</div>`;
      return;
    }
    state.s5.checked = true;
    state.s5.scores[prob.id] = state.s5.chosenIdx === prob.correct_index;
    renderQuizOptions();
    renderFeedbackBox();
    await solveTwist();
  };

  renderQuizOptions();
  renderFeedbackBox();

  if (state.s5.checked) {
    await solveTwist();
  } else {
    showUnspoiledCanvas();
  }
}
