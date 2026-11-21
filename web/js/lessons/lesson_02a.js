/**
 * lesson_02a.js  —  Interactive Guided Lesson for Lab 2A (Fluid Kinematics)
 *
 * 6-step guided walkthrough:
 *   1. Two ways to watch (Eulerian vs. Lagrangian)
 *   2. The velocity field & time dependence (Steady vs Unsteady)
 *   3. The three flow lines (Streamline, Pathline, Streakline)
 *   4. Worked example: When do they merge? (Unsteady -> Steady transition)
 *   5. Acceleration: Local vs. Convective (Nozzle intuition)
 *   6. The fluid element: Translation, Rotation, Stretch, Shear
 */

import { LessonEngine } from "../core/lesson_engine.js";

export const lab2aSteps = [
  {
    title: "Two Ways to Watch Fluid Flow",
    idea: `
      <p>To understand fluid motion, engineers and physicists look at the flow through two different lenses:</p>
      <div class="ls-example">
        <strong>1. Lagrangian perspective:</strong> Pick a single fluid particle (like tracking one specific car on a highway) and follow its trajectory over time.<br><br>
        <strong>2. Eulerian perspective:</strong> Stand on a bridge at a fixed coordinate \((x, y)\) and record the velocity of whichever fluid particles pass under you right now.
      </div>
      <div class="ls-watch-hint">
        Look at the canvas: the faint background arrows show the fixed <strong>Eulerian grid</strong>, while the moving blue streaks represent <strong>Lagrangian particles</strong> drifting along with the flow!
      </div>
    `,
    show: (ctx) => {
      // Ensure Lab 2A kinematics with default unsteady flow
      const pre = document.getElementById("preEx310");
      if (pre) pre.click();
    },
    highlight: "flowCanvas",
  },

  {
    title: "The Velocity Field & Time Dependence",
    idea: `
      <p>In the Eulerian framework, the fluid's velocity vector \(\\mathbf{V}\) is defined by its components at every coordinate \((x, y)\) and time \(t\):</p>
      <div class="ls-equation">
        \\(\\mathbf{V}(x, y, t) = u(x, y, t)\\,\\hat{i} + v(x, y, t)\\,\\hat{j}\\)
      </div>
      <p>Currently on your control panel:</p>
      <div class="ls-equation">
        \\(u = \\frac{x}{t + t_0}, \\quad v = v_0\\)
      </div>
      <div class="ls-example">
        <strong>Steady Flow (\\(\\partial \\mathbf{V}/\\partial t = 0\\)):</strong> The velocity vector at every fixed spot never changes with time.<br><br>
        <strong>Unsteady Flow (\\(\\partial \\mathbf{V}/\\partial t \\neq 0\\)):</strong> Because \(t\) appears explicitly in \(u(x, y, t)\), the velocity vector at any fixed coordinate shifts as time marches on!
      </div>
      <div class="ls-watch-hint">
        Notice the formula box highlighted on the left rail: you can edit these equations any time in free exploration.
      </div>
    `,
    show: (ctx) => {
      // Keep on unsteady formula
      const inU = document.getElementById("inU");
      if (inU && inU.value !== "x / (t + t0)") {
        document.getElementById("preEx310")?.click();
      }
    },
    highlight: "inU",
  },

  {
    title: "The Three Flow Lines: Why They Differ",
    idea: `
      <p>Textbooks introduce three distinct curves to visualize fluid motion. In an unsteady flow, they tell completely different stories:</p>
      <div class="ls-example">
        <strong>1. Streamline (Solid Blue):</strong> A curve everywhere tangent to the instantaneous velocity vector at one single instant in time (a freeze-frame photograph).<br><br>
        <strong>2. Pathline (Orange):</strong> The actual historical path traced out by one individual fluid particle released from seed point \((x_0, y_0)\) over time (a long-exposure night photo).<br><br>
        <strong>3. Streakline (Red Dashed):</strong> The instantaneous curve connecting all particles that were continuously injected from the same nozzle over time (like smoke rising from a chimney in wind).
      </div>
      <div class="ls-watch-hint">
        Because this flow is <em>unsteady</em> (time-dependent), the streamline, pathline, and streakline <strong>diverge and trace completely separate shapes</strong>!
      </div>
    `,
    show: (ctx) => {
      const pre = document.getElementById("preEx310");
      if (pre) pre.click();
    },
    highlight: "flowCanvas",
  },

  {
    title: "Worked Example: The Steady Collapse",
    idea: `
      <p>Let's solve for the curves mathematically:</p>
      <div class="ls-equation">
        <strong>Streamline:</strong> \\(\\frac{dy}{dx} = \\frac{v}{u} = \\frac{v_0(t + t_0)}{x} \\implies y = v_0(t + t_0)\\ln(x) + C\\)<br><br>
        <strong>Pathline:</strong> \\(\\frac{dx}{dt} = \\frac{x}{t + t_0} \\implies x(t) = x_0\\left(1 + \\frac{t}{t_0}\\right), \\quad y(t) = y_0 + v_0 t\\)
      </div>
      <p>In unsteady flow, the curves differ. <strong>Now watch what happens when we remove time dependence:</strong></p>
      <div class="ls-equation">
        \\(u = \\frac{x}{t_0}, \\quad v = v_0\\) &nbsp; <em>(Steady!)</em>
      </div>
      <div class="ls-watch-hint">
        Look at the canvas: the lesson just switched the flow to steady. <strong>The streamline, pathline, and streakline have collapsed into the EXACT same curve!</strong>
      </div>
    `,
    show: (ctx) => {
      // Switch formula to steady: u = x / t0, v = v0
      const inU = document.getElementById("inU");
      const inV = document.getElementById("inV");
      if (inU && inV) {
        inU.value = "x / t0";
        inV.value = "v0";
        document.getElementById("btnRunKin")?.click();
      }
    },
    highlight: "flowCanvas",
  },

  {
    title: "Acceleration: Local vs. Convective",
    idea: `
      <p>Can a fluid particle accelerate in a <strong>steady</strong> flow where nothing changes with time? <strong>Yes!</strong></p>
      <div class="ls-example">
        Think of water flowing through a converging nozzle: the flow rate is steady, but as a water drop travels into the narrower neck, it speeds up!
      </div>
      <p>The total fluid acceleration comes from the material derivative:</p>
      <div class="ls-equation">
        \\(a_x = \\underbrace{\\frac{\\partial u}{\\partial t}}_{\\text{Local Accel}} + \\underbrace{\\left(u\\frac{\\partial u}{\\partial x} + v\\frac{\\partial u}{\\partial y}\\right)}_{\\text{Convective Accel}}\\)
      </div>
      <div class="ls-watch-hint">
        Look at the diagnostic breakdown card highlighted below: in this steady flow, <strong>Local Acceleration is exactly 0.000</strong>, but <strong>Convective Acceleration is non-zero</strong> because fluid elements speed up as they travel downstream!
      </div>
    `,
    show: (ctx) => {
      // Ensure steady flow is applied so local = 0 and convective != 0
      const inU = document.getElementById("inU");
      const inV = document.getElementById("inV");
      if (inU && inV && inU.value !== "x / t0") {
        inU.value = "x / t0";
        inV.value = "v0";
        document.getElementById("btnRunKin")?.click();
      }
    },
    highlight: "kinAccelBreakdownCard",
  },

  {
    title: "The Fluid Element: Deformation & Vorticity",
    idea: `
      <p>A fluid isn't a rigid brick. As a tiny square element travels through the flow field, four distinct kinematic motions occur simultaneously:</p>
      <div class="ls-example">
        <strong>1. Translation:</strong> moving from point A to point B.<br>
        <strong>2. Linear Deformation (Divergence \\(\\nabla \\cdot \\mathbf{V}\\)):</strong> expanding or compressing volume.<br>
        <strong>3. Angular Deformation (Shear Strain Rate):</strong> skewing right angles into a rhombus.<br>
        <strong>4. Rotation (Vorticity \\(\\Omega_z = \\frac{\\partial v}{\\partial x} - \\frac{\\partial u}{\\partial y}\\)):</strong> spinning about its own center of mass.
      </div>
      <div class="ls-watch-hint">
        Look at the orange quadrilateral on the canvas: the lesson just switched to <strong>Pure Shear</strong> (\\(u = 1.2y + 0.5, v = 0\\)). Watch how the square distorts and rotates purely under shear strain!
      </div>
    `,
    show: (ctx) => {
      // Trigger pure shear preset
      document.getElementById("preShear")?.click();
    },
    highlight: "flowCanvas",
  },
];

export function createLab2aLesson() {
  return new LessonEngine("Lab 2A · Fluid Kinematics", lab2aSteps);
}
