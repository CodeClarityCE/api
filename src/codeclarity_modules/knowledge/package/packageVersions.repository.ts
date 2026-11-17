import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { compare as semverCompare } from "semver";
import { Repository } from "typeorm";

import {
  Package,
  Version,
} from "src/codeclarity_modules/knowledge/package/package.entity";
import { EntityNotFound } from "src/types/error.types";

@Injectable()
export class VersionsRepository {
  constructor(
    @InjectRepository(Package, "knowledge")
    private packageRepository: Repository<Package>,
  ) {}

  async getDependencyVersions(
    dependency: string,
    language = "javascript",
  ): Promise<Version[]> {
    const pack = await this.packageRepository.findOne({
      where: {
        name: dependency,
        language: language,
      },
      relations: {
        versions: true,
      },
    });
    if (!pack) {
      throw new EntityNotFound();
    }

    const versions: Version[] = [];
    for (const version of pack.versions) {
      versions.push(version);
    }
    versions.sort((a, b) => semverCompare(a.version, b.version));
    return versions;
  }
}
