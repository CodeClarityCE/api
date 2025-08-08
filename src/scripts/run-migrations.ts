import 'reflect-metadata';
import { CodeClarityDataSource } from '../datasources/codeclarity.datasource';
import { KnowledgeDataSource } from '../datasources/knowledge.datasource';
import { PluginsDataSource } from '../datasources/plugins.datasource';

async function runAll() {
  const sources = [CodeClarityDataSource, KnowledgeDataSource, PluginsDataSource];
  for (const ds of sources) {
    try {
      if (!ds.isInitialized) await ds.initialize();
      await ds.runMigrations();
      await ds.destroy();
      console.log(`Migrations executed for ${ds.options['database']}`);
    } catch (e) {
      console.error(`Failed migrations for ${ds.options['database']}`, e);
      process.exit(1);
    }
  }
}

runAll();
