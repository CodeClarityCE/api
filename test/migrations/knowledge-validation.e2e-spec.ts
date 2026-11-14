import { Client } from "pg";
import { DataSource } from "typeorm";

import { AddKnowledgeValidation1794355200000 as Migration } from "../../src/migrations/knowledge/1794355200000-AddKnowledgeValidation";

const connection = {
  host: process.env["TEST_PG_HOST"] ?? "host.docker.internal",
  port: parseInt(process.env["TEST_PG_PORT"] ?? "5432", 10),
  user: process.env["TEST_PG_USER"] ?? "postgres",
  password: process.env["TEST_PG_PASSWORD"] ?? "!ChangeMe!",
};
const knowledgeDb = `test_knowledge_validation_${process.pid}_${Date.now()}`;

async function admin(sql: string): Promise<void> {
  const client = new Client({ ...connection, database: "postgres" });
  await client.connect();
  await client.query(sql);
  await client.end();
}

describe("AddKnowledgeValidation migration", () => {
  let knowledge: DataSource;

  beforeEach(async () => {
    await admin(`CREATE DATABASE ${knowledgeDb}`);
    knowledge = new DataSource({
      type: "postgres",
      host: connection.host,
      port: connection.port,
      username: connection.user,
      password: connection.password,
      database: knowledgeDb,
      extra: { max: 1 },
    });
    await knowledge.initialize();
    await knowledge.query(
      `CREATE TABLE knowledge_source_sync (source varchar PRIMARY KEY, row_count bigint NOT NULL DEFAULT 0)`,
    );
    await knowledge.query(
      `INSERT INTO knowledge_source_sync (source, row_count) VALUES ('nvd', 7)`,
    );
  });

  afterEach(async () => {
    await knowledge.destroy();
    await admin(`DROP DATABASE ${knowledgeDb}`);
  });

  const migrate = async (): Promise<void> => {
    const runner = knowledge.createQueryRunner();
    await new Migration().up(runner);
    await runner.release();
  };

  it("adds validation columns, unset for existing sources", async () => {
    await migrate();

    const [row] = await knowledge.query(
      `SELECT row_count, validated_row_count, validated_malicious_count, validated_at, validation_error FROM knowledge_source_sync`,
    );
    expect(row).toEqual({
      row_count: "7",
      validated_row_count: null,
      validated_malicious_count: null,
      validated_at: null,
      validation_error: null,
    });
  });

  it("keeps a marker table allowing only one row", async () => {
    await migrate();

    await knowledge.query(
      `INSERT INTO knowledge_dated_restore (label) VALUES ('2025-01')`,
    );
    await expect(
      knowledge.query(
        `INSERT INTO knowledge_dated_restore (id, label) VALUES (false, 'x')`,
      ),
    ).rejects.toThrow();
  });

  it("keeps a marker written before the migration ran", async () => {
    await knowledge.query(`
      CREATE TABLE knowledge_dated_restore (
        id boolean PRIMARY KEY DEFAULT true CHECK (id),
        label character varying NOT NULL,
        marked_at timestamptz NOT NULL DEFAULT now()
      )`);
    await knowledge.query(
      `INSERT INTO knowledge_dated_restore (label) VALUES ('old-rung')`,
    );

    await migrate();

    const [row] = await knowledge.query(
      `SELECT label FROM knowledge_dated_restore`,
    );
    expect(row.label).toBe("old-rung");
  });
});
