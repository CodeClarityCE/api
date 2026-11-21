import { readdirSync } from "fs";
import { join } from "path";
import { Client } from "pg";
import { DataSource, type MigrationInterface } from "typeorm";

import { AddRemediationTickets1796040000000 as Migration } from "../../src/migrations/codeclarity/1796040000000-AddRemediationTickets";

const connection = {
  host: process.env["TEST_PG_HOST"] ?? "localhost",
  port: parseInt(process.env["TEST_PG_PORT"] ?? "5432", 10),
  user: process.env["TEST_PG_USER"] ?? "postgres",
  password: process.env["TEST_PG_PASSWORD"] ?? "!ChangeMe!",
};
const database = `test_remediation_tickets_${process.pid}_${Date.now()}`;
const MIGRATIONS_DIR = join(__dirname, "../../src/migrations/codeclarity");
const ROOT = join(__dirname, "../..");

async function admin(sql: string): Promise<void> {
  const client = new Client({ ...connection, database: "postgres" });
  await client.connect();
  await client.query(sql);
  await client.end();
}

// Every codeclarity migration class before this one, oldest first.
function earlierMigrations(): (new () => MigrationInterface)[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".ts"))
    .sort()
    .map(
      (file) =>
        Object.values(
          require(join(MIGRATIONS_DIR, file)) as Record<
            string,
            new () => MigrationInterface
          >,
        )[0]!,
    )
    .filter((M) => M !== Migration);
}

const IDS = {
  org: "00000000-0000-4000-8000-000000000001",
  creator: "00000000-0000-4000-8000-000000000002",
  assignee: "00000000-0000-4000-8000-000000000003",
  project: "00000000-0000-4000-8000-000000000004",
  ticket: "00000000-0000-4000-8000-000000000005",
};

// A one-vulnerability ticket as the earlier schema stored it, with history, assignee and an external link.
async function seedLegacyTicket(source: DataSource): Promise<void> {
  await source.query(
    `INSERT INTO organization (id, name, description, color_scheme, created_on, personal)
     VALUES ($1, 'Org', 'Org', '1', now(), false)`,
    [IDS.org],
  );
  for (const [id, email] of [
    [IDS.creator, "creator@legacy.test"],
    [IDS.assignee, "assignee@legacy.test"],
  ]) {
    await source.query(
      `INSERT INTO "user" (id, first_name, last_name, handle, email, password, social, setup_done, activated, registration_verified, created_on)
       VALUES ($1, 'First', 'Last', $2, $2, 'x', false, true, true, true, now())`,
      [id, email],
    );
  }
  await source.query(
    `INSERT INTO project (id, name, description, integration_type, integration_provider, invalid, downloaded, added_on, type, url, default_branch)
     VALUES ($1, 'api', 'api', 'FILE', 'FILE', false, true, now(), 'FILE', '', 'main')`,
    [IDS.project],
  );
  await source.query(
    `INSERT INTO ticket (id, title, description, status, priority, type, vulnerability_id, affected_package, affected_version, severity_score, severity_class, recommended_version, created_on, "projectId", "organizationId", "createdById", "assignedToId")
     VALUES ($1, 'Fix CVE-2021-23337 in lodash', 'Legacy', 'IN_PROGRESS', 'HIGH', 'VULNERABILITY', 'CVE-2021-23337', 'lodash', '4.17.15', 7.2, 'HIGH', '4.17.21', '2026-01-01T00:00:00Z', $2, $3, $4, $5)`,
    [IDS.ticket, IDS.project, IDS.org, IDS.creator, IDS.assignee],
  );
  await source.query(
    `INSERT INTO ticket_event (event_type, event_data, created_on, "ticketId", "performedById")
     VALUES ('CREATED', '{"source":"manual","vulnerability_id":"CVE-2021-23337"}', '2026-01-01T00:00:00Z', $1, $2),
            ('ASSIGNED', '{"assigned_to_id":"${IDS.assignee}"}', '2026-01-02T00:00:00Z', $1, $2)`,
    [IDS.ticket, IDS.creator],
  );
  await source.query(
    `INSERT INTO ticket_external_link (provider, external_id, external_url, synced_on, "ticketId")
     VALUES ('CLICKUP', 'task-1', 'https://app.clickup.com/t/task-1', now(), $1)`,
    [IDS.ticket],
  );
}

