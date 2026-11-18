/**
 * Perceptual Colorblind-Safe Palettes, 256-Stop Colormap LUTs, Nice Ticks & Number Formatting.
 * Wave 1 — Agent A (Canvas Engines & Scientific Visualization).
 */

export const OKABE_ITO = {
  blue: "#0072B2",       // Streamline / Primary Exact
  vermilion: "#D55E00",  // Pathline / Amber Perturbation
  red: "#B91C1C",        // Streakline / Naive Trap
  green: "#009E73",      // Stokes Loop / Validated
  purple: "#7C3AED",     // Secondary Analytical Overlay
  orange: "#E69F00",     // Auxiliary Highlight
  sky: "#56B4E9",        // Auxiliary Flow Accent
  slate: "#475569",      // Neutral Reference Guide
  // Semantic aliases for trajectories & overlays
  streamline: "#0072B2",
  pathline: "#D55E00",
  streakline: "#B91C1C",
  stokesLoop: "#009E73",
  secondary: "#7C3AED",
};

/**
 * Format numeric values cleanly without "-0.000" / "-0.00" artifacts.
 * Explicitly returns "-" for null, undefined, empty strings, booleans, and non-finite inputs.
 */
export function fmtNum(v, d = 3) {
  if (v === null || v === undefined || typeof v === "boolean") return "-";
  if (typeof v === "string" && v.trim() === "") return "-";
  const num = Number(v);
  if (!Number.isFinite(num)) return "-";
  const digits = Math.max(0, Math.min(8, Math.trunc(d)));
  const threshold = 0.5 * Math.pow(10, -digits);
  if (Math.abs(num) < threshold) {
    return (0).toFixed(digits);
  }
  const fixed = num.toFixed(digits);
  const negZero = `-${(0).toFixed(digits)}`;
  return fixed === negZero ? (0).toFixed(digits) : fixed;
}

/**
 * Wilkinson / Heckbert 1-2-5 clean axis ticks inside [min, max].
 * Avoids ugly raw intervals like -0.181, 0.101, 0.383 and respects maxTicks.
 */
export function niceTicks(min, max, maxTicks = 5) {
  let lo = Number(min);
  let hi = Number(max);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
  if (lo > hi) [lo, hi] = [hi, lo];
  const span = hi - lo;
  if (span < 1e-12) return [Math.abs(lo) < 1e-12 ? 0 : lo];

  const cap = Math.max(2, Math.trunc(maxTicks));
  const rawStep = span / cap;
  const baseExp = Math.floor(Math.log10(rawStep)) - 1;
  const maxExp = Math.ceil(Math.log10(span)) + 1;
  const multipliers = [1, 2, 5];

  let bestTicks = null;
  let fallbackTicks = null;

  for (let exp = baseExp; exp <= maxExp; exp++) {
    const pow10 = Math.pow(10, exp);
    for (const m of multipliers) {
      const step = m * pow10;
      if (step <= 0 || !Number.isFinite(step)) continue;
      const eps = 1e-10 * span;
      const start = Math.ceil((lo - eps) / step) * step;
      const end = Math.floor((hi + eps) / step) * step;
      if (end + 1e-12 * step < start) continue;

      const dec = Math.max(0, Math.min(10, -Math.floor(Math.log10(step)) + 2));
      const ticks = [];
      const countEstimate = Math.round((end - start) / step) + 1;
      if (countEstimate > 200) continue;

      for (let k = 0; k < countEstimate; k++) {
        const raw = start + k * step;
        if (raw > hi + eps) break;
        const val = Math.abs(raw) < 1e-12 * step ? 0 : Number(raw.toFixed(dec));
        ticks.push(Object.is(val, -0) ? 0 : val);
      }

      if (ticks.length >= 2) {
        if (!fallbackTicks || Math.abs(ticks.length - cap) < Math.abs(fallbackTicks.length - cap)) {
          fallbackTicks = ticks;
        }
        if (ticks.length <= cap) {
          bestTicks = ticks;
          break;
        }
      }
    }
    if (bestTicks) break;
  }

  if (bestTicks) return bestTicks;
  if (fallbackTicks) return fallbackTicks;
  return [Math.abs(lo) < 1e-12 ? 0 : lo, Math.abs(hi) < 1e-12 ? 0 : hi];
}

// Perceptual sRGB <-> Linear-light helpers for smooth 256-stop LUT construction
function srgbToLinear(c8) {
  const s = c8 / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function linearToSrgb(lin) {
  const c = Math.max(0, Math.min(1, lin));
  const s = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(255, s * 255)));
}

