/**
 * The statistics behind experiment results, matching the archived
 * js-vuln-study harness (numpy, pandas and scipy defaults). Pure and
 * dependency free. Functions return NaN where the harness got NaN; the
 * results payload turns that into null.
 */

function finite(values: readonly number[]): number[] {
  return values.filter((value) => !Number.isNaN(value));
}

function ascending(values: readonly number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

function sum(values: readonly number[]): number {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

/**
 * Gini coefficient of non-negative values: 0 when equal, towards 1 when
 * concentrated. NaN values are dropped; NaN when nothing (non-zero) is left.
 */
export function gini(values: readonly number[]): number {
  const x = ascending(finite(values));
  const total = sum(x);
  if (x.length === 0 || x.every((value) => value === 0)) return NaN;
  let weighted = 0;
  x.forEach((value, i) => {
    weighted += (i + 1) * value;
  });
  const n = x.length;
  return (2 * weighted - (n + 1) * total) / (n * total);
}

/**
 * The q-quantile with linear interpolation between order statistics at
 * position (n - 1) * q (pandas and numpy default). NaN values are skipped;
 * NaN for no values.
 */
export function quantile(values: readonly number[], q: number): number {
  const x = ascending(finite(values));
  if (x.length === 0) return NaN;
  const position = (x.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.min(lower + 1, x.length - 1);
  const low = x[lower]!;
  const high = x[upper]!;
  return low + (high - low) * (position - lower);
}

/** The median, the mean of the two middle values for an even count. */
export function median(values: readonly number[]): number {
  return quantile(values, 0.5);
}

/**
 * How many packages, largest instance count first, must be cleared to
 * remove `share` of all instances: those whose cumulative share stays below
 * `share`, plus the one that crosses it. 0 when there are no instances.
 */
export function packagesToClear(
  instanceCounts: readonly number[],
  share: number,
): number {
  const x = ascending(instanceCounts).reverse();
  const total = sum(x);
  if (x.length === 0 || total <= 0) return 0;
  let running = 0;
  let below = 0;
  for (const count of x) {
    running += count;
    if (running / total < share) below++;
  }
  return below + 1;
}

/** Ranks from 1 in input order; tied values share the mean of their ranks. */
export function averageRanks(values: readonly number[]): number[] {
  const order = values.map((_, i) => i).sort((a, b) => values[a]! - values[b]!);
  const ranks = new Array<number>(values.length);
  let start = 0;
  while (start < order.length) {
    let end = start;
    while (
      end + 1 < order.length &&
      values[order[end + 1]!] === values[order[start]!]
    ) {
      end++;
    }
    const rank = (start + end) / 2 + 1;
    for (let k = start; k <= end; k++) ranks[order[k]!] = rank;
    start = end + 1;
  }
  return ranks;
}

function pearson(x: readonly number[], y: readonly number[]): number {
  const n = x.length;
  const meanX = sum(x) / n;
  const meanY = sum(y) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i]! - meanX;
    const dy = y[i]! - meanY;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return NaN;
  return Math.max(-1, Math.min(1, sxy / Math.sqrt(sxx * syy)));
}

/** Lanczos approximation (g = 7, n = 9) of ln(Gamma(z)) for z > 0. */
const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028,
  771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

function lnGamma(z: number): number {
  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  }
  const shifted = z - 1;
  let series = LANCZOS[0]!;
  for (let i = 1; i < LANCZOS.length; i++) {
    series += LANCZOS[i]! / (shifted + i);
  }
  const t = shifted + 7.5;
  return (
    0.5 * Math.log(2 * Math.PI) +
    (shifted + 0.5) * Math.log(t) -
    t +
    Math.log(series)
  );
}

/** Continued fraction of the incomplete beta function (modified Lentz). */
function betaContinuedFraction(x: number, a: number, b: number): number {
  const tiny = 1e-300;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 1000; m++) {
    const m2 = 2 * m;
    const even = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + even * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + even / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    h *= d * c;
    const odd = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + odd * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + odd / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-16) break;
  }
  return h;
}

