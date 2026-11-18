import { DataSource } from "typeorm";

import {
  createRunDatabase,
  dropRunDatabase,
  runDatabaseName,
} from "./run-database";

/**
 * Opens a new database of the suite's own, unique to this run, with the
 * codeclarity schema synchronized from the entities. Close it with
 * closeScratchDatabase, which drops it.
 */
export async function openScratchDatabase(name: string): Promise<DataSource> {
  if (!/^codeclarity_[a-z_]+_it$/.test(name)) {
    throw new Error(
      `Scratch database names look like codeclarity_<suite>_it, not ${name}`,
    );
  }
  const database = runDatabaseName(name);
  await createRunDatabase(database);

  const dataSource = new DataSource({
    type: "postgres",
    host: process.env["PG_DB_HOST"] ?? "localhost",
    port: Number(process.env["PG_DB_PORT"] ?? 5432),
    username: process.env["PG_DB_USER"] ?? "postgres",
    password: process.env["PG_DB_PASSWORD"] ?? "",
    database,
    entities: [
      "src/base_modules/!(plugins)/**/*.entity.ts",
      "src/codeclarity_modules/!(knowledge)/**/*.entity.ts",
    ],
    synchronize: true,
  });
  try {
    return await dataSource.initialize();
  } catch (error) {
    await dropRunDatabase(database);
    throw error;
  }
}

/** Closes a scratch database's connections and drops it. */
export async function closeScratchDatabase(
  dataSource: DataSource | undefined,
): Promise<void> {
  if (!dataSource) return;
  const database = String(dataSource.options.database);
  if (dataSource.isInitialized) await dataSource.destroy();
  await dropRunDatabase(database);
}
