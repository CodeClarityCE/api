import { Client } from "pg";
import { DataSource } from "typeorm";

function connection(): {
  host: string;
  port: number;
  user: string;
  password: string;
} {
  return {
    host: process.env["PG_DB_HOST"] ?? "localhost",
    port: Number(process.env["PG_DB_PORT"] ?? 5432),
    user: process.env["PG_DB_USER"] ?? "postgres",
    password: process.env["PG_DB_PASSWORD"] ?? "",
  };
}

/**
 * Opens a database of the suite's own, created if missing, with the codeclarity
 * schema synchronized from the entities. Its schema is dropped on every open.
 */
export async function openScratchDatabase(name: string): Promise<DataSource> {
  if (!/^codeclarity_[a-z_]+_it$/.test(name)) {
    throw new Error(
      `Scratch database names look like codeclarity_<suite>_it, not ${name}`,
    );
  }
  const { user, ...rest } = connection();
  const admin = new Client({ ...rest, user, database: "postgres" });
  await admin.connect();
  try {
    const found = await admin.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [name],
    );
    if (found.rowCount === 0) await admin.query(`CREATE DATABASE ${name}`);
  } finally {
    await admin.end();
  }

  const dataSource = new DataSource({
    type: "postgres",
    ...rest,
    username: user,
    database: name,
    entities: [
      "src/base_modules/!(plugins)/**/*.entity.ts",
      "src/codeclarity_modules/!(knowledge)/**/*.entity.ts",
    ],
    dropSchema: true,
    synchronize: true,
  });
  return dataSource.initialize();
}
