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

/** A percentile bootstrap interval around a point estimate. */
export interface BootstrapInterval {
  low: number;
  high: number;
}

export interface BootstrapSettings {
  seed: number;
  resamples: number;
  /** Between 0 and 1, 0.95 for a 95% interval */
  confidence: number;
}

/** Observations grouped by the cluster that is resampled as a whole. */
export type BootstrapClusters<T> = ReadonlyMap<string | number, T>;

/** Mulberry32: a small generator giving the same draws for the same seed. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Clusters in key order, so draws do not depend on the order rows arrive in. */
function clustersInKeyOrder<T>(clusters: BootstrapClusters<T>): T[] {
  return [...clusters.entries()]
    .map(([key, cluster]) => [String(key), cluster] as const)
    .sort(([a], [b]) => a.localeCompare(b, "en"))
    .map(([, cluster]) => cluster);
}

/**
 * The percentile interval of a statistic over resamples of `clusterCount`
 * clusters. The statistic gets how often each cluster was drawn. Resamples
 * where it is undefined (NaN) are left out; null when none remain.
 */
function percentileInterval(
  clusterCount: number,
  statistic: (draws: Int32Array) => number,
  { seed, resamples, confidence }: BootstrapSettings,
): BootstrapInterval | null {
  if (clusterCount === 0) return null;
  const random = seededRandom(seed);
  const draws = new Int32Array(clusterCount);
  const estimates: number[] = [];
  for (let r = 0; r < resamples; r++) {
    draws.fill(0);
    for (let i = 0; i < clusterCount; i++) {
      draws[Math.floor(random() * clusterCount)]!++;
    }
    const estimate = statistic(draws);
    if (!Number.isNaN(estimate)) estimates.push(estimate);
  }
  if (estimates.length === 0) return null;
  const tail = (1 - confidence) / 2;
  return {
    low: quantile(estimates, tail),
    high: quantile(estimates, 1 - tail),
  };
}

/** The q-quantile of sorted values drawn `weights[i]` times each. */
function weightedQuantile(
  values: readonly number[],
  weights: Float64Array,
  q: number,
): number {
  let total = 0;
  for (const weight of weights) total += weight;
  if (total === 0) return NaN;
  const position = (total - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.min(lower + 1, total - 1);
  let low = NaN;
  let seen = 0;
  for (let i = 0; i < values.length; i++) {
    seen += weights[i]!;
    if (Number.isNaN(low) && seen > lower) low = values[i]!;
    if (seen > upper) return low + (values[i]! - low) * (position - lower);
  }
  return NaN;
}

/** Bootstraps a statistic of the pooled values of the drawn clusters. */
function bootstrapPooledValues(
  clusters: BootstrapClusters<readonly number[]>,
  statistic: (values: readonly number[], weights: Float64Array) => number,
  settings: BootstrapSettings,
): BootstrapInterval | null {
  const ordered = clustersInKeyOrder(clusters).map(finite);
  const values = ascending([...new Set(ordered.flat())]);
  const indexOf = new Map(values.map((value, i) => [value, i]));
  // Flat arrays: cluster i holds cells[starts[i]] up to cells[starts[i + 1]]
  const starts = new Int32Array(ordered.length + 1);
  ordered.forEach((cluster, i) => {
    starts[i + 1] = starts[i]! + cluster.length;
  });
  const cells = Int32Array.from(ordered.flat(), (value) => indexOf.get(value)!);
  const weights = new Float64Array(values.length);
  return percentileInterval(
    ordered.length,
    (draws) => {
      weights.fill(0);
      for (let i = 0; i < draws.length; i++) {
        const drawn = draws[i]!;
        if (drawn === 0) continue;
        const end = starts[i + 1]!;
        for (let c = starts[i]!; c < end; c++) weights[cells[c]!]! += drawn;
      }
      return statistic(values, weights);
    },
    settings,
  );
}

/** The Gini coefficient of sorted values drawn `weights[i]` times each. */
function weightedGini(
  values: readonly number[],
  weights: Float64Array,
): number {
  let count = 0;
  let total = 0;
  let weighted = 0;
  for (let i = 0; i < values.length; i++) {
    const weight = weights[i]!;
    if (weight === 0) continue;
    // The ranks count + 1 to count + weight share this value
    weighted += values[i]! * (weight * count + (weight * (weight + 1)) / 2);
    total += values[i]! * weight;
    count += weight;
  }
  if (count === 0 || total === 0) return NaN;
  return (2 * weighted - (count + 1) * total) / (count * total);
}

/** Percentile interval of the Gini of the values, resampling whole clusters. */
export function bootstrapGini(
  clusters: BootstrapClusters<readonly number[]>,
  settings: BootstrapSettings,
): BootstrapInterval | null {
  return bootstrapPooledValues(clusters, weightedGini, settings);
}

/**
 * Percentile interval of the Gini of per-item totals: each cluster holds
 * counts per item, summed over the drawn clusters. Items left at zero by a
 * resample are not part of its distribution.
 */
export function bootstrapGiniOfTotals(
  clusters: BootstrapClusters<ReadonlyMap<string, number>>,
  settings: BootstrapSettings,
): BootstrapInterval | null {
  const ordered = clustersInKeyOrder(clusters);
  const items = new Map<string, number>();
  for (const cluster of ordered) {
    for (const item of cluster.keys()) {
      if (!items.has(item)) items.set(item, items.size);
    }
  }
  const cells = ordered.map((cluster) =>
    [...cluster].map(([item, count]) => [items.get(item)!, count] as const),
  );
  const totals = new Float64Array(items.size);
  const present = new Float64Array(items.size);
  return percentileInterval(
    cells.length,
    (draws) => {
      totals.fill(0);
      for (let i = 0; i < draws.length; i++) {
        const drawn = draws[i]!;
        if (drawn === 0) continue;
        for (const [item, count] of cells[i]!) totals[item]! += count * drawn;
      }
      let n = 0;
      for (const itemTotal of totals) {
        if (itemTotal > 0) present[n++] = itemTotal;
      }
      const sorted = present.subarray(0, n).sort();
      let total = 0;
      let weighted = 0;
      for (let i = 0; i < n; i++) {
        total += sorted[i]!;
        weighted += (i + 1) * sorted[i]!;
      }
      return n === 0 ? NaN : (2 * weighted - (n + 1) * total) / (n * total);
    },
    settings,
  );
}

/** Percentile interval of the median, resampling whole clusters. */
export function bootstrapMedian(
  clusters: BootstrapClusters<readonly number[]>,
  settings: BootstrapSettings,
): BootstrapInterval | null {
  return bootstrapPooledValues(
    clusters,
    (values, weights) => weightedQuantile(values, weights, 0.5),
    settings,
  );
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
  /** Observations with a duration of at least `time` */
  at_risk: number;
  events: number;
  censored: number;
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
    steps.push({
      time,
      survival,
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
