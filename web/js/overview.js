/**
 * Dedicated Landing Page (Overview) for FluidScope AI.
 */
import { renderTex } from "./math_ui.js";

const FEATURED_LABS = [
  {
    chapter: "Ch. 3.3 · Ex. 3.10",
    tag: "Kinematics",
    title: "Streamline vs. Pathline vs. Streakline",
    desc: "Watch an accelerating unsteady field rotate and stretch fluid elements while dye streaks trace a hyperbola distinct from straight particle paths.",
    trap: "Exam Trap: Assuming all three flow lines collapse together simply because vertical velocity v = v₀ is constant.",
    bay: "02",
    sub: "kinematics",
  },
  {
    chapter: "Ch. 4.5 · Eq. 4.43",
    tag: "Vortex Flow",
    title: "Forced Vortex Bernoulli Sign Reversal",
    desc: "Compare radial Euler pressure rise against constant-head Bernoulli inside a rotating impeller or cylindrical swirl.",
    trap: "Exam Trap: Applying p₁ + ½ρV₁² = p₂ + ½ρV₂² across streamlines gives the exact opposite pressure sign.",
    bay: "02",
    sub: "vortex",
  },
  {
    chapter: "Ch. 4.5 · Ex. 4.8",
    tag: "Hydrostatics",
    title: "Rotating Open Vessel & Base Uncovering",
    desc: "See the liquid paraboloid touch the rim, spill excess volume overhead, and expose a dry circular center radius R₁ on the base.",
    trap: "Exam Trap: Conserving full initial liquid volume at high RPM instead of accounting for rim overflow.",
    bay: "02",
    sub: "vessel",
  },
  {
    chapter: "Ch. 9.6 · Eq. 9.41–9.42",
    tag: "Boundary Layer",
    title: "Adverse Pressure Gradient & Separation",
    desc: "Solve the exact Falkner–Skan ODE and Pohlhausen profiles to inspect where interior inflection points force backflow and stall.",
    trap: "Exam Trap: Mistaking wall curvature (∂²u/∂y² = 0) or ideal potential pressure recovery (Cd = 0) for real separation.",
    bay: "03",
    sub: "separation",
  },
  {
    chapter: "Ch. 12.4 · Ex. 12.11",
    tag: "Conservation",
    title: "Hydraulic Jump Energy vs. Momentum",
    desc: "Verify why subcritical conjugate depth h₂ follows specific force conservation while turbulent rollers dissipate ~81 kW of head.",
    trap: "Exam Trap: Solving constant specific energy Es(h₂) = Es(h₁) overpredicts downstream depth h₂ severely.",
    bay: "04",
    sub: "jump",
  },
  {
    chapter: "Ch. 10 · Numba D2Q9",
    tag: "Live CFD",
    title: "2D Lattice-Boltzmann Wind Tunnel",
    desc: "Step an interactive D2Q9 incompressible fluid tunnel past circular cylinders, tandem bodies, backward steps, and wake splitter plates.",
    trap: "Physics Insight: Observe how a splitter plate suppresses Kármán vortex shedding wake oscillations.",
    bay: "04",
    sub: "lbm",
  },
];

const CHAPTER_MATRIX = [
  ["Ch. 1.6 & Ch. 8", "Navier Wall Slip & Herschel–Bulkley Yield Fluid", "FluidScope Viscous Lab (3D)", "Unyielded center plug core |τ| ≤ τ_y + boundary slip velocity u_w", "03", "slip_hb"],
  ["Ch. 2.9 (Eq. 2.86)", "Accelerating & Free-Falling Tank Hydrostatics", "Conservation Lab (4D)", "Zero hydrostatic gradient in free fall (az = -g ⇒ orifice does not leak)", "04", "tank"],
  ["Ch. 3.3 (Ex. 3.10)", "Unsteady Kinematics & Stokes' Circulation Check", "Kinematics Lab (2A)", "Streamline vs. Pathline vs. Streakline divergence + element shear/rotation", "02", "kinematics"],
  ["Ch. 4.5 (Ex. 4.7–4.8)", "Free, Forced, Rankine & Spiral Vortices", "Vortex & Tank Labs (2B–2C)", "∂H/∂n = VΩz/g breaks cross-stream Bernoulli in rotational cores", "02", "vortex"],
  ["Ch. 7 (Kutta–Joukowski)", "Potential Superposition & Magnus Lift Cylinder", "Magnus Lab (2D)", "Circulation Γ detaches stagnation points while creating L' = -ρU∞Γ", "02", "potential"],
  ["Ch. 8.3 (Ex. 8.2–8.4)", "Two-Layer Channel & Couette–Poiseuille Backflow", "Viscous Channel Labs (3B–3C)", "μ₁(du₁/dy) = μ₂(du₂/dy) interface kink & Q = 0 pure recirculation at P = -3", "03", "twolayer"],
  ["Ch. 9.6 (Eq. 9.41)", "Falkner–Skan & Boundary-Layer Inflection", "BL Separation Lab (3A)", "Adverse dp/dx > 0 forces positive wall curvature before τw hits zero", "03", "separation"],
  ["Ch. 11.5 & Ch. 12.4", "Borda–Carnot Pipe Expansion & Hydraulic Jump", "Conservation Labs (4B–4C)", "Eddy dissipation invalidates frictionless Bernoulli; momentum holds", "04", "expansion"],
];

