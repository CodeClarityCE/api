// Flattens an analysis's source verdicts to one export row per instance and source.

import type { KnowledgeSnapshot } from "../vulnerabilities/vulnerabilities.types";

import {
  type ComparedWorkspace,
  SOURCE_VERDICT_EVIDENCE_FIELDS,
} from "./source-match.types";

export type SourceVerdictCell = string | number | boolean | null;
export type SourceVerdictRow = Record<string, SourceVerdictCell>;

export const SOURCE_VERDICT_COLUMNS: readonly string[] = [
  "workspace",
  "vulnerability_id",
  "dependency",
  "version",
  "source",
  "verdict",
  "source_status_at_analysis",
  "source_stale_or_failed",
  ...SOURCE_VERDICT_EVIDENCE_FIELDS.map((field) => `evidence_${field}`),
];

export interface SourceVerdictExport {
  /** False when the analysis has instances but none stored verdicts. */
  available: boolean;
  columns: readonly string[];
  rows: SourceVerdictRow[];
}

// Lists join with ";" and objects become JSON, so CSV and JSON hold the same cells.
function cell(value: unknown): SourceVerdictCell {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
    return value.length === 0 ? null : value.join(";");
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  return JSON.stringify(value);
}

export function sourceVerdictExport(
  workspaces: Record<string, ComparedWorkspace>,
  snapshot: KnowledgeSnapshot | undefined,
): SourceVerdictExport {
  const statusOf = (source: string): string =>
    snapshot?.sources.find((s) => s.source === source)?.status ?? "unknown";

  let instances = 0;
  let stored = 0;
  const rows: SourceVerdictRow[] = [];
  for (const [workspace, ws] of Object.entries(workspaces)) {
    for (const vuln of ws.Vulnerabilities ?? []) {
      instances++;
      if (vuln.SourceVerdicts === undefined) continue;
      stored++;
      for (const verdict of vuln.SourceVerdicts) {
        const status = statusOf(verdict.source);
        const row: SourceVerdictRow = {
          workspace,
          vulnerability_id: vuln.VulnerabilityId,
          dependency: vuln.AffectedDependency,
          version: vuln.AffectedVersion,
          source: verdict.source,
          verdict: verdict.verdict,
          source_status_at_analysis: status,
          source_stale_or_failed: status === "stale" || status === "failed",
        };
        for (const field of SOURCE_VERDICT_EVIDENCE_FIELDS) {
          row[`evidence_${field}`] = cell(verdict.evidence?.[field]);
        }
        rows.push(row);
      }
    }
  }
  return {
    available: instances === 0 || stored > 0,
    columns: SOURCE_VERDICT_COLUMNS,
    rows,
  };
}
