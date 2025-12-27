import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { License } from "src/codeclarity_modules/knowledge/license/license.entity";
import { EntityNotFound } from "src/types/error.types";
import { Repository } from "typeorm";

@Injectable()
export class LicenseRepository {
  constructor(
    @InjectRepository(License, "knowledge")
    private licenseRepository: Repository<License>,
  ) {}

  async getLicenseData(licenseId: string): Promise<License> {
    const license = await this.licenseRepository.findOne({
      where: { licenseId: licenseId },
    });

    if (!license) {
      throw new EntityNotFound();
    }

    return license;
  }

  async getAllLicenseData(): Promise<License[]> {
    const licenses = await this.licenseRepository.find({});
    return licenses;
  }
}
