import { CodeClarityDataSource } from "../datasources/codeclarity.datasource";
import { KnowledgeDataSource } from "../datasources/knowledge.datasource";
import { PluginsDataSource } from "../datasources/plugins.datasource";

import "reflect-metadata";

async function runAll(): Promise<void> {
  const sources = [
    CodeClarityDataSource,
    KnowledgeDataSource,
    PluginsDataSource,
  ];
  for (const ds of sources) {
    try {
      if (!ds.isInitialized) await ds.initialize();
      await ds.runMigrations();
      await ds.destroy();
      const dbName =
        typeof ds.options.database === "string"
          ? ds.options.database
          : "unknown";
      console.warn(`Migrations executed for ${dbName}`);
    } catch (e) {
      const dbName =
        typeof ds.options.database === "string"
          ? ds.options.database
          : "unknown";
      console.error(`Failed migrations for ${dbName}`, e);
      process.exit(1);
    }
  }
}

void runAll();
