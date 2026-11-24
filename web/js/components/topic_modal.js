/**
 * Interactive Topic Reader & Theory Modal for FluidScope AI.
 * Displays key governing formulas, textbook mechanisms, and exam traps
 * when any topic or subtopic from the 16-chapter curriculum is clicked.
 */

import { renderTex } from "../math_ui.js";
import { TEXTBOOK_CURRICULUM } from "../core/textbook_curriculum.js";

const TOPIC_DETAILS_MAP = {
  "1.1": {
    summary: "Fluid mechanics deals with substances that deform continuously under shear. It bridges molecular statistical mechanics with continuum continuum approximations in engineering.",
    eqs: ["\\mathrm{Kn} = \\frac{\\lambda}{L} < 0.01"],
    pitfall: "Treating rarefied gases or micro-channel flows as classical no-slip continua when Knudsen number exceeds 0.01.",
  },
  "1.2": {
    summary: "A fluid is defined by its dynamic response to shear: it deforms continuously under tangential stress, however small. Statically, fluids cannot sustain shear stresses without flowing.",
    eqs: ["\\tau = \\lim_{\\Delta A \\to 0} \\frac{\\Delta F_t}{\\Delta A}", "\\lim_{t \\to \\infty} \\theta(t) = \\infty \\quad \\text{for } \\tau > 0"],
    pitfall: "Expecting a static fluid to support an inclined shear load without inducing flow motion.",
  },
  "1.3": {
    summary: "Solids resist static shear through finite elastic strain (Hooke's law). Fluids resist shear rate dynamically through viscosity (Newton's law).",
    eqs: ["\\tau_{\\text{solid}} = G \\cdot \\gamma", "\\tau_{\\text{fluid}} = \\mu \\cdot \\frac{d\\gamma}{dt} = \\mu \\frac{du}{dy}"],
    pitfall: "Confusing total shear strain gamma with the time rate of shear strain dgamma/dt.",
  },
  "1.4": {
    summary: "The continuum assumption replaces discrete molecular chaos with locally averaged macroscopic field variables over a Representative Elementary Volume (REV).",
    eqs: ["\\rho = \\lim_{\\Delta V \\to \\Delta V^*} \\frac{\\Delta m}{\\Delta V}, \\quad \\Delta V^* \\gg \\lambda^3"],
    pitfall: "Assuming continuum conservation holds in free-molecular flow regimes (Kn > 10).",
  },
  "1.5": {
    summary: "Stress at a point is a second-order Cartesian tensor with 9 components. At rest, shear stresses vanish identically, leaving an isotropic hydrostatic pressure tensor.",
    eqs: ["\\sigma_{ij} = -p \\delta_{ij} + \\tau_{ij}", "\\tau_{ij} = 0 \\implies \\sigma_{xx} = \\sigma_{yy} = \\sigma_{zz} = -p"],
    pitfall: "Treating pressure as a directional vector instead of an isotropic thermodynamic scalar acting normal to any surface.",
  },
  "1.6": {
    summary: "Key fluid properties dictate momentum and energy transport: density, dynamic and kinematic viscosity, non-Newtonian rheology, surface tension, compressibility, and vapour pressure.",
    eqs: [
      "\\tau = \\mu \\frac{du}{dy}",
      "\\nu = \\frac{\\mu}{\\rho}",
      "\\tau = \\tau_y + K \\left(\\frac{du}{dy}\\right)^n \\quad (\\text{Herschel--Bulkley})",
      "\\Delta p = \\frac{2\\sigma}{R} \\quad (\\text{Young--Laplace droplet})",
      "K = \\rho \\frac{dp}{d\\rho}, \\quad c = \\sqrt{\\frac{dp}{d\\rho}}"
    ],
    pitfall: "Applying constant no-slip Newtonian formulas to yield-stress fluids or rarefied wall slip boundaries.",
  },
  "2.2": {
    summary: "Fluids at rest obey hydrostatic equilibrium: pressure increases linearly with depth in an incompressible gravity field.",
    eqs: ["\\nabla p = \\rho \\mathbf{g}", "\\frac{dp}{dz} = -\\rho g \\implies p(z) = p_0 + \\rho g h"],
    pitfall: "Assuming hydrostatic pressure depends on container geometry or surface area rather than vertical depth alone.",
  },
  "2.5": {
    summary: "Manometers translate differential pressure into column height differences using hydrostatic equilibrium across continuous fluid interfaces.",
    eqs: ["p_1 - p_2 = (\\rho_m - \\rho_f) g h"],
    pitfall: "Jumping across two disconnected liquid legs without staying in a continuous homogenous fluid path.",
  },
  "2.9": {
    summary: "Liquids under rigid body rotation form an isobaric paraboloid. In vertical free fall, effective gravity vanishes and hydrostatic efflux halts completely.",
    eqs: [
      "z - z_0 = \\frac{\\omega^2 r^2}{2g}",
      "\\mathbf{g}_{\\text{eff}} = \\mathbf{g} - \\mathbf{a} = 0 \\quad (\\text{Free Fall})"
    ],
    pitfall: "Applying static Torricelli discharge v = sqrt(2gh) in an accelerating or free-falling vessel where effective gravity drops to zero.",
  },
  "3.3": {
    summary: "In steady flow, streamlines, pathlines, and streaklines coincide identically. In unsteady flow, they diverge into three entirely different geometric trajectories.",
    eqs: [
      "\\frac{dx}{u} = \\frac{dy}{v} = \\frac{dz}{w} \\quad (\\text{Streamline})",
      "\\frac{d\\mathbf{x}_p}{dt} = \\mathbf{V}(\\mathbf{x}_p, t) \\quad (\\text{Pathline})",
      "\\mathbf{\\Omega} = \\nabla \\times \\mathbf{V}, \\quad \\Gamma = \\oint \\mathbf{V} \\cdot d\\mathbf{r}"
    ],
    pitfall: "Assuming dye streaklines align with streamlines during time-dependent conduit acceleration.",
  },
  "4.5": {
    summary: "Irrotational free vortices conserve Bernoulli head across all streamlines. Rotational forced vortices have radially increasing total mechanical head, making constant-head Bernoulli predict the wrong pressure sign.",
    eqs: [
      "v_\\theta = \\frac{\\Gamma}{2\\pi r} \\quad (\\text{Free Vortex: } \\Omega_z = 0)",
      "v_\\theta = \\omega r \\quad (\\text{Forced Vortex: } \\Omega_z = 2\\omega)",
      "\\frac{dH}{dn} = \\frac{V}{g} \\Omega_z \\neq 0 \\quad (\\text{Cross-stream Euler})"
    ],
    pitfall: "Applying constant-head Bernoulli across streamlines inside a forced vortex core.",
  },
  "7.3": {
    summary: "Potential flow superposes elementary solutions (uniform stream, source, doublet, vortex). Circulation around a cylinder generates Kutta-Joukowski lift with zero D'Alembert drag.",
    eqs: [
      "\\psi = U_\\infty r \\sin\\theta \\left(1 - \\frac{a^2}{r^2}\\right) - \\frac{\\Gamma}{2\\pi} \\ln\\frac{r}{a}",
      "L' = -\\rho U_\\infty \\Gamma, \\quad D' = 0"
    ],
    pitfall: "Expecting stagnation points to stay pinned to cylinder surfaces once circulation exceeds 4*pi*U_inf*a.",
  },
  "8.3": {
    summary: "Exact Navier-Stokes solutions include Couette, Poiseuille, two-layer channel, and non-Newtonian slip flows under balance of viscous and pressure forces.",
    eqs: [
      "u(y) = \\frac{U y}{h} + \\frac{h^2}{2\\mu} \\left(-\\frac{dp}{dx}\\right) \\frac{y}{h}\\left(1 - \\frac{y}{h}\\right)",
      "\\mu_1 \\left.\\frac{du_1}{dy}\\right|_i = \\mu_2 \\left.\\frac{du_2}{dy}\\right|_i \\quad (\\text{Shear Continuity})"
    ],
    pitfall: "Equating velocity gradients across an interface of unequal viscosity instead of matching continuous shear stress.",
  },
  "9.6": {
    summary: "Adverse pressure gradients force positive wall profile curvature, driving an interior inflection point and boundary layer separation where wall shear vanishes.",
    eqs: [
      "\\left.\\frac{\\partial^2 u}{\\partial y^2}\\right|_w = \\frac{1}{\\mu} \\frac{dp}{dx} > 0",
      "\\left.\\frac{\\partial u}{\\partial y}\\right|_w = 0 \\quad (\\text{Separation Point})"
    ],
    pitfall: "Confusing the interior inflection point with flow detachment or assuming attached potential pressure recovery holds inside stalled wakes.",
  },
  "11.5": {
    summary: "Sudden pipe enlargement creates an annular dead-zone eddy matching shoulder pressure p' approx p1, producing the Borda-Carnot head loss.",
    eqs: ["h_L = \\frac{(V_1 - V_2)^2}{2g} = \\frac{V_1^2}{2g}\\left(1 - \\frac{A_1}{A_2}\\right)^2"],
    pitfall: "Using ideal Bernoulli equation to predict pressure recovery across a sudden expansion, ignoring dead-zone dissipation.",
  },
  "12.4": {
    summary: "Hydraulic jumps abruptly transition supercritical flow to subcritical flow, conserving specific force while turbulent roller vortices dissipate mechanical head.",
    eqs: [
      "F_s = \\frac{q^2}{g h} + \\frac{h^2}{2} = \\text{const}",
      "\\frac{h_2}{h_1} = \\frac{1}{2}\\left(\\sqrt{1 + 8\\mathrm{Fr}_1^2} - 1\\right)",
      "h_j = \\frac{(h_2 - h_1)^3}{4 h_1 h_2}"
    ],
    pitfall: "Applying constant specific energy across a jump instead of momentum conservation.",
  }
};

