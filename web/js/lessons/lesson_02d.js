/**
 * lesson_02d.js  —  Interactive Guided Lesson for Lab 2D (Magnus Cylinder)
 *
 * 5-step guided walkthrough:
 *   1. Elementary Potential Superposition (Stream + Doublet = Solid Cylinder)
 *   2. D'Alembert's Paradox (Zero Drag in Ideal Potential Flow)
 *   3. Adding Circulation (The Spinning Magnus Cylinder)
 *   4. Stagnation Point Migration & Off-Surface Detachment (Γ > 4π U∞ a)
 *   5. The Kutta–Joukowski Lift Theorem (L' = ρ U∞ Γ)
 */

import { LessonEngine } from "../core/lesson_engine.js";

export const lab2dSteps = [
  {
    title: "Superposition: Uniform Stream + Doublet",
    idea: `
      <p>For incompressible, irrotational flow, Laplace's equation \\(\\nabla^2 \\phi = 0\\) is linear. This allows us to build complex flows by adding elementary solutions:</p>
      <div class="ls-equation">
        \\(\\psi = \\underbrace{U_\\infty r \\sin\\theta}_{\\text{Uniform Stream}} - \\underbrace{\\frac{\\kappa \\sin\\theta}{r}}_{\\text{Doublet}} = U_\\infty r \\sin\\theta\\left(1 - \\frac{a^2}{r^2}\\right)\\)
      </div>
      <p>Setting \\(\\kappa = U_\\infty a^2\\) turns the streamline \\(\\psi = 0\\) into a perfect solid cylinder of radius \\(a\\)!</p>
      <div class="ls-watch-hint">
        Look at the canvas: streamlines part smoothly around the solid circular boundary without penetrating it.
      </div>
    `,
    show: (ctx) => {
      const btn = document.getElementById("prePotDalembert");
      if (btn) btn.click();
    },
    highlight: "flowCanvas",
  },

  {
    title: "D'Alembert's Paradox: Zero Drag",
    idea: `
      <p>Examine the surface pressure coefficient \\(C_p = 1 - 4\\sin^2\\theta\\) around the non-spinning cylinder.</p>
      <p>Because the upstream and downstream pressure distributions are completely symmetric, integrating the pressure around the body yields:</p>
      <div class="ls-equation">
        \\(C_D = \\oint C_p \\cos\\theta\\, d\\theta = 0\\)
      </div>
      <div class="ls-example">
        <strong>D'Alembert's Paradox:</strong> In an ideal, inviscid fluid, an immersed body moving at constant speed experiences <em>identically zero hydrodynamic drag</em>! Real drag only appears because of viscosity and boundary-layer separation.
      </div>
      <div class="ls-watch-hint">
        Look at the right-hand plot: notice the perfect fore-aft symmetry of the blue surface pressure curve!
      </div>
    `,
    show: (ctx) => {
      const btn = document.getElementById("prePotDalembert");
      if (btn) btn.click();
    },
    highlight: "plotCanvas",
  },

  {
    title: "Adding Circulation: The Spinning Cylinder",
    idea: `
      <p>What happens when the cylinder spins about its axis? Viscous drag in a real fluid (or an added vortex in potential theory) imparts <strong>circulation \\(\\Gamma\\)</strong>:</p>
      <div class="ls-equation">
        \\(\\psi(r, \\theta) = U_\\infty r \\sin\\theta\\left(1 - \\frac{a^2}{r^2}\\right) + \\frac{\\Gamma}{2\\pi}\\ln\\left(\\frac{r}{a}\\right)\\)
      </div>
      <p>Fluid accelerates over the top surface (where stream and spin agree) and decelerates underneath (where they oppose)!</p>
      <div class="ls-watch-hint">
        Look at the canvas: the lesson switched to Magnus flow with clockwise circulation. Streamlines bunch tightly over the top, indicating high velocity!
      </div>
    `,
    show: (ctx) => {
      const btn = document.getElementById("prePotMagnus");
      if (btn) btn.click();
    },
    highlight: "flowCanvas",
  },

  {
    title: "Stagnation Point Migration & Detachment",
    idea: `
      <p>Surface velocity is \\(v_\\theta(a, \\theta) = -2 U_\\infty \\sin\\theta - \\frac{\\Gamma}{2\\pi a}\\). Setting \\(v_\\theta = 0\\) finds the stagnation points:</p>
      <div class="ls-equation">
        \\(\\sin\\theta_s = -\\frac{\\Gamma}{4\\pi U_\\infty a}\\)
      </div>
      <div class="ls-example">
        <strong>\\(\\Gamma = 0\\):</strong> Two stagnation points at \\(\\theta = 0^\\circ\\) and \\(180^\\circ\\).<br>
        <strong>\\(0 \\lt \\Gamma \\lt 4\\pi U_\\infty a\\):</strong> Both points slide symmetrically down the cylinder toward the bottom.<br>
        <strong>\\(\\Gamma \\gt 4\\pi U_\\infty a\\):</strong> Since \\(|\\sin\\theta| \\le 1\\), the points coalesce at the bottom and <strong>detach into the fluid</strong>!
      </div>
      <div class="ls-watch-hint">
        Look at the canvas: observe where fluid comes to rest on or beneath the cylinder surface.
      </div>
    `,
    show: (ctx) => {},
    highlight: "flowCanvas",
  },

  {
    title: "The Kutta–Joukowski Lift Theorem",
    idea: `
      <p>By Bernoulli's theorem, higher speed over the top creates low pressure, while lower speed underneath creates high pressure.</p>
      <p>Integrating this vertical pressure difference produces net upward lift governed by the famous <strong>Kutta–Joukowski Theorem</strong>:</p>
      <div class="ls-equation">
        \\(L' = \\rho U_\\infty \\Gamma\\)
      </div>
      <p>This explains the <strong>Magnus effect</strong>: spinning tennis balls curve downward, sliced golf balls gain lift, and Flettner rotor ships sail across the ocean!</p>
      <div class="ls-watch-hint">
        Notice on the right-hand plot how the surface pressure curve shifts downward, creating a large net suction force on the top of the cylinder!
      </div>
    `,
    show: (ctx) => {
      const btn = document.getElementById("prePotMagnus");
      if (btn) btn.click();
    },
    highlight: "plotCanvas",
  },
];

export function createLab2dLesson() {
  return new LessonEngine("Lab 2D · Magnus Lifting Cylinder", lab2dSteps);
}
