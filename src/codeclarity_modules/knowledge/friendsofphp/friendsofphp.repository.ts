import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { FriendsOfPhp } from "./friendsofphp.entity";

@Injectable()
export class FriendsOfPhpRepository {
  constructor(
    @InjectRepository(FriendsOfPhp, "knowledge")
    private friendsOfPhpRepository: Repository<FriendsOfPhp>,
  ) {}

  async getVuln(cve: string): Promise<FriendsOfPhp | null> {
    try {
      const result = await this.friendsOfPhpRepository.findOne({
        where: { cve: cve },
      });
      return result ?? null;
    } catch (error) {
      console.error("Error fetching FriendsOfPhp vulnerability:", error);
      return null;
    }
  }

  async getVulnByAdvisoryId(advisoryId: string): Promise<FriendsOfPhp | null> {
    try {
      const result = await this.friendsOfPhpRepository.findOne({
        where: { advisory_id: advisoryId },
      });
      return result ?? null;
    } catch (error) {
      console.error(
        "Error fetching FriendsOfPhp vulnerability by advisory ID:",
        error,
      );
      return null;
    }
  }
}
