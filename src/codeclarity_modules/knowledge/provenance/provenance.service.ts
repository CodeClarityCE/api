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
    @InjectDataSource("knowledge")
    private readonly knowledgeDataSource: DataSource,
    private readonly epssRepository: EPSSRepository,
  ) {}

  /**
   * Get the provenance of the knowledge data currently in use
   * @returns each source's watermark and the EPSS row count
   */
  async get(): Promise<KnowledgeProvenance> {
    const rows = await this.knowledgeDataSource.query<
      { source: string; watermark: Date | null }[]
    >("SELECT source, watermark FROM knowledge_source_sync ORDER BY source");

    const knowledgeSources: Record<string, string | null> = {};
    for (const { source, watermark } of rows) {
      knowledgeSources[source] = watermark?.toISOString() ?? null;
    }

    return {
      knowledge_sources: knowledgeSources,
      epss_rows: await this.epssRepository.count(),
    };
  }
}