let modalBackdrop = null;
let currentTopicData = null;

export function initTopicModal({ openView, openLab }) {
  modalBackdrop = document.getElementById("topicModalBackdrop");
  const closeBtn = document.getElementById("topicModalCloseBtn");
  const aiBtn = document.getElementById("topicModalAiBtn");
  const labBtn = document.getElementById("topicModalLabBtn");

  if (!modalBackdrop) return;

  closeBtn?.addEventListener("click", closeTopicModal);
  modalBackdrop.addEventListener("click", (e) => {
    if (e.target === modalBackdrop) closeTopicModal();
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modalBackdrop.classList.contains("hidden")) {
      closeTopicModal();
    }
  });

  aiBtn?.addEventListener("click", () => {
    if (!currentTopicData) return;
    closeTopicModal();
    // Route to AI Translator with topic prompt
    const promptInput = document.getElementById("textInput");
    if (promptInput) {
      promptInput.value = `Explain the governing fluid mechanics principles, formulas, and common exam traps for: Chapter ${currentTopicData.chNum} Section ${currentTopicData.secNum} (${currentTopicData.secTitle}).`;
    }
    openView("01");
  });

  labBtn?.addEventListener("click", () => {
    if (!currentTopicData || !currentTopicData.lab) return;
    closeTopicModal();
    openLab(currentTopicData.lab.bay, currentTopicData.lab.sub);
  });
}

