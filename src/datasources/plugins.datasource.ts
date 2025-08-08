import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { buildBaseOptions } from './base-options';

const isTs = __filename.endsWith('.ts');
const entities = [isTs ? 'src/**/*.entity.ts' : 'dist/src/**/*.entity.js'];
const migrations = [isTs ? 'src/migrations/plugins/*.ts' : 'dist/src/migrations/plugins/*.js'];

export const PluginsDataSource = new DataSource({
    ...buildBaseOptions(),
    name: 'plugins',
    database: 'plugins',
    entities,
    migrations
});
