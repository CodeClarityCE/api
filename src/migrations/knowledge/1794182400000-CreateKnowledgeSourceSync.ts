import { DataSource, MigrationInterface, QueryRunner } from "typeorm";

// Knowledge sources tracked here; each name is also its table in this database.
const SOURCES = [
  "cwe",
  "epss",
  "friends_of_php",
  "gcve",
  "licenses",
  "nvd",
  "osv",
];

// Sources with a watermark in the config row, and the column holding it.
const CONFIG_COLUMNS: Record<string, string> = {
  gcve: "gcve_last",
  nvd: "nvd_last",
  osv: "osv_last",
};

export class CreateKnowledgeSourceSync1794182400000 implements MigrationInterface {
  name = "CreateKnowledgeSourceSync1794182400000";

  constructor(private readonly configDatabase = "config") {}

  public async up(queryRunner: QueryRunner): Promise<void> {
    const config = await this.readConfigRow(queryRunner);

    // This only runs when the migration is unrecorded, so any existing table
    // is left over from before a dump restore and its rows are not valid.
    await queryRunner.query(`DROP TABLE IF EXISTS "knowledge_source_sync"`);
    await queryRunner.query(`
      CREATE TABLE "knowledge_source_sync" (
        "source" character varying NOT NULL,
        "watermark" timestamptz,
        "last_run_started_at" timestamptz,
        "last_run_finished_at" timestamptz,
        "last_outcome" character varying,
        "last_error" text,
        "row_count" bigint NOT NULL DEFAULT 0,
        CONSTRAINT "PK_knowledge_source_sync" PRIMARY KEY ("source"),
        CONSTRAINT "CHK_knowledge_source_sync_last_outcome"
          CHECK ("last_outcome" IN ('success', 'failure'))
      )
    `);

    for (const source of SOURCES) {
      const column = CONFIG_COLUMNS[source];
      await queryRunner.query(
        `INSERT INTO "knowledge_source_sync" ("source", "watermark", "row_count") VALUES ($1, $2, $3)`,
        [
          source,
          column ? toWatermark(config[column]) : null,
          await countRows(queryRunner, source),
        ],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "knowledge_source_sync"`);
  }

  // Reads the row as JSON because an older config database can lack some columns.
  private async readConfigRow(
    queryRunner: QueryRunner,
  ): Promise<Record<string, unknown>> {
    const configSource = new DataSource({
      ...queryRunner.connection.options,
      database: this.configDatabase,
      entities: [],
      migrations: [],
    } as typeof queryRunner.connection.options);
    await configSource.initialize();
    try {
      const [table] = await configSource.query(
        `SELECT to_regclass('public.config') AS name`,
      );
      if (table.name === null) {
        return {};
      }
      const [row] = await configSource.query(
        `SELECT to_jsonb(c) AS config FROM config c LIMIT 1`,
      );
      return row?.config ?? {};
    } finally {
      await configSource.destroy();
    }
  }
}

// Go writes year 1 for an unset time, which means the source never synced.
function toWatermark(value: unknown): Date | null {
  if (typeof value !== "string") {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) || date.getUTCFullYear() <= 1
    ? null
    : date;
}

async function countRows(
  queryRunner: QueryRunner,
  table: string,
): Promise<string> {
  const [found] = await queryRunner.query(`SELECT to_regclass($1) AS name`, [
    `public."${table}"`,
  ]);
  if (found.name === null) {
    return "0";
  }
  const [row] = await queryRunner.query(
    `SELECT count(*) AS total FROM "${table}"`,
  );
  return row.total;
}
