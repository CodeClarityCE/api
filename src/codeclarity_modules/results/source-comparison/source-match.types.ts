// Shapes vuln-finder writes for comparing knowledge sources.

export interface SourceRange {
  introduced?: string;
  fixed?: string;
}

export interface SourceAffected {
  ranges: SourceRange[];
  exact: string[];
  universal: boolean;
}

// A GHSA label has type "GHSA", a class and a zero score.
export interface SourceSeverity {
  score: number;
  type: string;
  vector: string;
  class: string;
}

// One knowledge source's claim about a vulnerability instance.
export interface SourceMatch {
  source: string;
  record_id: string;
  winning: boolean;
  affected: SourceAffected;
  evidence: string;
  severity: SourceSeverity | null;
  /** Every CVSS vector of the record; absent on older analyses. */
  vectors?: SourceSeverity[];
  published?: string;
  modified?: string;
}

// What one knowledge source said about a vulnerability instance.
export enum SourceVerdictValue {
  Matched = "matched",
  /** The source was healthy and had no matching record. */
  NoRecord = "no_record",
  /** The source had no match while stale, failed or of unknown state. */
  StaleOrFailed = "stale_or_failed",
  /** A record for the package leaves the installed version out. */
  VersionExcluded = "version_excluded",
  /** The record was rejected, withdrawn or removed. */
  Retired = "retired",
  /** The record of this vulnerability names a different product or package. */
  NamesAnotherProduct = "names_another_product",
  /** The record of this vulnerability names no package, like an unreviewed advisory. */
  NoPackageData = "no_package_data",
}

// A product or package a record names; fields a source does not use are absent.
export interface SourceProduct {
  /** The OSV ecosystem the name belongs to, like "npm"; absent when the record gives none. */
  ecosystem?: string;
  /** An OSV package's name. */
  package?: string;
  /** A GCVE affected entry's or NVD CPE's vendor. */
  vendor?: string;
  /** A GCVE affected entry's or NVD CPE's product. */
  product?: string;
  /** An NVD CPE's target software, like "node.js" or "wordpress". */
  target_sw?: string;
}

// What a verdict rests on; fields a verdict does not use are absent.
export interface SourceVerdictEvidence {
  /** The records the verdict rests on, for every verdict but no record and stale or failed. */
  record_ids?: string[];
  /** The source's sync state ("stale", "failed" or "unknown"), for a stale or failed verdict. */
  source_status?: string;
  /** The affected ranges and versions checked against the installed version, for version excluded. */
  evaluated?: SourceAffected;
  /** The GCVE "unaffected" entry that covers the installed version, for version excluded. */
  unaffected?: SourceAffected;
  /** "rejected", "withdrawn" or "removed", for retired. */
  retired_reason?: string;
  /** When the record was retired (RFC 3339), for retired; absent when the source gives no date. */
  retired_at?: string;
  /** The products or packages the record names, for names another product. */
  names?: SourceProduct[];
}

// Every evidence field, in export column order; the type makes this list complete.
export const SOURCE_VERDICT_EVIDENCE_FIELDS = Object.keys({
  record_ids: true,
  source_status: true,
  evaluated: true,
  unaffected: true,
  retired_reason: true,
  retired_at: true,
  names: true,
} satisfies Record<
  keyof SourceVerdictEvidence,
  true
>) as (keyof SourceVerdictEvidence)[];

// The knowledge sources that give a verdict on every instance, as source verdicts name them.
export enum VerdictSource {
  Osv = "osv",
  Nvd = "nvd",
  Gcve = "gcve",
}

// One knowledge source's verdict on a vulnerability instance.
export interface SourceVerdict {
  source: string;
  verdict: SourceVerdictValue;
  evidence?: SourceVerdictEvidence;
}

// The fields of a vulnerability instance the comparison reads.
export interface ComparedVulnerability {
  VulnerabilityId: string;
  AffectedDependency: string;
  AffectedVersion: string;
  /** The instance's OSV ecosystem, like "npm"; absent on older analyses. */
  Ecosystem?: string;
  SourceMatches?: SourceMatch[];
  SourceVerdicts?: SourceVerdict[];
}

export interface ComparedWorkspace {
  Vulnerabilities?: ComparedVulnerability[];
}
