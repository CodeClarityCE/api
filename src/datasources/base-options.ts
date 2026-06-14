import * as dotenv from "dotenv";
import * as fs from "fs";

// Shared Postgres connection options. We declare this locally instead of
// importing typeorm's PostgresConnectionOptions: typeorm's "exports" map only
// exposes the package root to TypeScript's module resolution, so the deep type
// subpath (typeorm/driver/postgres/...) is not resolvable. The `type: "postgres"`
// literal lets the spread sites narrow typeorm's DataSourceOptions union.
export interface BaseConnectionOptions {
  type: "postgres";
  host?: string;
  port: number;
  username?: string;
  password?: string;
  ssl: false | { rejectUnauthorized: boolean; ca?: string };
  logging: boolean;
}

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
    rejectUnauthorized: sslMode === "verify-full" || sslMode === "verify-ca",
  };

  const caPath = process.env["PG_DB_SSLROOTCERT"];
  if (caPath) {
    // Operator-supplied path from env; not user input.
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    opts.ca = fs.readFileSync(caPath, "utf-8");
  }

  return opts;
}

export function buildBaseOptions(): BaseConnectionOptions {
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
  } as BaseConnectionOptions;
}

export const defaultOptions: BaseConnectionOptions & { synchronize: boolean } = {
  ...buildBaseOptions(),
  synchronize: process.env["DB_FORCE_SYNC"] === "true",
};
