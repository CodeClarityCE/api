import { Client } from "pg";
import { DataSource } from "typeorm";

import { FriendsOfPhp } from "../../src/codeclarity_modules/knowledge/friendsofphp/friendsofphp.entity";
import { FriendsOfPhpRepository } from "../../src/codeclarity_modules/knowledge/friendsofphp/friendsofphp.repository";

const connection = {
  host: process.env["TEST_PG_HOST"] ?? "host.docker.internal",
  port: parseInt(process.env["TEST_PG_PORT"] ?? "5432", 10),
  user: process.env["TEST_PG_USER"] ?? "postgres",
  password: process.env["TEST_PG_PASSWORD"] ?? "!ChangeMe!",
};
const database = `test_fop_lookup_${process.pid}_${Date.now()}`;

async function admin(sql: string): Promise<void> {
  const client = new Client({ ...connection, database: "postgres" });
  await client.connect();
  await client.query(sql);
  await client.end();
}

describe("FriendsOfPHP lookup by CVE", () => {
  let knowledge: DataSource;
  let repository: FriendsOfPhpRepository;

  beforeAll(async () => {
    await admin(`CREATE DATABASE ${database}`);
    knowledge = new DataSource({
      type: "postgres",
      host: connection.host,
      port: connection.port,
      username: connection.user,
      password: connection.password,
      database,
      entities: [FriendsOfPhp],
      synchronize: true,
      extra: { max: 1 },
    });
    await knowledge.initialize();
    await knowledge.query(`
      INSERT INTO friends_of_php (advisory_id, title, cve, link, reference, retired_at, retired_reason)
      VALUES
        ('PKSA-old', 'old', 'CVE-2024-1', '', '', now(), 'removed'),
        ('vendor/pkg/CVE-2024-1', 'current', 'CVE-2024-1', '', 'composer://vendor/pkg', NULL, NULL),
        ('PKSA-gone', 'gone', 'CVE-2024-2', '', '', now(), 'removed');
    `);
    repository = new FriendsOfPhpRepository(
      knowledge.getRepository(FriendsOfPhp),
    );
  });

  afterAll(async () => {
    await knowledge.destroy();
    await admin(`DROP DATABASE ${database} WITH (FORCE)`);
  });

  it("prefers the active record over a retired one for the same CVE", async () => {
    const found = await repository.getVuln("CVE-2024-1", {
      includeRetired: true,
    });

    expect(found?.advisory_id).toBe("vendor/pkg/CVE-2024-1");
  });

  it("still finds a retired record when it is the only one and retired records are asked for", async () => {
    await expect(repository.getVuln("CVE-2024-2")).resolves.toBeNull();
    const retired = await repository.getVuln("CVE-2024-2", {
      includeRetired: true,
    });
    expect(retired?.advisory_id).toBe("PKSA-gone");
  });
});