function lerpLinearRgb(cA, cB, t) {
  const f = Math.max(0, Math.min(1, t));
  const r = linearToSrgb(srgbToLinear(cA[0]) * (1 - f) + srgbToLinear(cB[0]) * f);
  const g = linearToSrgb(srgbToLinear(cA[1]) * (1 - f) + srgbToLinear(cB[1]) * f);
  const b = linearToSrgb(srgbToLinear(cA[2]) * (1 - f) + srgbToLinear(cB[2]) * f);
  return [r, g, b];
}

// Diverging Blue (#1D4ED8) -> Neutral (#F8FAFC) -> Vermilion (#DC2626)
const VORT_NEG = [29, 78, 216];   // #1D4ED8 (CW swirl, negative)
const VORT_MID = [248, 250, 252]; // #F8FAFC (Zero neutral)
const VORT_POS = [220, 38, 38];   // #DC2626 (CCW swirl, positive)

export const VORTICITY_LUT = Array.from({ length: 256 }, (_, idx) => {
  const norm = (idx / 255) * 2 - 1; // [-1 .. +1]
  const [r, g, b] =
    norm < 0
      ? lerpLinearRgb(VORT_MID, VORT_NEG, Math.abs(norm))
      : lerpLinearRgb(VORT_MID, VORT_POS, norm);
  return `rgb(${r}, ${g}, ${b})`;
});

// Sequential Speed (#F8FAFC -> #38BDF8 -> #0284C7 -> #1D4ED8)
const SPD_STOPS = [
  { t: 0.0, rgb: [248, 250, 252] }, // #F8FAFC
  { t: 0.38, rgb: [56, 189, 248] }, // #38BDF8
  { t: 0.72, rgb: [2, 132, 199] },  // #0284C7
  { t: 1.0, rgb: [29, 78, 216] },   // #1D4ED8
];

export const SPEED_LUT = Array.from({ length: 256 }, (_, idx) => {
  const t = idx / 255;
  let seg = SPD_STOPS[0];
  let next = SPD_STOPS[SPD_STOPS.length - 1];
  for (let i = 0; i < SPD_STOPS.length - 1; i++) {
    if (t >= SPD_STOPS[i].t && t <= SPD_STOPS[i + 1].t) {
      seg = SPD_STOPS[i];
      next = SPD_STOPS[i + 1];
      break;
    }
  }
  const span = Math.max(1e-9, next.t - seg.t);
  const [r, g, b] = lerpLinearRgb(seg.rgb, next.rgb, (t - seg.t) / span);
  return `rgb(${r}, ${g}, ${b})`;
});

/**
 * Sample the 256-stop diverging Blue-White-Vermilion LBM vorticity LUT.
 * Supports both sampleDivergingVorticity(normVal) in [-1, 1] and sampleDivergingVorticity(val, maxAbs).
 */
export function sampleDivergingVorticity(val, maxAbs = 1) {
  const v = Number(val);
  const denom = Number(maxAbs);
  if (!Number.isFinite(v)) return VORTICITY_LUT[128];
  const scale = Number.isFinite(denom) && Math.abs(denom) > 1e-12 ? Math.abs(denom) : 1;
  const norm = Math.max(-1, Math.min(1, v / scale));
  const idx = Math.max(0, Math.min(255, Math.round(((norm + 1) * 0.5) * 255)));
  return VORTICITY_LUT[idx];
}

/**
 * Sample the 256-stop sequential velocity magnitude |V| LUT.
 * Supports both sampleSequentialSpeed(normVal) in [0, 1] and sampleSequentialSpeed(val, maxVal).
 */
export function sampleSequentialSpeed(val, maxVal = 1) {
  const v = Number(val);
  const denom = Number(maxVal);
  if (!Number.isFinite(v)) return SPEED_LUT[0];
  const scale = Number.isFinite(denom) && denom > 1e-12 ? denom : 1;
  const t = Math.max(0, Math.min(1, v / scale));
  const idx = Math.max(0, Math.min(255, Math.round(t * 255)));
  return SPEED_LUT[idx];
}

/**
 * Diverging pressure coefficient Cp sampler (Blue suction < 0 -> Neutral 0 -> Vermilion stagnation > 0).
 */
export function sampleDivergingCp(val, maxAbs = 2.5) {
  return sampleDivergingVorticity(val, maxAbs);
}
