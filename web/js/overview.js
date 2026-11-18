/**
 * Dedicated Landing Page (Overview) for FluidScope AI.
 * Renders Category-Filterable 12-Lab Simulator Grid and 12-Row Clickable Textbook Coverage Map.
 */
import { renderTex } from "./math_ui.js";
import { LAB_CATALOG } from "./core/store.js";

const LAB_OVERVIEW_META = {
  "2A": {
    tag: "Kinematics",
    topic: "Unsteady Kinematics & Stokes' Circulation Check",
    desc: "Watch an accelerating unsteady field rotate and stretch fluid elements while dye streaks trace a hyperbola distinct from straight particle paths.",
    callout: "Exam Trap: Assuming streamlines, pathlines, and streaklines collapse together simply because vertical velocity v = v₀ is constant.",
    tone: "trap",
    twistSummary: "Streamline vs. pathline vs. streakline divergence plus local vs. convective acceleration",
  },
  "2B": {
    tag: "Vortex Flow",
    topic: "Free, Forced, Rankine & Spiral Vortices",
    desc: "Compare exact radial Euler pressure rise against constant-head Bernoulli inside forced, free, Rankine, and spiral swirling flows.",
    callout: "Exam Trap: Applying p₁ + ½ρV₁² = p₂ + ½ρV₂² across rotational streamlines predicts the exact opposite pressure sign.",
    tone: "trap",
    twistSummary: "∂H/∂n = V·Ωz/g breaks cross-stream Bernoulli inside rotational cores",
  },
  "2C": {
    tag: "Hydrostatics",
    topic: "Rotating Open Vessel & Base Uncovering",
    desc: "Spin an open cylindrical tank to watch the liquid paraboloid touch the rim, spill excess volume overhead, and expose a dry floor radius R₁.",
    callout: "Exam Trap: Conserving full initial liquid volume at high RPM instead of accounting for rim overflow.",
    tone: "trap",
    twistSummary: "Liquid spills at the top rim before uncovering a dry circular center base R₁",
  },
  "2D": {
    tag: "Potential Flow",
    topic: "Potential Superposition & Magnus Lift Cylinder",
    desc: "Superpose a uniform stream, doublet, and circulation Γ around a cylinder to inspect Cp contours, lift, and detached stagnation points.",
    callout: "Exam Trap: Expecting stagnation points to stay attached to the cylinder surface once |Γ| exceeds 4πU∞a.",
    tone: "trap",
    twistSummary: "Kutta–Joukowski lift L' = -ρU∞Γ with zero D'Alembert drag and off-wall stagnation",
  },
  "3A": {
    tag: "Boundary Layer",
    topic: "Falkner–Skan & Boundary-Layer Separation",
    desc: "Solve the exact Falkner–Skan ODE and Pohlhausen profiles to inspect where adverse pressure gradients force interior inflection and stall.",
    callout: "Exam Trap: Mistaking ideal potential pressure recovery (Cd = 0) or attached monotonic profiles for separated wakes.",
    tone: "trap",
    twistSummary: "Adverse dp/dx > 0 forces positive wall curvature and an interior inflection before τw = 0",
  },
  "3B": {
    tag: "Channel Flow",
    topic: "Generalized Couette–Poiseuille Channel Backflow",
    desc: "Balance moving-wall Couette shear against an opposing axial pressure gradient across the full transition to pure zero-net-flux recirculation.",
    callout: "Exam Trap: Assuming a linear velocity profile holds whenever nonzero pressure gradient P ≠ 0 drives backflow.",
    tone: "trap",
    twistSummary: "Lower wall shear vanishes at P = -1 and net channel flux vanishes at P = -3",
  },
  "3C": {
    tag: "Multiphase",
    topic: "Immiscible Two-Layer Channel Flow",
    desc: "Simulate two immiscible channel fluids of differing viscosity to inspect velocity continuity, shear stress matching, and peak-velocity shift.",
    callout: "Exam Trap: Equating du₁/dy = du₂/dy across fluids of unequal viscosity instead of matching shear τ = μ(du/dy).",
    tone: "trap",
    twistSummary: "Interface shear continuity μ₁(du₁/dy) = μ₂(du₂/dy) produces a slope kink and off-center peak",
  },
  "3D": {
    tag: "Rheology & Slip",
    topic: "Navier Wall Slip & Herschel–Bulkley Yield Fluid",
    desc: "Combine Herschel–Bulkley yield stress with Navier wall slip to observe rigid plug cores and hydrophobic wall speed elevation.",
    callout: "Exam Trap: Applying classical no-slip parabolic Poiseuille formulas when fluid slips at the wall or locks below τy.",
    tone: "trap",
    twistSummary: "Unyielded center plug core |τ| ≤ τy plus nonzero Navier boundary slip velocity uw",
  },
  "4A": {
    tag: "Live CFD",
    topic: "2D LBM Wind Tunnel & Kármán Vortex Wake",
    desc: "Step an interactive D2Q9 Lattice–Boltzmann wind tunnel past circular cylinders, tandem bodies, backward steps, or custom drawn obstacles.",
    callout: "Physics Insight: Observe how adding a rigid wake splitter plate suppresses alternating Kármán vortex shedding oscillations.",
    tone: "insight",
    twistSummary: "Unsteady viscous D2Q9 vortex shedding suppressed by a wake splitter plate",
  },
  "4B": {
    tag: "Open Channel",
    topic: "Open-Channel Hydraulic Jump Dissipation",
    desc: "Verify why subcritical conjugate depth h₂ follows specific force conservation while turbulent hydraulic jump rollers dissipate mechanical energy.",
    callout: "Exam Trap: Solving constant specific energy Es(h₂) = Es(h₁) across a jump severely overpredicts downstream depth h₂.",
    tone: "trap",
    twistSummary: "Integral specific force Fs holds across the jump while rollers dissipate head hj",
  },
  "4C": {
    tag: "Internal Flow",
    topic: "Borda–Carnot Sudden Pipe Expansion",
    desc: "Compare Borda–Carnot momentum pressure recovery across a sudden pipe enlargement against frictionless Bernoulli predictions.",
    callout: "Exam Trap: Using ideal Δp = ½ρ(V₁² - V₂²) ignores annular dead-zone eddies holding shoulder pressure p' ≈ p₁.",
    tone: "trap",
    twistSummary: "Corner eddies hold shoulder pressure p' ≈ p₁, producing Borda–Carnot loss hL = (V₁ - V₂)²/2g",
  },
  "4D": {
    tag: "Non-Inertial",
    topic: "Accelerating & Free-Falling Tank Hydrostatics",
    desc: "Tilt a tank horizontally or drop it into vertical free fall (az = -g) to watch isobars flatten and bottom orifice efflux drop to zero.",
    callout: "Exam Trap: Applying static Torricelli v = √(2gh) in an accelerating or free-falling container predicts leakage when none occurs.",
    tone: "trap",
    twistSummary: "Effective gravity g_eff = g + az drops to zero in free fall (az = -g), halting orifice flow",
  },
};

