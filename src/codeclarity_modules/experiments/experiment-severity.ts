/** Severity classes in report order, and their buckets. */
export const SEVERITY_ORDER = [
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
  "NONE",
] as const;
export type SeverityCounts = Record<(typeof SEVERITY_ORDER)[number], number>;

/** The bucket of a severity class, NONE when it has none or an unknown one. */
export function severityOf(severityClass: string | null): keyof SeverityCounts {
  const upper = (severityClass ?? "").toUpperCase();
  return (SEVERITY_ORDER as readonly string[]).includes(upper)
    ? (upper as keyof SeverityCounts)
    : "NONE";
}
