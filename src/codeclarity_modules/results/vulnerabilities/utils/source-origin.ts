// Source origins (see GLOSSARY.md and ADR 0013): sources sharing an origin
// never corroborate or contradict each other.
export enum SourceOrigin {
  // OSV, which carries GHSA advisories.
  Osv = "osv",
  // NVD and GCVE both derive from the CVE List.
  CveList = "cve_list",
}

const ORIGIN_BY_SOURCE: Record<string, SourceOrigin> = {
  osv: SourceOrigin.Osv,
  nvd: SourceOrigin.CveList,
  gcve: SourceOrigin.CveList,
};

// The origin of a knowledge source key as stored in source verdicts, or
// undefined for a source this module does not know.
export function sourceOrigin(source: string): SourceOrigin | undefined {
  return ORIGIN_BY_SOURCE[source.toLowerCase()];
}

// True when both sources are known and come from different origins.
export function differentOrigins(a: string, b: string): boolean {
  const originA = sourceOrigin(a);
  const originB = sourceOrigin(b);
  return originA !== undefined && originB !== undefined && originA !== originB;
}
