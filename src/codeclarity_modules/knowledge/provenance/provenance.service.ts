import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";

import { EPSSRepository } from "../epss/epss.repository";

export interface KnowledgeProvenance {
  knowledge_sources: Record<string, string | null>;
  epss_rows: number;
}

@Injectable()
export class ProvenanceService {
  constructor(
    @InjectDataSource("config")
    private readonly configDataSource: DataSource,
    private readonly epssRepository: EPSSRepository,
  ) {}

  /**
   * Get the provenance of the knowledge data currently in use
   * @returns the last-update timestamp per source (from the config row's
   *          `*_last` columns) and the EPSS row count
   */
  async get(): Promise<KnowledgeProvenance> {
    // Select the whole row so every `<source>_last` column is picked up,
    // including ones added by the knowledge service after this was written.
    const rows = await this.configDataSource.query<Record<string, unknown>[]>(
      "SELECT * FROM config LIMIT 1",
    );

    const knowledgeSources: Record<string, string | null> = {};
    for (const [column, value] of Object.entries(rows[0] ?? {})) {
      if (!column.endsWith("_last")) {
        continue;
      }
      const source = column.slice(0, -"_last".length);
      if (value === null || value === undefined) {
        knowledgeSources[source] = null;
      } else if (value instanceof Date) {
        knowledgeSources[source] = value.toISOString();
      } else if (typeof value === "string") {
        // npm_last is stored as a varchar; pass it through as-is
        knowledgeSources[source] = value;
      } else {
        knowledgeSources[source] = JSON.stringify(value);
      }
    }

    return {
      knowledge_sources: knowledgeSources,
      epss_rows: await this.epssRepository.count(),
    };
  }
}
