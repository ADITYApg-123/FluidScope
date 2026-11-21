/**
 * lesson_02c.js  —  Interactive Guided Lesson for Lab 2C (Rotating Vessel)
 *
 * 4-step guided walkthrough:
 *   1. The Liquid Paraboloid (Centrifugal force vs. gravity)
 *   2. Conservation of Volume (Rise at rim = drop at center)
 *   3. The Rim Spill Event (Critical RPM)
 *   4. Base Uncovering (Why rim spill happens first)
 */

import { LessonEngine } from "../core/lesson_engine.js";

export const lab2cSteps = [
  {
    title: "The Liquid Paraboloid of Revolution",
    idea: `
      <p>When an open cylindrical vessel of radius \\(R\\) spins at constant angular speed \\(\\omega\\), every fluid element experiences an outward centrifugal body force \\(\\rho\\omega^2 r\\).</p>
      <p>In the rotating reference frame, the free surface aligns perpendicular to the effective gravity vector \\(\\mathbf{g}_{\\text{eff}} = \\mathbf{g} - \\mathbf{a}_c\\), forming a true <strong>paraboloid of revolution</strong>:</p>
      <div class="ls-equation">
        \\(z(r) = z_0 + \\frac{\\omega^2 r^2}{2g}\\)
      </div>
      <div class="ls-watch-hint">
        Look at the spinning vessel profile: the total height difference between the rim and center is \\(y = \\frac{\\omega^2 R^2}{2g}\\).
      </div>
    `,
    show: (ctx) => {
      const btn = document.getElementById("preEx48a");
      if (btn) btn.click();
    },
    highlight: "flowCanvas",
  },

  {
    title: "Conservation of Liquid Volume",
    idea: `
      <p>Before any fluid spills over the vessel rim, the total liquid volume in the tank remains strictly constant.</p>
      <div class="ls-example">
        A circular paraboloid has a volume equal to exactly <strong>one-half</strong> of its circumscribing cylinder:
        \\[V_{\\text{paraboloid}} = \\frac{1}{2}\\pi R^2 y\\]
      </div>
      <p>Therefore, as the vessel spins up, the liquid climbs by exactly <strong>\\(y/2\\) at the outer rim</strong> and drops by exactly <strong>\\(y/2\\) at the central axis</strong>!</p>
      <div class="ls-watch-hint">
        Notice the initial undisturbed depth line: the rim rises by the exact same amount that the center vortex vertex drops.
      </div>
    `,
    show: (ctx) => {},
    highlight: "flowCanvas",
  },

  {
    title: "The Rim Spill Threshold",
    idea: `
      <p>As angular speed \\(\\omega\\) increases, the outer liquid surface climbs toward the top rim of the tank (height \\(H\\)).</p>
      <p>When the rim height reaches the top, we hit the critical <strong>Rim Spill Speed</strong>:</p>
      <div class="ls-equation">
        \\(\\omega_{\\text{spill}} = \\sqrt{\\frac{4g(H - h_0)}{R^2}}\\)
      </div>
      <p>Any increase beyond this speed forces liquid to overflow the edges, meaning total liquid volume inside the tank is no longer conserved!</p>
      <div class="ls-watch-hint">
        Look at the Spin-Up button: click it during free exploration to watch the liquid climb smoothly from 0 RPM up to target speed!
      </div>
    `,
    show: (ctx) => {
      const btn = document.getElementById("preEx48a");
      if (btn) btn.click();
    },
    highlight: "btnSpinUp",
  },

  {
    title: "The Exam Trap: Base Uncovering vs. Rim Spill",
    idea: `
      <p>A classic exam question asks: <em>"At high spin speed, does the bottom floor of the tank uncover before or after liquid spills over the rim?"</em></p>
      <div class="ls-example">
        For any container filled to at least half-height (\\(h_0 \\ge H/2\\)), <strong>liquid ALWAYS spills over the rim first</strong>!
      </div>
      <p>Once liquid spills, volume is lost. At higher RPM (e.g. 130 RPM), the vortex tip touches the base floor and exposes a dry circle of radius \\(R_1\\).</p>
      <div class="ls-watch-hint">
        Look at the canvas: at 130 RPM, spilled volume is lost overhead, and the tank base is uncovered with a dry inner floor!
      </div>
    `,
    show: (ctx) => {
      const btn = document.getElementById("preEx48b");
      if (btn) btn.click();
    },
    highlight: "flowCanvas",
  },
];

export function createLab2cLesson() {
  return new LessonEngine("Lab 2C · Rotating Cylindrical Vessel", lab2cSteps);
}
