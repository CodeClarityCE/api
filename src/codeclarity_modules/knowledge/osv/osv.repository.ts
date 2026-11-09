import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { OSV } from "src/codeclarity_modules/knowledge/osv/osv.entity";
import {
  activeRecordFilter,
  KnowledgeLookupOptions,
} from "src/codeclarity_modules/knowledge/retired-records";
import { EntityNotFound } from "src/types/error.types";

@Injectable()
export class OSVRepository {
  constructor(
    @InjectRepository(OSV, "knowledge")
    private osvRepository: Repository<OSV>,
  ) {}

  async getVulnGHSA(
    ghsa: string,
    options?: KnowledgeLookupOptions,
  ): Promise<OSV> {
    const osv = await this.osvRepository.findOne({
      where: {
        osv_id: ghsa,
        ...activeRecordFilter(options),
      },
    });
    if (!osv) {
      throw new EntityNotFound();
    }
    return osv;
  }

  async getVulnCVE(
    cve: string,
    options?: KnowledgeLookupOptions,
  ): Promise<OSV> {
    const osv = await this.getVulnByCVEIDWithoutFailing(cve, options);
    if (!osv) {
      throw new EntityNotFound();
    }
    return osv;
  }

  async getVulnByCVEIDWithoutFailing(
    cve: string,
    options?: KnowledgeLookupOptions,
  ): Promise<OSV | null> {
    return this.osvRepository.findOne({
      where: {
        cve: cve,
        ...activeRecordFilter(options),
      },
    });
  }

  async getVulnByOSVIDWithoutFailing(
    osv_id: string,
    options?: KnowledgeLookupOptions,
  ): Promise<OSV | null> {
    return this.osvRepository.findOne({
      where: {
        osv_id: osv_id,
        ...activeRecordFilter(options),
      },
    });
  }
}
