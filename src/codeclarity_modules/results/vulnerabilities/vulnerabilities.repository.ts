import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { Result } from "src/codeclarity_modules/results/result.entity";
import {
  Output as VulnsOutput,
  Status,
} from "src/codeclarity_modules/results/vulnerabilities/vulnerabilities.types";
import { PluginFailed, PluginResultNotAvailable } from "src/types/error.types";

@Injectable()
export class VulnerabilitiesRepository {
  constructor(
    @InjectRepository(Result, "codeclarity")
    private resultRepository: Repository<Result>,
  ) {}

  async getVulnsResult(analysis_id: string): Promise<VulnsOutput> {
    const result = await this.resultRepository.findOne({
      relations: { analysis: true },
      where: {
        analysis: {
          id: analysis_id,
        },
        plugin: "js-vuln-finder",
      },
      order: {
        analysis: {
          created_on: "DESC",
        },
      },
      cache: true,
    });
    if (!result) {
      throw new PluginResultNotAvailable();
    }

    const vulns: VulnsOutput = result.result as unknown as VulnsOutput;
    if (vulns.analysis_info.status === Status.Failure) {
      throw new PluginFailed();
    }
    return vulns;
  }
}
