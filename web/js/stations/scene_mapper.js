/**
 * Shared mapper & schematic dispatcher converting backend solver payloads into
 * FlowCanvasEngine + CurvePlotEngine specs via modular domain mappers.
 * Frozen hub after Wave 0 for Wave 1 Agent C & Agent D.
 */
import {
  computeKinematicsFraming,
  buildRotatingVesselScene,
  mapKinematicsToScene,
} from "./mappers_kinematics.js";
import { mapViscousToScene } from "./mappers_viscous.js";
import {
  buildHydraulicJumpScene,
  buildSuddenExpansionScene,
  buildAccelTankScene,
  mapConservationToScene,
} from "./mappers_conservation.js";

export {
  computeKinematicsFraming,
  buildRotatingVesselScene,
  buildHydraulicJumpScene,
  buildSuddenExpansionScene,
  buildAccelTankScene,
};

const KINEMATICS_FAMILIES = new Set([
  "kinematics_equation",
  "vortex_flow",
  "rotating_vessel",
  "potential_superposition",
]);

const CONSERVATION_FAMILIES = new Set([
  "hydraulic_jump",
  "sudden_expansion",
  "accelerating_tank",
  "lbm_tunnel",
]);

export function mapSolverToScene(family, d, options = {}) {
  if (!d || family === "unsupported_3d") {
    return {
      primaryTitle: "Honest Solver Boundary (No Fabricated Diagram)",
      secondaryTitle: "Scope Guardrail Active",
      primaryLegend: [],
      secondaryLegend: [],
      banner: {
        mainHtml: "<strong>Honest Solver Boundary:</strong> This query requires 3D compressible or turbomachinery equations beyond our verified 2D/1D kernels.",
        trapHtml: "Instead of fabricating a fake diagram, SymPy audits assumptions cleanly.",
        trapTone: "insight",
      },
      scene: {
        bounds: [0, 1, 0, 1],
        field: null,
        xLabel: "Unsupported Domain",
        yLabel: "Unsupported Axis",
        defaultHud: "Outside 2D/1D exact solver scope — no fabricated diagram drawn",
        emptyMessage: "Honest Solver Boundary // Outside 2D/1D Scope",
        emptySub: "SymPy equation auditor remains active; refine prompt to a 2D problem.",
      },
      plot: {
        xLabel: "Unsupported Solver Domain",
        yLabel: "",
        series: [],
        defaultHud: "Outside built 2D/1D exact solvers",
        emptyMessage: "No Fabricated Curve // 3D Compressible Regime",
        emptySub: "FluidScope AI refuses to guess unverified 3D shock/turbomachinery plots.",
      },
      drawerMetrics: [{ k: "SCOPE", v: "OUTSIDE 2D/1D", color: "var(--coral)" }],
      drawerCards: null,
    };
  }

  if (KINEMATICS_FAMILIES.has(family)) {
    return mapKinematicsToScene(family, d, options);
  }
  if (CONSERVATION_FAMILIES.has(family)) {
    return mapConservationToScene(family, d, options);
  }
  return mapViscousToScene(family, d, options);
}

export function displaySolvedFamily(family, d, ctx, options = {}) {
  const { flowEngine, plotEngine, setLegend, setDrawerMetrics, setDrawerCards, setConceptBanner } = ctx;
  const spec = mapSolverToScene(family, d, options);

  const pTitleEl = document.getElementById("primaryTitle");
  const sTitleEl = document.getElementById("secondaryTitle");
  if (pTitleEl && spec.primaryTitle) pTitleEl.textContent = spec.primaryTitle;
  if (sTitleEl && spec.secondaryTitle) sTitleEl.textContent = spec.secondaryTitle;

  if (typeof setLegend === "function") {
    setLegend("primaryLegend", spec.primaryLegend || []);
    setLegend("secondaryLegend", spec.secondaryLegend || []);
  }
  if (typeof setConceptBanner === "function" && spec.banner) {
    setConceptBanner(spec.banner.mainHtml, spec.banner.trapHtml, spec.banner.trapTone);
  }

  flowEngine.setScene(spec.scene);
  plotEngine.setPlot(spec.plot);

  if (typeof setDrawerMetrics === "function") {
    setDrawerMetrics(spec.drawerMetrics || []);
  }
  if (typeof setDrawerCards === "function" && Array.isArray(spec.drawerCards)) {
    setDrawerCards(spec.drawerCards);
  }
  return spec;
}
