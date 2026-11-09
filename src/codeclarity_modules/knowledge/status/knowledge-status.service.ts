import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";

import {
  KNOWLEDGE_SOURCES,
  KnowledgeSourceName,
  staleAfterHours,
} from "./staleness-thresholds";

export type KnowledgeSourceHealth = "healthy" | "stale" | "failed";
export type KnowledgeSourceOutcome = "success" | "failure";

export interface KnowledgeSourceStatus {
  source: KnowledgeSourceName;
  status: KnowledgeSourceHealth;
  watermark: string | null;
  last_outcome: KnowledgeSourceOutcome | null;
  last_run_started_at: string | null;
  last_run_finished_at: string | null;
  in_progress: boolean;
  row_count: number;
  stale_after_hours: number;
}

export interface KnowledgeStatus {
  sources: KnowledgeSourceStatus[];
}

interface SyncRow {
  source: string;
  watermark: Date | null;
  last_run_started_at: Date | null;
  last_run_finished_at: Date | null;
  last_outcome: KnowledgeSourceOutcome | null;
  row_count: string;
}

const EMPTY_ROW: Omit<SyncRow, "source"> = {
  watermark: null,
  last_run_started_at: null,
  last_run_finished_at: null,
  last_outcome: null,
  row_count: "0",
};

const HOUR_MS = 3_600_000;

@Injectable()
export class KnowledgeStatusService {
  constructor(
    @InjectDataSource("knowledge")
    private readonly knowledgeDataSource: DataSource,
  ) {}

  /** Reports the health of every knowledge source. */
  async get(): Promise<KnowledgeStatus> {
    // Lists columns explicitly so last_error never leaves the database.
    const rows = await this.knowledgeDataSource.query<SyncRow[]>(
      `SELECT source, watermark, last_run_started_at, last_run_finished_at, last_outcome, row_count
       FROM knowledge_source_sync`,
    );
    const bySource = new Map(rows.map((row) => [row.source, row]));
    const now = Date.now();

    return {
      sources: KNOWLEDGE_SOURCES.map((source) =>
        toStatus(source, bySource.get(source) ?? EMPTY_ROW, now),
      ),
    };
  }
}

function toStatus(
  source: KnowledgeSourceName,
  row: Omit<SyncRow, "source">,
  now: number,
): KnowledgeSourceStatus {
  const staleAfter = staleAfterHours(source);
  return {
    source,
    status: health(row, staleAfter, now),
    watermark: row.watermark?.toISOString() ?? null,
    last_outcome: row.last_outcome,
    last_run_started_at: row.last_run_started_at?.toISOString() ?? null,
    last_run_finished_at: row.last_run_finished_at?.toISOString() ?? null,
    in_progress: inProgress(row),
    row_count: Number(row.row_count),
    stale_after_hours: staleAfter,
  };
}

// A source with no recorded outcome is stale: a backfilled watermark proves nothing.
function health(
  row: Omit<SyncRow, "source">,
  staleAfter: number,
  now: number,
): KnowledgeSourceHealth {
  if (row.last_outcome === "failure") {
    return "failed";
  }
  if (row.last_outcome === null || row.watermark === null) {
    return "stale";
  }
  return now - row.watermark.getTime() > staleAfter * HOUR_MS
    ? "stale"
    : "healthy";
}

// True for a run with no finish after its start; a crashed run stays true.
function inProgress(row: Omit<SyncRow, "source">): boolean {
  if (row.last_run_started_at === null) {
    return false;
  }
  return (
    row.last_run_finished_at === null ||
    row.last_run_started_at > row.last_run_finished_at
  );
}
