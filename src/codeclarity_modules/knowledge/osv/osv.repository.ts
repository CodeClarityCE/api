import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { OSV } from "src/codeclarity_modules/knowledge/osv/osv.entity";
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

  async getVulnByCVEIDWithoutFailing(cve: string): Promise<OSV | null> {
    return this.osvRepository.findOne({
      where: {
        cve: cve,
      },
    });
  }

  async getVulnByOSVIDWithoutFailing(osv_id: string): Promise<OSV | null> {
    return this.osvRepository.findOne({
      where: {
        osv_id: osv_id,
      },
    });
  }
}
