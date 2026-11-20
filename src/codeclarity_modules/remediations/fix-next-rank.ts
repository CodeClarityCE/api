import { isHighEpss } from "src/codeclarity_modules/knowledge/epss/epss-threshold";
import type { SeverityClass } from "src/codeclarity_modules/results/utils/utils";
import { SEVERITY_ORDER } from "src/codeclarity_modules/vulnerability_instances/organization-vulnerabilities.types";

/** What the Fix next rank reads from one resolved vulnerability instance. */
export interface RankedInstance {
  severity_class: SeverityClass;
  known_exploited: boolean;
  /** The highest EPSS score of the vulnerability's CVEs; null when none has one */
  epss: number | null;
  /** False when only development dependencies install it */
  prod: boolean;
}

/** The reasons for a Fix next rank; there is no numeric score. */
export interface FixNextRank {
  /** The worst severity among the resolved instances */
  severity_class: SeverityClass;
  /** A resolved instance's vulnerability is in the KEV catalog */
  known_exploited: boolean;
  /** A resolved instance's EPSS score is at or above the high EPSS threshold */
  high_epss: boolean;
  /** A resolved instance is installed for production; false means dev only */
  prod: boolean;
  instance_count: number;
}

/** Higher is worse. */
export const severityWeight = (severity: SeverityClass): number =>
  SEVERITY_ORDER.length - SEVERITY_ORDER.indexOf(severity);

/** The rank of a change that resolves these instances. */
export function fixNextRank(instances: RankedInstance[]): FixNextRank {
  let severity: SeverityClass = "NONE";
  for (const instance of instances) {
    if (severityWeight(instance.severity_class) > severityWeight(severity)) {
      severity = instance.severity_class;
    }
  }
  return {
    severity_class: severity,
    known_exploited: instances.some((i) => i.known_exploited),
    high_epss: instances.some((i) => isHighEpss(i.epss)),
    prod: instances.some((i) => i.prod),
    instance_count: instances.length,
  };
}

/**
 * Orders ranks most urgent first: worst severity, then known exploited or
 * high EPSS, then prod over dev only, then more instances. Zero on a tie.
 */
export function compareFixNextRank(a: FixNextRank, b: FixNextRank): number {
  const urgent = (rank: FixNextRank): number =>
    rank.known_exploited || rank.high_epss ? 1 : 0;
  return (
    severityWeight(b.severity_class) - severityWeight(a.severity_class) ||
    urgent(b) - urgent(a) ||
    Number(b.prod) - Number(a.prod) ||
    b.instance_count - a.instance_count
  );
}
