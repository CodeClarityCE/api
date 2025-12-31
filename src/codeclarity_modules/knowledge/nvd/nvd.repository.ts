import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { NVD } from "src/codeclarity_modules/knowledge/nvd/nvd.entity";
import { EntityNotFound } from "src/types/error.types";

@Injectable()
export class NVDRepository {
  constructor(
    @InjectRepository(NVD, "knowledge")
    private nvdRepository: Repository<NVD>,
  ) {}

  async getVuln(cve: string): Promise<NVD> {
    const nvd = await this.getVulnWithoutFailing(cve);
    if (!nvd) {
      throw new EntityNotFound();
    }
    return nvd;
  }

  async getVulnWithoutFailing(cve: string): Promise<NVD | null> {
    return await this.nvdRepository.findOne({
      where: {
        nvd_id: cve,
      },
    });
  }
}