export function openTopicModal(chNum, secNum, subtopicText = null) {
  if (!modalBackdrop) modalBackdrop = document.getElementById("topicModalBackdrop");
  if (!modalBackdrop) return;

  const ch = TEXTBOOK_CURRICULUM.find((c) => c.chapter === Number(chNum));
  const sec = ch?.sections.find((s) => s.num === String(secNum));

  if (!ch || !sec) return;

  const details = TOPIC_DETAILS_MAP[sec.num] || {
    summary: `Comprehensive treatment of ${sec.title} as presented in Chapter ${ch.chapter} of Introduction to Fluid Mechanics and Fluid Machines (Som, Biswas & Chakraborty).`,
    eqs: [],
    pitfall: "Applying idealized textbook equations outside their valid physical Reynolds or Mach number regimes.",
  };

  const labMatch = sec.labs && sec.labs[0];
  currentTopicData = {
    chNum: ch.chapter,
    secNum: sec.num,
    secTitle: sec.title,
    lab: labMatch,
  };

  const chEl = document.getElementById("topicModalCh");
  const statusEl = document.getElementById("topicModalStatus");
  const titleEl = document.getElementById("topicModalTitle");
  const bodyEl = document.getElementById("topicModalBody");
  const labBtn = document.getElementById("topicModalLabBtn");

  if (chEl) chEl.textContent = `Chapter ${ch.chapter}: ${ch.title}`;
  if (statusEl) {
    statusEl.textContent = labMatch ? `Active Lab: ${labMatch.code}` : "Textbook Theory";
    statusEl.className = labMatch ? "topic-modal-status live" : "topic-modal-status";
  }
  if (titleEl) {
    titleEl.textContent = `${sec.num} · ${sec.title}`;
  }

  if (labBtn) {
    if (labMatch) {
      labBtn.classList.remove("hidden");
      labBtn.textContent = `Launch Lab ${labMatch.code} (${labMatch.title}) \u2192`;
    } else {
      labBtn.classList.add("hidden");
    }
  }

  let bodyHtml = `
    <div class="topic-modal-summary">
      <div class="topic-label">Core Principle</div>
      <p class="topic-text">${details.summary}</p>
    </div>
  `;

  if (subtopicText) {
    bodyHtml += `
      <div class="topic-subtopic-focus">
        <span class="focus-label">Selected Concept:</span>
        <span class="focus-val">${subtopicText}</span>
      </div>
    `;
  }

  if (details.eqs && details.eqs.length) {
    bodyHtml += `
      <div class="topic-equations-block">
        <div class="topic-label">Governing Formula${details.eqs.length > 1 ? 's' : ''}</div>
        <div class="topic-eq-list">
          ${details.eqs.map((eq) => `<div class="topic-eq-row" data-tex="${eq}">\\[${eq}\\]</div>`).join("")}
        </div>
      </div>
    `;
  }

  bodyHtml += `
    <div class="topic-pitfall-box">
      <div class="pitfall-label">Exam Trap &amp; Intuition Check</div>
      <p class="pitfall-text">${details.pitfall}</p>
    </div>

    <div class="topic-subtopics-cloud">
      <div class="topic-label">Subtopics Covered in this Section</div>
      <div class="subtopic-tags">
        ${sec.subtopics.map((st) => `<span class="subtopic-tag ${subtopicText === st ? 'active' : ''}">${st}</span>`).join("")}
      </div>
    </div>
  `;

  if (bodyEl) {
    bodyEl.innerHTML = bodyHtml;
    // Render KaTeX equations if available
    bodyEl.querySelectorAll(".topic-eq-row").forEach((el) => {
      if (window.katex && el.dataset.tex) {
        try {
          window.katex.render(el.dataset.tex, el, { displayMode: true, throwOnError: false });
        } catch (_) {}
      }
    });
  }

  modalBackdrop.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

export function closeTopicModal() {
  if (!modalBackdrop) modalBackdrop = document.getElementById("topicModalBackdrop");
  if (!modalBackdrop) return;
  modalBackdrop.classList.add("hidden");
  document.body.style.overflow = "";
}
