import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { GCVE } from "src/codeclarity_modules/knowledge/gcve/gcve.entity";

@Injectable()
export class GCVERepository {
  constructor(
    @InjectRepository(GCVE, "knowledge")
    private gcveRepository: Repository<GCVE>,
  ) {}

  async getVulnByCVEId(cveId: string): Promise<GCVE | null> {
    return this.gcveRepository.findOne({
      where: {
        cve_id: cveId,
      },
    });
  }

  async getVulnByGCVEId(gcveId: string): Promise<GCVE | null> {
    return this.gcveRepository.findOne({
      where: {
        gcve_id: gcveId,
      },
    });
  }
}
