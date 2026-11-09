import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { GCVE } from "src/codeclarity_modules/knowledge/gcve/gcve.entity";
import {
  activeRecordFilter,
  KnowledgeLookupOptions,
} from "src/codeclarity_modules/knowledge/retired-records";

@Injectable()
export class GCVERepository {
  constructor(
    @InjectRepository(GCVE, "knowledge")
    private gcveRepository: Repository<GCVE>,
  ) {}

  async getVulnByCVEId(
    cveId: string,
    options?: KnowledgeLookupOptions,
  ): Promise<GCVE | null> {
    return this.gcveRepository.findOne({
      where: {
        cve_id: cveId,
        ...activeRecordFilter(options),
      },
    });
  }

  async getVulnByGCVEId(gcveId: string): Promise<GCVE | null> {
    return this.gcveRepository.findOne({
      where: {
        gcve_id: gcveId,
        ...activeRecordFilter(),
      },
    });
  }
}