const FILTER_CATEGORIES = [
  { id: "all", label: "All 12" },
  { id: "kinematics", label: "Kinematics" },
  { id: "viscous", label: "Viscous" },
  { id: "conservation", label: "Conservation" },
];

export function renderOverview(handlers) {
  const host = document.getElementById("overviewView");
  if (!host) return;

  let activeCategory = "all";

  const getFilteredLabs = () =>
    activeCategory === "all"
      ? LAB_CATALOG
      : LAB_CATALOG.filter((item) => item.category === activeCategory);

  const renderLabCards = () => {
    const grid = document.getElementById("overviewLabsGrid");
    if (!grid) return;

    const labs = getFilteredLabs();
    grid.innerHTML = labs
      .map((item) => {
        const meta = LAB_OVERVIEW_META[item.id] || {};
        const isInsight = meta.tone === "insight";
        const calloutClass = isInsight ? "lab-card-trap insight-callout" : "lab-card-trap";
        return `
          <article class="lab-card" data-lab-id="${item.id}" data-lab-cat="${item.category}">
            <div>
              <div class="lab-card-meta">
                <span>${item.chapter}</span>
                <span class="lab-badge">${meta.tag || item.category}</span>
              </div>
              <h3 class="lab-card-title">${item.label}</h3>
              <p class="lab-card-desc">${meta.desc || ""}</p>
              <div class="${calloutClass}">${meta.callout || ""}</div>
            </div>
            <div class="lab-card-footer">
              <span class="lab-card-footer-meta">Station ${item.bay} · ${item.id}</span>
              <button type="button" class="btn-machined btn-primary" data-launch-bay="${item.bay}" data-launch-sub="${item.sub}">Open Lab &rarr;</button>
            </div>
          </article>
        `;
      })
      .join("");

    grid.querySelectorAll("[data-launch-bay]").forEach((btn) => {
      btn.onclick = () => handlers.openLab(btn.dataset.launchBay, btn.dataset.launchSub);
    });
  };

  host.innerHTML = `
    <!-- Hero Band -->
    <section class="hero-band">
      <div class="hero-copy">
        <div class="hero-eyebrow">SOM, BISWAS &amp; CHAKRABORTY (3RD ED.) · NEURO-SYMBOLIC WORKBENCH</div>
        <h1 class="hero-title">See exactly where naive textbook formulas break.</h1>
        <p class="hero-subtitle">
          In fluid mechanics exams and engineering design, shortcuts like
          <em>&ldquo;Bernoulli holds everywhere&rdquo;</em> or
          <em>&ldquo;streamlines equal pathlines&rdquo;</em>
          fail silently whenever hidden assumptions break. FluidScope AI pairs exact
          <strong>SymPy, SciPy &amp; Numba 2D LBM solvers</strong> with live side-by-side comparisons
          between true physics and common traps.
        </p>

        <div class="hero-cta-row">
          <button type="button" class="btn-cta-primary" id="heroBtnLabs">Launch Physics Labs &rarr;</button>
          <button type="button" class="btn-cta-secondary" id="heroBtnTranslator">AI Problem Translator</button>
          <button type="button" class="btn-cta-secondary" id="heroBtnQuiz">Try 12-Twist Exam Quiz</button>
        </div>

        <div class="hero-pillars">
          <div class="pillar-item">
            <span class="pillar-k">Symbolic Auditor</span>
            <span class="pillar-v">SymPy tracks which Navier–Stokes &amp; Bernoulli terms vanish or stay active.</span>
          </div>
          <div class="pillar-item">
            <span class="pillar-k">Exact + LBM Kernels</span>
            <span class="pillar-v">SciPy ODE boundary layers, Euler momentum balances &amp; live D2Q9 wind tunnel.</span>
          </div>
          <div class="pillar-item">
            <span class="pillar-k">Honest AI Scope</span>
            <span class="pillar-v">Extracts 2D equations from text cleanly; refuses 3D regimes instead of guessing.</span>
          </div>
        </div>
      </div>

      <!-- Worked Specimen Preview Card -->
      <aside class="hero-specimen-card">
        <div class="specimen-top">
          <span>Specimen · Ch. 4.5 (&omega;=10 rad/s, r=0.15&rarr;0.45 m)</span>
          <span class="specimen-tag-trap">BERNOULLI TRAP</span>
        </div>

        <div>
          <div class="specimen-title">
            Forced Vortex Radial Pressure: Why Speed Increase Doesn&rsquo;t Drop Pressure
          </div>
          <div class="specimen-desc">
            Solid-body rotation <strong>v<sub>&theta;</sub> = &omega;r</strong> produces nonzero vorticity <strong>&Omega;<sub>z</sub> = 2&omega;</strong>, so total mechanical head <strong>H</strong> rises outward across streamlines:
          </div>
          <div id="heroSpecimenEq" class="specimen-eq-box"></div>
        </div>

        <div class="specimen-compare">
          <div class="compare-box trap">
            <div class="compare-label">NAIVE BERNOULLI (WRONG SIGN)</div>
            <div class="compare-val">&minus;9.00 kPa</div>
            <div class="compare-note">Falsely assumes constant H across radii, predicting pressure drops radially.</div>
          </div>
          <div class="compare-box exact">
            <div class="compare-label">EXACT RADIAL EULER</div>
            <div class="compare-val">+9.00 kPa</div>
            <div class="compare-note">Centrifugal balance dp/dr = +&rho;&omega;&sup2;r drives true pressure outward.</div>
          </div>
        </div>

        <button type="button" class="btn-machined btn-primary" id="heroBtnSpecimen" style="width:100%;">
          Inspect Live Forced Vortex Simulation &rarr;
        </button>
      </aside>
    </section>

    <!-- 3-Step Workflow Explainer -->
    <section>
      <div class="section-heading-row">
        <h2 class="section-title">How FluidScope AI Works</h2>
        <span class="section-sub">Built to prove physical intuition interactively — never passive formulas</span>
      </div>
      <div class="steps-grid">
        <div class="step-card">
          <div class="step-num">STEP 01 · INSPECT OR PASTE</div>
          <div class="step-title">Spot the Hidden Assumption</div>
          <div class="step-desc">
            Paste any textbook problem in the <strong>AI Translator</strong> or pick one of 12 Physics Labs. Toggle assumptions like <em>Steady</em>, <em>Irrotational</em>, or <em>No-Slip</em> to see governing terms strike out live.
          </div>
        </div>
        <div class="step-card">
          <div class="step-num">STEP 02 · PERTURB &amp; PROBE</div>
          <div class="step-title">Move Real Dimensionless Sliders</div>
          <div class="step-desc">
            Drag Reynolds number, Hartree &beta;, Navier slip length, Froude number, or tank acceleration. Hover either canvas to inspect live velocity <strong>(u, v, |V|, &Omega;<sub>z</sub>)</strong> and curve coordinates.
          </div>
        </div>
        <div class="step-card">
          <div class="step-num">STEP 03 · SEE THE DISCREPANCY</div>
          <div class="step-title">Compare True vs. Naive Curves</div>
          <div class="step-desc">
            The left canvas animates the true 2D vector field and trajectories while the right chart plots exact physics directly against the dashed crimson naive shortcut.
          </div>
        </div>
      </div>
    </section>

    <!-- 12 Interactive Visual Simulators Grid with Category Filter Pills -->
    <section>
      <div class="section-heading-row">
        <div>
          <h2 class="section-title">Interactive Physics Simulators (12 Labs)</h2>
          <span class="section-sub">Filter by mechanics family or launch any calibrated live workbench</span>
        </div>
        <div class="overview-filter-bar" id="overviewCategoryFilters" role="tablist" aria-label="Filter simulators by category">
          ${FILTER_CATEGORIES.map(
            (cat) => `
            <button
              type="button"
              class="overview-filter-pill ${cat.id === activeCategory ? "active" : ""}"
              data-overview-cat="${cat.id}"
              role="tab"
              aria-selected="${cat.id === activeCategory ? "true" : "false"}"
            >${cat.label}</button>
          `
          ).join("")}
        </div>
      </div>
      <div class="showcase-grid" id="overviewLabsGrid"></div>
    </section>

    <!-- Complete 12-Row Clickable Textbook Coverage Map -->
    <section>
      <div class="section-heading-row">
        <h2 class="section-title">Som, Biswas &amp; Chakraborty (3rd Ed.) Coverage Map</h2>
        <span class="section-sub">All 12 chapters and examples — click any row to launch its live simulation</span>
      </div>
      <div class="chapter-table-wrap">
        <table class="chapter-table" id="chapterCoverageTable">
          <thead>
            <tr>
              <th>Textbook Ref</th>
              <th>Topic &amp; Governing Physics</th>
              <th>Interactive Lab</th>
              <th>Core Concept Twist Demonstrated</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${LAB_CATALOG.map((item) => {
              const meta = LAB_OVERVIEW_META[item.id] || {};
              return `
                <tr
                  class="chapter-row"
                  tabindex="0"
                  role="button"
                  aria-label="Launch ${item.label}"
                  data-chapter-bay="${item.bay}"
                  data-chapter-sub="${item.sub}"
                >
                  <td class="chapter-ref-cell">${item.chapter}</td>
                  <td class="chapter-topic-cell">${meta.topic || item.shortLabel}</td>
                  <td class="chapter-lab-cell">${item.label}</td>
                  <td class="chapter-twist-cell">${meta.twistSummary || ""}</td>
                  <td style="text-align:right;">
                    <button
                      type="button"
                      class="btn-machined btn-xs"
                      tabindex="-1"
                      data-chapter-bay="${item.bay}"
                      data-chapter-sub="${item.sub}"
                    >Launch &rarr;</button>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;

  // Render the KaTeX equation inside the hero specimen
  const eqBox = document.getElementById("heroSpecimenEq");
  if (eqBox) {
    renderTex(
      eqBox,
      "\\frac{\\partial H}{\\partial n} = \\frac{V\\,\\Omega_z}{g} = \\frac{2\\omega^2 r}{g} \\neq 0",
      false
    );
  }

  // Initial render of all 12 cards
  renderLabCards();

  // Bind category filter pills
  host.querySelectorAll("[data-overview-cat]").forEach((pill) => {
    pill.onclick = () => {
      activeCategory = pill.dataset.overviewCat || "all";
      host.querySelectorAll("[data-overview-cat]").forEach((p) => {
        const isSel = p.dataset.overviewCat === activeCategory;
        p.classList.toggle("active", isSel);
        p.setAttribute("aria-selected", String(isSel));
      });
      renderLabCards();
    };
  });

  // Hero CTAs
  document.getElementById("heroBtnLabs").onclick = () => handlers.openLab("02", "kinematics");
  document.getElementById("heroBtnTranslator").onclick = () => handlers.openView("01");
  document.getElementById("heroBtnQuiz").onclick = () => handlers.openView("05");
  document.getElementById("heroBtnSpecimen").onclick = () => handlers.openLab("02", "vortex");

  // Bind every entire clickable <tr> row + keyboard Enter/Space
  host.querySelectorAll("tr.chapter-row[data-chapter-bay]").forEach((row) => {
    const launch = () => handlers.openLab(row.dataset.chapterBay, row.dataset.chapterSub);
    row.onclick = launch;
    row.onkeydown = (e) => {
      if (e.target && e.target.tagName === "BUTTON") return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        launch();
      }
    };
  });
}
