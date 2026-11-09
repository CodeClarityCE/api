import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Raw, Repository } from "typeorm";

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

  async getVulnGHSA(ghsa: string): Promise<OSV> {
    const osv = await this.osvRepository.findOne({
      where: {
        osv_id: ghsa,
        ...activeRecordFilter(),
      },
    });
    if (!osv) {
      throw new EntityNotFound();
    }
    return osv;
  }

  async getVulnCVE(cve: string): Promise<OSV> {
    const osv = await this.getVulnByCVEIDWithoutFailing(cve);
    if (!osv) {
      throw new EntityNotFound();
    }
    return osv;
  }

  // Matches any CVE alias, and picks the same record every time when several share it.
  async getVulnByCVEIDWithoutFailing(
    cve: string,
    options?: KnowledgeLookupOptions,
  ): Promise<OSV | null> {
    return this.osvRepository.findOne({
      where: {
        cve_aliases: Raw(
          (alias) => `${alias} @> to_jsonb(CAST(:cve AS text))`,
          {
            cve,
          },
        ),
        ...activeRecordFilter(options),
      },
      order: {
        kind: "DESC",
        retired_at: { direction: "ASC", nulls: "FIRST" },
        osv_id: "ASC",
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
