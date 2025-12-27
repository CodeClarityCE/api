import { Injectable } from "@nestjs/common";
import { License } from "src/codeclarity_modules/knowledge/license/license.entity";
import { LicenseRepository } from "src/codeclarity_modules/knowledge/license/license.repository";

@Injectable()
export class LicenseService {
  constructor(private readonly licenceRepo: LicenseRepository) {}

  /**
   * Get a license policy
   * @param licenseId The id of the org
   * @returns the license policy
   */
  async get(licenseId: string): Promise<License> {
    return await this.licenceRepo.getLicenseData(licenseId);
  }

  /**
   * Get a license policy
   * @returns the license policy
   */
  async getAll(): Promise<License[]> {
    return await this.licenceRepo.getAllLicenseData();
  }
}
