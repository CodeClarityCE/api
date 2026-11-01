import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

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
}
