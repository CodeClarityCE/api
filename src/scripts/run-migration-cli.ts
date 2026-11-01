import * as dotenv from "dotenv";
import { type DataSource } from "typeorm";

import "reflect-metadata";

const ENV = process.env["ENV"] ?? "dev";
try {
  dotenv.config({ path: `env/.env.${ENV}` });
} catch (err) {
  // Intentionally ignore missing env file; defaults will be used.
  if (process.env["DEBUG_MIGRATIONS"]) {
    console.warn("Env load failed:", err);
  }
}

// Use admin credentials for migrations if available.
// Migrations need DDL privileges across databases owned by different roles.
const useAdmin = !!process.env["PG_DB_ADMIN_USER"];
if (useAdmin) {
  process.env["PG_DB_USER"] = process.env["PG_DB_ADMIN_USER"];
  process.env["PG_DB_PASSWORD"] = process.env["PG_DB_ADMIN_PASSWORD"] ?? "";
}

// Role mapping: SET ROLE ensures created objects are owned by the correct role.
const roleForDb: Record<string, string> = {
  codeclarity: process.env["PG_CODECLARITY_ROLE"] ?? "cc_api",
  knowledge: process.env["PG_KNOWLEDGE_ROLE"] ?? "cc_knowledge",
  plugins: process.env["PG_PLUGINS_ROLE"] ?? "cc_api",
  config: process.env["PG_CONFIG_ROLE"] ?? "cc_api",
};

// Dynamic imports so datasources pick up the overridden PG_DB_USER/PASSWORD
async function loadDatasources(): Promise<Record<string, DataSource>> {
  const { CodeClarityDataSource } =
    await import("../datasources/codeclarity.datasource");
  const { ConfigDataSource } = await import("../datasources/config.datasource");
  const { KnowledgeDataSource } =
    await import("../datasources/knowledge.datasource");
  const { PluginsDataSource } =
    await import("../datasources/plugins.datasource");

  return {
    codeclarity: CodeClarityDataSource,
    config: ConfigDataSource,
    knowledge: KnowledgeDataSource,
    plugins: PluginsDataSource,
  };
}

async function run(connection: string): Promise<void> {
  const map = await loadDatasources();
  const ds = map[connection];
  if (!ds) {
    console.error(`Unknown datasource ${connection}`);
    process.exit(1);
  }
  try {
    if (!ds.isInitialized) {
      await ds.initialize();
    }

    // SET ROLE so created objects are owned by the correct role
    const role = roleForDb[connection];
    if (useAdmin && role) {
      await ds.query(`SET ROLE ${role}`);
    }

    await ds.runMigrations();
    await ds.destroy();
    console.warn(`Migrations run for ${connection}`);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

const arg = process.argv[2];
if (!arg) {
  console.error("Missing argument");
  process.exit(1);
}
void run(arg);
