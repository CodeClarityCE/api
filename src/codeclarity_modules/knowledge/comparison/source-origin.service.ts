import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";

export interface MatchedRecord {
  source: string;
  record_id: string;
}

// vuln-finder names FriendsOfPHP matches by this prefix and the advisory id.
const FRIENDS_OF_PHP_PREFIX = "FRIENDSOFPHP-";

// Table and id column holding each source's records.
const RECORD_TABLES: Record<string, { table: string; id: string }> = {
  osv: { table: "osv", id: "osv_id" },
  nvd: { table: "nvd", id: "nvd_id" },
  gcve: { table: "gcve", id: "gcve_id" },
  friends_of_php: { table: "friends_of_php", id: "advisory_id" },
};

export const originKey = (record: MatchedRecord): string =>
  `${record.source}:${record.record_id}`;

@Injectable()
export class SourceOriginService {
  constructor(
    @InjectDataSource("knowledge")
    private readonly knowledgeDataSource: DataSource,
  ) {}

  /** Looks up each record's origin, keyed by originKey; records not found are left out. */
  async originsOf(records: MatchedRecord[]): Promise<Map<string, string>> {
    const origins = new Map<string, string>();
    for (const [source, { table, id }] of Object.entries(RECORD_TABLES)) {
      const ids = [
        ...new Set(
          records
            .filter((r) => r.source === source)
            .map((r) => storedId(source, r.record_id)),
        ),
      ];
      if (ids.length === 0) continue;
      // Retired records keep their origin, so they are looked up too.
      const rows = await this.knowledgeDataSource.query<
        { id: string; origin: string }[]
      >(
        `SELECT "${id}" AS id, origin FROM "${table}" WHERE "${id}" = ANY($1)`,
        [ids],
      );
      const bySourceId = new Map(rows.map((row) => [row.id, row.origin]));
      for (const record of records) {
        if (record.source !== source) continue;
        const origin = bySourceId.get(storedId(source, record.record_id));
        if (origin) origins.set(originKey(record), origin);
      }
    }
    return origins;
  }
}

function storedId(source: string, recordId: string): string {
  return source === "friends_of_php" &&
    recordId.startsWith(FRIENDS_OF_PHP_PREFIX)
    ? recordId.slice(FRIENDS_OF_PHP_PREFIX.length)
    : recordId;
}
