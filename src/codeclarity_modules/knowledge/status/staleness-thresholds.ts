// Hours after which each knowledge source counts as stale.
// Grafana alerts must use the same values (codeclarity-dev#75).
export const DEFAULT_STALE_AFTER_HOURS = {
  cwe: 168,
  epss: 24,
  friends_of_php: 168,
  gcve: 48,
  licenses: 168,
  nvd: 48,
  osv: 24,
} as const;

export type KnowledgeSourceName = keyof typeof DEFAULT_STALE_AFTER_HOURS;

export const KNOWLEDGE_SOURCES = Object.keys(
  DEFAULT_STALE_AFTER_HOURS,
) as KnowledgeSourceName[];

// The environment variable overriding a source's threshold.
export function staleAfterEnvName(source: KnowledgeSourceName): string {
  return `KNOWLEDGE_STALE_AFTER_HOURS_${source.toUpperCase()}`;
}

// Reads the threshold for a source, using the default when unset or invalid.
export function staleAfterHours(source: KnowledgeSourceName): number {
  const raw = process.env[staleAfterEnvName(source)];
  const value = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_STALE_AFTER_HOURS[source];
}
