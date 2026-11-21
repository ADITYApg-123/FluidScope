/**
 * lesson_02b.js  —  Interactive Guided Lesson for Lab 2B (Vortex Trap)
 *
 * 5-step guided walkthrough:
 *   1. Forced Vortex (Solid-Body Rotation, Ωz = 2ω)
 *   2. The Exam Trap: Why naive Bernoulli predicts opposite pressure sign
 *   3. The Exact Radial Euler Momentum Balance (dp/dr = ρ vθ²/r)
 *   4. Free Vortex (Irrotational Swirl, Ωz = 0)
 *   5. When Bernoulli holds across streamlines & Rankine combined core
 */

import { LessonEngine } from "../core/lesson_engine.js";

export const lab2bSteps = [
  {
    title: "Forced Vortex: Solid-Body Rotation",
    idea: `
      <p>In a <strong>Forced Vortex</strong> (like liquid stirred in a blender or rotating in a centrifuge), the fluid rotates like a rigid solid wheel with constant angular velocity \\(\\omega\\):</p>
      <div class="ls-equation">
        \\(v_\\theta(r) = \\omega r\\)
      </div>
      <p>Because every fluid element spins about its own axis as it orbits the center, the vorticity is non-zero and uniform throughout the entire core:</p>
      <div class="ls-equation">
        \\(\\Omega_z = \\frac{1}{r}\\frac{\\partial(r v_\\theta)}{\\partial r} = 2\\omega \\neq 0\\)
      </div>
      <div class="ls-watch-hint">
        Look at the canvas: fluid speed increases proportionally with radius \\(r\\), reaching maximum velocity at the outer boundary.
      </div>
    `,
    show: (ctx) => {
      const sel = document.getElementById("selVortex");
      if (sel) {
        sel.value = "forced";
        sel.dispatchEvent(new Event("change"));
      }
    },
    highlight: "flowCanvas",
  },

  {
    title: "The Exam Trap: Naive Bernoulli Fails",
    idea: `
      <p>In a forced vortex, speed increases outward (\\(v = \\omega r\\)). A naive student applying constant-head Bernoulli across radii calculates:</p>
      <div class="ls-equation">
        \\(p_1 + \\frac{1}{2}\\rho V_1^2 = p_2 + \\frac{1}{2}\\rho V_2^2 \\implies p_2 - p_1 = -\\frac{1}{2}\\rho\\omega^2(r_2^2 - r_1^2) \\lt 0\\)
      </div>
      <p><strong>This falsely predicts that pressure drops outward!</strong> But in reality, centrifugal inertia throws fluid OUTWARD, creating a steep pressure RISE at outer radii.</p>
      <div class="ls-watch-hint">
        Look at the right-hand plot: the red dashed line is the naive Bernoulli prediction (wrong sign!), while the blue curve is the true pressure rise.
      </div>
    `,
    show: (ctx) => {
      const sel = document.getElementById("selVortex");
      if (sel && sel.value !== "forced") {
        sel.value = "forced";
        sel.dispatchEvent(new Event("change"));
      }
    },
    highlight: "plotCanvas",
  },

  {
    title: "The Radial Euler Momentum Balance",
    idea: `
      <p>Why did naive Bernoulli fail? Because Bernoulli's equation can only cross streamlines when mechanical head \\(H\\) is constant:</p>
      <div class="ls-equation">
        \\(\\frac{\\partial H}{\\partial n} = \\frac{V \\Omega_z}{g}\\)
      </div>
      <p>Because \\(\\Omega_z = 2\\omega \\neq 0\\), total head \\(H\\) changes across every streamline! Instead, radial equilibrium requires Euler's momentum equation:</p>
      <div class="ls-equation">
        \\(\\frac{dp}{dr} = \\rho \\frac{v_\\theta^2}{r} = \\rho \\omega^2 r \\implies p(r) - p_1 = +\\frac{1}{2}\\rho\\omega^2(r^2 - r_1^2)\\)
      </div>
      <div class="ls-watch-hint">
        Notice the discrepancy band between exact physics and naive Bernoulli on the plot: it exists because vorticity \\(\\Omega_z \\neq 0\\).
      </div>
    `,
    show: (ctx) => {},
    highlight: "plotCanvas",
  },

  {
    title: "Free Vortex: Irrotational Swirl",
    idea: `
      <p>Now consider a <strong>Free Vortex</strong> (like water draining from a bathtub or the outer region of a hurricane):</p>
      <div class="ls-equation">
        \\(v_\\theta(r) = \\frac{C}{r}\\)
      </div>
      <p>Here, fluid elements circulate around the center without rotating about their own axes. Outside the singular origin \\(r=0\\), vorticity is identically ZERO:</p>
      <div class="ls-equation">
        \\(\\Omega_z = \\frac{1}{r}\\frac{\\partial(C)}{\\partial r} = 0 \\quad (r \\gt 0)\\)
      </div>
      <div class="ls-watch-hint">
        Look at the canvas: the lesson just switched to Free Vortex. Speed now blows up near the center and decays outward!
      </div>
    `,
    show: (ctx) => {
      const sel = document.getElementById("selVortex");
      if (sel) {
        sel.value = "free";
        sel.dispatchEvent(new Event("change"));
      }
    },
    highlight: "flowCanvas",
  },

  {
    title: "When Bernoulli DOES Hold Everywhere",
    idea: `
      <p>Because \\(\\Omega_z = 0\\) throughout the free vortex, we have \\(\\frac{\\partial H}{\\partial n} = 0\\). Total mechanical head \\(H\\) is uniform across all streamlines!</p>
      <div class="ls-equation">
        \\(p(r) + \\frac{1}{2}\\rho\\left(\\frac{C}{r}\\right)^2 = \\text{constant}\\)
      </div>
      <p>Here, and <strong>ONLY here</strong>, Bernoulli's equation holds across streamlines. As velocity surges near the center, pressure plunges inward, forming the classic vortex depression funnel.</p>
      <div class="ls-watch-hint">
        Look at the radial plot: the red naive Bernoulli curve and blue exact Euler curve now collapse into the EXACT same line because \\(\\Omega_z = 0\\)!
      </div>
    `,
    show: (ctx) => {
      const sel = document.getElementById("selVortex");
      if (sel && sel.value !== "free") {
        sel.value = "free";
        sel.dispatchEvent(new Event("change"));
      }
    },
    highlight: "plotCanvas",
  },
];

export function createLab2bLesson() {
  return new LessonEngine("Lab 2B · Vortex Trap", lab2bSteps);
}
