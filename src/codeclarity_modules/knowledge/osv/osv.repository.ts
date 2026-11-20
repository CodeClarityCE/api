import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Raw, Repository } from "typeorm";

import {
  AffectedPackage,
  affectsPackage,
} from "src/codeclarity_modules/knowledge/osv/affected-package";
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

  // Matches any CVE alias, keeps records affecting the package (any when null), and picks the same one every time.
  async getVulnByCVEIDWithoutFailing(
    cve: string,
    affectedPackage: AffectedPackage | null,
    options?: KnowledgeLookupOptions,
  ): Promise<OSV | null> {
    const candidates = await this.osvRepository.find({
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
    return (
      candidates.find(
        (osv) =>
          !affectedPackage || affectsPackage(osv.affected, affectedPackage),
      ) ?? null
    );
  }

  /** Every record of one vulnerability: the record with this id and those listing it as a CVE alias. */
  async getVulnsOfVulnerability(
    id: string,
    options?: KnowledgeLookupOptions,
  ): Promise<OSV[]> {
    const retired = activeRecordFilter(options);
    return this.osvRepository.find({
      where: [
        { osv_id: id, ...retired },
        {
          cve_aliases: Raw(
            (alias) => `${alias} @> to_jsonb(CAST(:id AS text))`,
            { id },
          ),
          ...retired,
        },
      ],
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
