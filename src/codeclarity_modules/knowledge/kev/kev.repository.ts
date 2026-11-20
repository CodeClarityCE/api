import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";

import type { AliasedRecord } from "../comparison/canonical-vulnerability";

import { Kev } from "./kev.entity";

const normalize = (id: string): string => id.trim().toUpperCase();

@Injectable()
export class KevRepository {
  constructor(
    @InjectRepository(Kev, "knowledge")
    private kevRepository: Repository<Kev>,
  ) {}

  /** Maps each canonical vulnerability's id to the KEV entry its id or an alias names; the earliest added wins. */
  async findForVulnerabilities(
    vulnerabilities: AliasedRecord[],
  ): Promise<Map<string, Kev>> {
    const ids = new Set<string>();
    for (const vulnerability of vulnerabilities) {
      for (const id of [vulnerability.id, ...vulnerability.aliases]) {
        ids.add(normalize(id));
      }
    }
    const found = new Map<string, Kev>();
    if (ids.size === 0) return found;

    const entries = await this.kevRepository.find({
      where: { cve: In([...ids]) },
    });
    const byCve = new Map<string, Kev>();
    for (const entry of entries) byCve.set(entry.cve, entry);

    for (const vulnerability of vulnerabilities) {
      const matches = [vulnerability.id, ...vulnerability.aliases]
        .map((id) => byCve.get(normalize(id)))
        .filter((entry): entry is Kev => entry !== undefined);
      const earliest = matches.sort((a, b) =>
        a.date_added === b.date_added
          ? a.cve.localeCompare(b.cve)
          : a.date_added.localeCompare(b.date_added),
      )[0];
      if (earliest) found.set(vulnerability.id, earliest);
    }
    return found;
  }
}
