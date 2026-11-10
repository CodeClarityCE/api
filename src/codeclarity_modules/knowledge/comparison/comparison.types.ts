// Knowledge sources that match vulnerabilities, in source match order.
export const ADVISORY_SOURCES = ["osv", "friends_of_php", "gcve", "nvd"];

// Sources whose date is the earliest fix release, not a publication date.
export const FIX_RELEASE_DATED_SOURCES = new Set(["friends_of_php"]);

export type DateKind = "published" | "earliest_fix_release";

export function dateKind(source: string): DateKind {
  return FIX_RELEASE_DATED_SOURCES.has(source)
    ? "earliest_fix_release"
    : "published";
}

export interface DisclosureLag {
  source: string;
  date_kind: DateKind;
  // Vulnerabilities this source dates that another source also publishes.
  compared: number;
  // Vulnerabilities where this source's date is the earliest publication.
  first: number;
  median_days: number | null;
  mean_days: number | null;
}

// A CVSS v3 base score's severity class.
export function severityClass(score: number): string {
  if (score === 0) return "NONE";
  if (score < 4) return "LOW";
  if (score < 7) return "MEDIUM";
  if (score < 9) return "HIGH";
  return "CRITICAL";
}

export function round(value: number): number {
  return Math.round(value * 100) / 100;
}
