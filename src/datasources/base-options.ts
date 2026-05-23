import * as dotenv from "dotenv";
import * as fs from "fs";
import type { PostgresDataSourceOptions } from "typeorm/driver/postgres/PostgresDataSourceOptions";

// Load environment file similar to app.module logic
const ENV = process.env["ENV"] ?? "dev";
try {
  dotenv.config({ path: `env/.env.${ENV}` });
} catch (_) {
  // ignore if not present
}

export function buildSslOptions():
  | false
  | { rejectUnauthorized: boolean; ca?: string } {
  const sslMode =
    process.env["PG_DB_SSLMODE"] ?? (ENV === "prod" ? "require" : "disable");

  if (sslMode === "disable") {
    return false;
  }

  const opts: { rejectUnauthorized: boolean; ca?: string } = {
    rejectUnauthorized:
      sslMode === "verify-full" || sslMode === "verify-ca",
  };

  const caPath = process.env["PG_DB_SSLROOTCERT"];
  if (caPath) {
    opts.ca = fs.readFileSync(caPath, "utf-8");
  }

  return opts;
}

export function buildBaseOptions(): PostgresDataSourceOptions {
  if (
    ENV === "prod" &&
    process.env["PG_DB_PASSWORD"]?.startsWith("!ChangeMe")
  ) {
    console.error(
      "WARNING: PG_DB_PASSWORD is still set to a default placeholder — set a real password before deploying to production",
    );
  }

  return {
    type: "postgres",
    host: process.env["PG_DB_HOST"],
    port: parseInt(process.env["PG_DB_PORT"] ?? "6432", 10),
    username: process.env["PG_DB_USER"],
    password: process.env["PG_DB_PASSWORD"],
    ssl: buildSslOptions(),
    logging: false,
  } as PostgresDataSourceOptions;
}

export const defaultOptions: PostgresDataSourceOptions = {
  ...buildBaseOptions(),
  synchronize: process.env["DB_FORCE_SYNC"] === "true",
};