export function renderOverview(handlers) {
  const host = document.getElementById("overviewView");
  if (!host) return;

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
          <button class="btn-cta-primary" id="heroBtnLabs">Launch Physics Labs &rarr;</button>
          <button class="btn-cta-secondary" id="heroBtnTranslator">AI Problem Translator</button>
          <button class="btn-cta-secondary" id="heroBtnQuiz">Try 12-Twist Exam Quiz</button>
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
          <div style="font-family:var(--font-display);font-weight:700;font-size:15.5px;margin-bottom:4px;">
            Forced Vortex Radial Pressure: Why Speed Increase Doesn&rsquo;t Drop Pressure
          </div>
          <div style="font-size:12.5px;color:var(--ink-secondary);line-height:1.45;">
            Solid-body rotation $v_\\theta = \\omega r$ gives vorticity $\\Omega_z = 2\\omega \\neq 0$, so total head $H$ rises outward across streamlines:
          </div>
          <div id="heroSpecimenEq" style="margin-top:8px;padding:8px 10px;background:var(--bg-bay);border:1px solid var(--seam);border-radius:5px;text-align:center;"></div>
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

        <button class="btn-machined btn-primary" id="heroBtnSpecimen" style="width:100%;">
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
            Drag Reynolds number, Hartree &beta;, Navier slip length, Froude number, or tank acceleration. Hover either canvas to inspect exact $(u, v, |V|, \\Omega_z)$ vectors and curve values.
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

    <!-- Featured Interactive Lab Cards -->
    <section>
      <div class="section-heading-row">
        <h2 class="section-title">Featured Interactive Physics Labs</h2>
        <span class="section-sub">Click any module to open its calibrated live workspace</span>
      </div>
      <div class="showcase-grid" id="overviewLabsGrid">
        ${FEATURED_LABS.map(
          (lab, idx) => `
          <article class="lab-card">
            <div>
              <div class="lab-card-meta">
                <span>${lab.chapter}</span>
                <span class="lab-badge">${lab.tag}</span>
              </div>
              <h3 class="lab-card-title">${lab.title}</h3>
              <p style="font-size:13px;color:var(--ink-secondary);line-height:1.5;margin-bottom:10px;">${lab.desc}</p>
              <div class="lab-card-trap">${lab.trap}</div>
            </div>
            <div class="lab-card-footer">
              <span style="font-family:var(--font-mono);font-size:11px;color:var(--ink-muted);">Station ${lab.bay} · Live Solver</span>
              <button class="btn-machined btn-primary" data-launch-idx="${idx}">Open Lab &rarr;</button>
            </div>
          </article>
        `
        ).join("")}
      </div>
    </section>

    <!-- Complete Textbook Chapter Map -->
    <section>
      <div class="section-heading-row">
        <h2 class="section-title">Som, Biswas &amp; Chakraborty (3rd Ed.) Coverage Map</h2>
        <span class="section-sub">Every chapter connected to an exact mathematical kernel</span>
      </div>
      <div class="chapter-table-wrap">
        <table class="chapter-table">
          <thead>
            <tr>
              <th>Textbook Ref</th>
              <th>Topic &amp; Governing Physics</th>
              <th>Interactive Lab</th>
              <th>Core Concept Twist Demonstrated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${CHAPTER_MATRIX.map(
              ([ref, topic, labName, twist, bay, sub]) => `
              <tr>
                <td style="font-family:var(--font-mono);font-size:12px;white-space:nowrap;">${ref}</td>
                <td style="font-weight:600;color:var(--ink-primary);">${topic}</td>
                <td style="color:var(--accent);font-weight:500;">${labName}</td>
                <td style="color:var(--ink-secondary);">${twist}</td>
                <td style="text-align:right;">
                  <button class="btn-machined btn-xs" data-chapter-bay="${bay}" data-chapter-sub="${sub}">Launch</button>
                </td>
              </tr>
            `
            ).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;

  // Render the KaTeX equation inside the hero specimen
  const eqBox = document.getElementById("heroSpecimenEq");
  if (eqBox) {
    renderTex(eqBox, "\\frac{\\partial H}{\\partial n} = \\frac{V\\,\\Omega_z}{g} = \\frac{2\\omega^2 r}{g} \\neq 0", false);
  }

  // Replace inline $...$ markers in hero specimen description cleanly
  const heroDesc = host.querySelector(".hero-specimen-card div[style*='line-height:1.45']");
  if (heroDesc) {
    heroDesc.innerHTML =
      "Solid-body rotation <strong>v<sub>&theta;</sub> = &omega;r</strong> produces nonzero vorticity <strong>&Omega;<sub>z</sub> = 2&omega;</strong>, so total mechanical head <strong>H</strong> rises outward across streamlines:";
  }

  const step2 = host.querySelectorAll(".step-desc")[1];
  if (step2) {
    step2.innerHTML =
      "Drag Reynolds number, Hartree &beta;, Navier slip length, Froude number, or tank acceleration. Hover either canvas to inspect live velocity <strong>(u, v, |V|, &Omega;<sub>z</sub>)</strong> and curve coordinates.";
  }

  document.getElementById("heroBtnLabs").onclick = () => handlers.openLab("02", "kinematics");
  document.getElementById("heroBtnTranslator").onclick = () => handlers.openView("01");
  document.getElementById("heroBtnQuiz").onclick = () => handlers.openView("05");
  document.getElementById("heroBtnSpecimen").onclick = () => handlers.openLab("02", "vortex");

  host.querySelectorAll("[data-launch-idx]").forEach((btn) => {
    const lab = FEATURED_LABS[Number(btn.dataset.launchIdx)];
    btn.onclick = () => handlers.openLab(lab.bay, lab.sub);
  });

  host.querySelectorAll("[data-chapter-bay]").forEach((btn) => {
    btn.onclick = () => handlers.openLab(btn.dataset.chapterBay, btn.dataset.chapterSub);
  });
}
