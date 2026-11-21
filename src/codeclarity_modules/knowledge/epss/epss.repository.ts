import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";

import { EPSS } from "./epss.entity";

@Injectable()
export class EPSSRepository {
  constructor(
    @InjectRepository(EPSS, "knowledge")
    private epssRepository: Repository<EPSS>,
  ) {}

  async count(): Promise<number> {
    return await this.epssRepository.count();
  }

  async getByCVE(cveId: string): Promise<EPSS> {
    const epss = await this.epssRepository.findOne({
      where: { cve: cveId },
    });
    if (!epss) {
      return new EPSS();
    }

    return epss;
  }

  /** The scores of the CVEs that have one, keyed by uppercase CVE id. */
  async scoresOf(cves: string[]): Promise<Map<string, number>> {
    const ids = [...new Set(cves.map((cve) => cve.toUpperCase()))];
    if (ids.length === 0) return new Map();
    const rows = await this.epssRepository.find({ where: { cve: In(ids) } });
    return new Map(
      rows
        .filter((row) => row.score !== null && row.score !== undefined)
        .map((row) => [row.cve.toUpperCase(), row.score]),
    );
  }
}
