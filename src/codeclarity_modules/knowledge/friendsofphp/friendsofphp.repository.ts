import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { activeRecordFilter, KnowledgeLookupOptions } from "../retired-records";

import { FriendsOfPhp } from "./friendsofphp.entity";

@Injectable()
export class FriendsOfPhpRepository {
  constructor(
    @InjectRepository(FriendsOfPhp, "knowledge")
    private friendsOfPhpRepository: Repository<FriendsOfPhp>,
  ) {}

  async getVuln(
    cve: string,
    options?: KnowledgeLookupOptions,
  ): Promise<FriendsOfPhp | null> {
    try {
      const result = await this.friendsOfPhpRepository.findOne({
        where: { cve: cve, ...activeRecordFilter(options) },
      });
      return result ?? null;
    } catch (error) {
      console.error("Error fetching FriendsOfPhp vulnerability:", error);
      return null;
    }
  }

  async getVulnByAdvisoryId(
    advisoryId: string,
    options?: KnowledgeLookupOptions,
  ): Promise<FriendsOfPhp | null> {
    try {
      const result = await this.friendsOfPhpRepository.findOne({
        where: { advisory_id: advisoryId, ...activeRecordFilter(options) },
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
