import "reflect-metadata";
import * as dotenv from "dotenv";
import { type DataSource } from "typeorm";
import { CodeClarityDataSource } from "../datasources/codeclarity.datasource";
import { KnowledgeDataSource } from "../datasources/knowledge.datasource";
import { PluginsDataSource } from "../datasources/plugins.datasource";

const ENV = process.env["ENV"] ?? "dev";
try {
  dotenv.config({ path: `env/.env.${ENV}` });
} catch (err) {
  // Intentionally ignore missing env file; defaults will be used.
  if (process.env["DEBUG_MIGRATIONS"]) {
    console.warn("Env load failed:", err);
  }
}

const map: Record<string, DataSource> = {
  codeclarity: CodeClarityDataSource,
  knowledge: KnowledgeDataSource,
  plugins: PluginsDataSource,
};

async function run(connection: string): Promise<void> {
  const ds = map[connection];
  if (!ds) {
    console.error(`Unknown datasource ${connection}`);
    process.exit(1);
  }
  try {
    if (!ds.isInitialized) {
      await ds.initialize();
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
