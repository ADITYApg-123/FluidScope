/**
 * Perceptual Colorblind-Safe Palettes, Colormap Samplers, Nice Ticks & Number Formatting.
 * Wave 0 baseline module (owned by Agent A in Wave 1).
 */

export const OKABE_ITO = {
  blue: "#0072B2",
  vermilion: "#D55E00",
  red: "#B91C1C",
  green: "#009E73",
  purple: "#7C3AED",
  orange: "#E69F00",
  sky: "#56B4E9",
  slate: "#475569",
};

export function fmtNum(v, d = 3) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "-";
  const digits = Math.max(0, Math.min(8, Math.trunc(d)));
  const threshold = 0.5 * Math.pow(10, -digits);
  if (Math.abs(n) < threshold) {
    return (0).toFixed(digits);
  }
  return n.toFixed(digits);
}

function niceNum(range, round) {
  const exponent = Math.floor(Math.log10(range));
  const fraction = range / Math.pow(10, exponent);
  let niceFraction;
  if (round) {
    if (fraction < 1.5) niceFraction = 1;
    else if (fraction < 3) niceFraction = 2;
    else if (fraction < 7) niceFraction = 5;
    else niceFraction = 10;
  } else {
    if (fraction <= 1) niceFraction = 1;
    else if (fraction <= 2) niceFraction = 2;
    else if (fraction <= 5) niceFraction = 5;
    else niceFraction = 10;
  }
  return niceFraction * Math.pow(10, exponent);
}

export function niceTicks(min, max, count = 5) {
  const lo = Number(min);
  const hi = Number(max);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
  if (Math.abs(hi - lo) < 1e-12) return [lo];
  const n = Math.max(2, Math.trunc(count));
  const range = niceNum(hi - lo, false);
  const spacing = niceNum(range / (n - 1), true);
  const tickMin = Math.ceil(lo / spacing) * spacing;
  const tickMax = Math.floor(hi / spacing) * spacing;
  const ticks = [];
  for (let t = tickMin; t <= tickMax + 1e-9 * spacing; t += spacing) {
    ticks.push(Math.abs(t) < 1e-12 * spacing ? 0 : t);
  }
  return ticks.length >= 2 ? ticks : [lo, hi];
}

export function sampleDivergingVorticity(normVal) {
  const v = Math.max(-1, Math.min(1, Number(normVal) || 0));
  // Blue (#1D4ED8) -> Neutral White (#F8FAFC) -> Vermilion (#DC2626)
  const neg = [29, 78, 216];
  const mid = [248, 250, 252];
  const pos = [220, 38, 38];
  const target = v < 0 ? neg : pos;
  const t = Math.abs(v);
  const r = Math.round(mid[0] + (target[0] - mid[0]) * t);
  const g = Math.round(mid[1] + (target[1] - mid[1]) * t);
  const b = Math.round(mid[2] + (target[2] - mid[2]) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

export function sampleSequentialSpeed(normVal) {
  const t = Math.max(0, Math.min(1, Number(normVal) || 0));
  // Slate-White (#F8FAFC) -> Sky (#0EA5E9) -> Cobalt (#1D4ED8)
  const c0 = [248, 250, 252];
  const c1 = [14, 165, 233];
  const c2 = [29, 78, 216];
  let r, g, b;
  if (t < 0.5) {
    const f = t * 2;
    r = Math.round(c0[0] + (c1[0] - c0[0]) * f);
    g = Math.round(c0[1] + (c1[1] - c0[1]) * f);
    b = Math.round(c0[2] + (c1[2] - c0[2]) * f);
  } else {
    const f = (t - 0.5) * 2;
    r = Math.round(c1[0] + (c2[0] - c1[0]) * f);
    g = Math.round(c1[1] + (c2[1] - c1[1]) * f);
    b = Math.round(c1[2] + (c2[2] - c1[2]) * f);
  }
  return `rgb(${r}, ${g}, ${b})`;
}
