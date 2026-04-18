import type { DataSource } from "typeorm";

import "reflect-metadata";

// Use admin credentials for migrations if available.
// Migrations need DDL privileges (CREATE TABLE, CREATE INDEX) across databases
// whose tables are owned by different roles (cc_api, cc_knowledge, etc.).
// In dev, PG_DB_ADMIN_USER is not set, so this is a no-op.
const useAdmin = !!process.env["PG_DB_ADMIN_USER"];
if (useAdmin) {
  process.env["PG_DB_USER"] = process.env["PG_DB_ADMIN_USER"];
  process.env["PG_DB_PASSWORD"] = process.env["PG_DB_ADMIN_PASSWORD"] ?? "";
}

// Role mapping: each database's objects should be owned by the correct role.
// SET ROLE ensures any objects created by migrations get the right owner.
const roleForDb: Record<string, string> = {
  codeclarity: process.env["PG_CODECLARITY_ROLE"] ?? "cc_api",
  knowledge: process.env["PG_KNOWLEDGE_ROLE"] ?? "cc_knowledge",
  plugins: process.env["PG_PLUGINS_ROLE"] ?? "cc_api",
  config: process.env["PG_CONFIG_ROLE"] ?? "cc_api",
};

async function runAll(): Promise<void> {
  // Dynamic imports so datasources pick up the overridden PG_DB_USER/PASSWORD
  const { CodeClarityDataSource } = await import(
    "../datasources/codeclarity.datasource"
  );
  const { KnowledgeDataSource } = await import(
    "../datasources/knowledge.datasource"
  );
  const { PluginsDataSource } = await import(
    "../datasources/plugins.datasource"
  );
  const { ConfigDataSource } = await import(
    "../datasources/config.datasource"
  );

  const sources: DataSource[] = [
    CodeClarityDataSource,
    KnowledgeDataSource,
    PluginsDataSource,
    ConfigDataSource,
  ];

  for (const ds of sources) {
    const dbName =
      typeof ds.options.database === "string"
        ? ds.options.database
        : "unknown";
    try {
      if (!ds.isInitialized) await ds.initialize();

      // SET ROLE so created objects are owned by the correct role
      const role = roleForDb[dbName];
      if (useAdmin && role) {
        await ds.query(`SET ROLE ${role}`);
      }

      await ds.runMigrations();
      await ds.destroy();
      console.warn(`Migrations executed for ${dbName}`);
    } catch (e) {
      console.error(`Failed migrations for ${dbName}`, e);
      process.exit(1);
    }
  }
}

void runAll();