describe("AddRemediationTickets migration", () => {
  let source: DataSource;

  const run = async (step: "up" | "down"): Promise<void> => {
    const runner = source.createQueryRunner();
    await new Migration()[step](runner);
    await runner.release();
  };

  // What a reader of the legacy ticket sees.
  const legacyTicket = async () => {
    const [ticket] = await source.query(
      `SELECT t.title, t.status, t.vulnerability_id, t.affected_package, t.affected_version,
              t.recommended_version, t.severity_class, t."assignedToId" AS assignee,
              (SELECT array_agg(event_type::text ORDER BY created_on) FROM ticket_event e WHERE e."ticketId" = t.id) AS events,
              (SELECT array_agg(external_url) FROM ticket_external_link l WHERE l."ticketId" = t.id) AS links
       FROM ticket t WHERE t.id = $1`,
      [IDS.ticket],
    );
    return ticket;
  };

  const LEGACY = {
    title: "Fix CVE-2021-23337 in lodash",
    status: "IN_PROGRESS",
    vulnerability_id: "CVE-2021-23337",
    affected_package: "lodash",
    affected_version: "4.17.15",
    recommended_version: "4.17.21",
    severity_class: "HIGH",
    assignee: IDS.assignee,
    events: ["CREATED", "ASSIGNED"],
    links: ["https://app.clickup.com/t/task-1"],
  };

  // Schema changes the entities still want after the migrations, for the ticket tables.
  const drift = async (): Promise<string[]> => {
    const entities = new DataSource({
      type: "postgres",
      host: connection.host,
      port: connection.port,
      username: connection.user,
      password: connection.password,
      database,
      entities: [
        join(ROOT, "src/base_modules/!(plugins)/**/*.entity.ts"),
        join(ROOT, "src/codeclarity_modules/!(knowledge)/**/*.entity.ts"),
      ],
    });
    await entities.initialize();
    try {
      const log = await entities.driver.createSchemaBuilder().log();
      return log.upQueries
        .map((q) => q.query)
        .filter((q) => /"ticket"|ticket_vulnerability_occurrence/.test(q));
    } finally {
      await entities.destroy();
    }
  };

  beforeAll(async () => {
    await admin(`CREATE DATABASE ${database}`);
    source = new DataSource({
      type: "postgres",
      host: connection.host,
      port: connection.port,
      username: connection.user,
      password: connection.password,
      database,
      migrations: earlierMigrations(),
      extra: { max: 1 },
    });
    await source.initialize();
    await source.runMigrations();
    await seedLegacyTicket(source);
    await run("up");
  }, 60000);

  afterAll(async () => {
    await source.destroy();
    await admin(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
  });

  it("keeps an existing ticket's vulnerability, history, assignee and external links", async () => {
    expect(await legacyTicket()).toEqual(LEGACY);
  });

  it("leaves an existing ticket tracking its one vulnerability, with no remediation", async () => {
    const [ticket] = await source.query(
      `SELECT remediation_kind, remediation_workspace, remediation_package FROM ticket WHERE id = $1`,
      [IDS.ticket],
    );
    expect(ticket).toEqual({
      remediation_kind: null,
      remediation_workspace: null,
      remediation_package: null,
    });
  });

  it("builds the schema the entities describe", async () => {
    expect(await drift()).toEqual([]);
  }, 60000);

  it("reverts cleanly and applies again, keeping the ticket", async () => {
    await run("down");
    expect(await legacyTicket()).toEqual(LEGACY);
    await run("up");
    expect(await legacyTicket()).toEqual(LEGACY);
    expect(await drift()).toEqual([]);
  }, 60000);
});
