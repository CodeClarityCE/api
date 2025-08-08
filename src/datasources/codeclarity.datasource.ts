import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { buildBaseOptions } from './base-options';

const isTs = __filename.endsWith('.ts');
const entities = [isTs ? 'src/**/*.entity.ts' : 'dist/src/**/*.entity.js'];
const migrations = [isTs ? 'src/migrations/codeclarity/*.ts' : 'dist/src/migrations/codeclarity/*.js'];

export const CodeClarityDataSource = new DataSource({
  ...buildBaseOptions(),
  name: 'codeclarity',
  database: 'codeclarity',
  entities,
  migrations
});
