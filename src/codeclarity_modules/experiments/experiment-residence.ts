/** Pre-disclosure residence: days from an introduction to its advisory's publication. Pure. */
import type { DatingPrecision, Exposure } from "./experiment-exposures";
import { SEVERITY_ORDER, type SeverityCounts } from "./experiment-severity";
import { median, quantile } from "./experiment-stats";

/** A distribution of day counts. */
export interface DaysSummary {
  n: number;
  median: number | null;
  p25: number | null;
  p75: number | null;
  min: number | null;
  max: number | null;
}

/** One severity class of a days distribution. */
export interface DaysGroup extends DaysSummary {
  key: string;
}

export interface ResidencePoint {
  severity: keyof SeverityCounts;
  residence_days: number;
  precision: DatingPrecision;
}

export interface ResidenceBlock {
  /** Every introduction, with or without a publication date */
  introductions: number;
  /** Share of introductions only dated to a snapshot interval */
  snapshot_precision_share: number | null;
  /** Present at the first observation: no introduction, left out */
  present_at_first_observation: number;
  /** Introductions whose advisory has no publication date */
  undated: number;
  /** Introduction to publication, for introductions on or before it */
  overall: DaysSummary;
  /** Severity order, groups without introductions left out */
  by_severity: DaysGroup[];
  points: ResidencePoint[];
  /** Introduced after publication: days from publication to introduction */
  after_disclosure: DaysSummary;
  after_disclosure_by_severity: DaysGroup[];
}

function nullIfNaN(value: number): number | null {
  return Number.isNaN(value) ? null : value;
}

function daysSummary(days: readonly number[]): DaysSummary {
  return {
    n: days.length,
    median: nullIfNaN(median(days)),
    p25: nullIfNaN(quantile(days, 0.25)),
    p75: nullIfNaN(quantile(days, 0.75)),
    min: days.length ? Math.min(...days) : null,
    max: days.length ? Math.max(...days) : null,
  };
}

interface Dated {
  severity: keyof SeverityCounts;
  days: number;
}

function bySeverity(items: readonly Dated[]): DaysGroup[] {
  return SEVERITY_ORDER.map((key) => ({
    key,
    ...daysSummary(items.filter((i) => i.severity === key).map((i) => i.days)),
  })).filter((group) => group.n > 0);
}

/** Residence over introductions; negative residence is reported apart. */
export function residenceBlock(exposures: readonly Exposure[]): ResidenceBlock {
  const introduced = exposures.flatMap((e) =>
    e.introduction ? [{ ...e.introduction, severity: e.severity }] : [],
  );
  const points: ResidencePoint[] = [];
  const after: Dated[] = [];
  for (const intro of introduced) {
    if (intro.residence_days === null) continue;
    if (intro.residence_days >= 0) {
      points.push({
        severity: intro.severity,
        residence_days: intro.residence_days,
        precision: intro.precision,
      });
    } else {
      after.push({ severity: intro.severity, days: -intro.residence_days });
    }
  }
  const before = points.map((p) => ({
    severity: p.severity,
    days: p.residence_days,
  }));
  const snapshot = introduced.filter((i) => i.precision === "snapshot").length;
  return {
    introductions: introduced.length,
    snapshot_precision_share: introduced.length
      ? snapshot / introduced.length
      : null,
    present_at_first_observation: exposures.length - introduced.length,
    undated: introduced.filter((i) => i.residence_days === null).length,
    overall: daysSummary(before.map((b) => b.days)),
    by_severity: bySeverity(before),
    points,
    after_disclosure: daysSummary(after.map((a) => a.days)),
    after_disclosure_by_severity: bySeverity(after),
  };
}