/** The regularized incomplete beta function I_x(a, b). */
export function regularizedIncompleteBeta(
  x: number,
  a: number,
  b: number,
): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(
    lnGamma(a + b) -
      lnGamma(a) -
      lnGamma(b) +
      a * Math.log(x) +
      b * Math.log(1 - x),
  );
  // The continued fraction converges fast below the mean of the distribution
  return x < (a + 1) / (a + b + 2)
    ? (front * betaContinuedFraction(x, a, b)) / a
    : 1 - (front * betaContinuedFraction(1 - x, b, a)) / b;
}

/** P(|T| >= |t|) for Student's t with `df` degrees of freedom. */
export function studentTwoSidedP(t: number, df: number): number {
  if (Number.isNaN(t) || !(df > 0)) return NaN;
  if (!Number.isFinite(t)) return 0;
  return regularizedIncompleteBeta(df / (df + t * t), df / 2, 0.5);
}

export interface SpearmanResult {
  rho: number;
  /** Two-sided, from the t statistic with n - 2 degrees of freedom */
  p: number;
}

/**
 * Spearman rank correlation as scipy.stats.spearmanr computes it: Pearson
 * correlation of average ranks, two-sided p from t = rho * sqrt((n - 2) /
 * (1 - rho^2)). NaN for a constant input; p is NaN below three pairs.
 */
export function spearman(
  x: readonly number[],
  y: readonly number[],
): SpearmanResult {
  const n = Math.min(x.length, y.length);
  if (n < 2) return { rho: NaN, p: NaN };
  const rho = pearson(averageRanks(x.slice(0, n)), averageRanks(y.slice(0, n)));
  if (Number.isNaN(rho) || n < 3) return { rho, p: NaN };
  const df = n - 2;
  if (Math.abs(rho) === 1) return { rho, p: 0 };
  const t = rho * Math.sqrt(df / ((1 - rho) * (1 + rho)));
  return { rho, p: studentTwoSidedP(t, df) };
}

/** One step of a Kaplan-Meier curve; survival is 1 before the first step. */
export interface KmStep {
  time: number;
  /** Survival just after `time` */
  survival: number;
  /** 95% Greenwood log-log band around `survival` */
  lower: number;
  upper: number;
  /** Observations with a duration of at least `time` */
  at_risk: number;
  events: number;
  censored: number;
}

/** Two-sided 95% standard normal quantile */
const KM_BAND_Z = 1.959963984540054;

/** The log-log band; it collapses onto survival at exactly 1 or 0. */
function logLogBand(
  survival: number,
  greenwood: number,
): { lower: number; upper: number } {
  if (survival <= 0 || survival >= 1) {
    return { lower: survival, upper: survival };
  }
  const spread = Math.exp(
    (KM_BAND_Z * Math.sqrt(greenwood)) / Math.abs(Math.log(survival)),
  );
  return { lower: survival ** spread, upper: survival ** (1 / spread) };
}

/**
 * Kaplan-Meier estimate for right-censored durations (archive km_curve),
 * with a step at every distinct time, events or censoring. `events[i]` is
 * false when observation i is censored at durations[i].
 */
export function kaplanMeier(
  durations: readonly number[],
  events: readonly boolean[],
): KmStep[] {
  const observations = durations
    .map((time, i) => ({ time, event: events[i] === true }))
    .filter((o) => !Number.isNaN(o.time))
    .sort((a, b) => a.time - b.time);
  const steps: KmStep[] = [];
  let survival = 1;
  let greenwood = 0;
  let i = 0;
  while (i < observations.length) {
    const time = observations[i]!.time;
    const atRisk = observations.length - i;
    let eventCount = 0;
    let censored = 0;
    for (; i < observations.length && observations[i]!.time === time; i++) {
      if (observations[i]!.event) eventCount++;
      else censored++;
    }
    survival *= 1 - eventCount / atRisk;
    if (eventCount < atRisk) {
      greenwood += eventCount / (atRisk * (atRisk - eventCount));
    }
    steps.push({
      time,
      survival,
      ...logLogBand(survival, greenwood),
      at_risk: atRisk,
      events: eventCount,
      censored,
    });
  }
  return steps;
}

/** The first time survival drops to one half or below, NaN if it never does. */
export function kmMedian(curve: readonly KmStep[]): number {
  return curve.find((step) => step.survival <= 0.5)?.time ?? NaN;
}
