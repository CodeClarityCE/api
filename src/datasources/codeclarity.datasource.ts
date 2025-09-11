import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { buildBaseOptions } from './base-options';

const isTs = __filename.endsWith('.ts');
const entities = [
    // Base modules entities (not knowledge entities)
    isTs ? 'src/base_modules/**/*.entity.ts' : 'dist/src/base_modules/**/*.entity.js',
    // CodeClarity modules entities (excluding knowledge)
    isTs ? 'src/codeclarity_modules/results/*.entity.ts' : 'dist/src/codeclarity_modules/results/*.entity.js',
    isTs ? 'src/codeclarity_modules/policies/*.entity.ts' : 'dist/src/codeclarity_modules/policies/*.entity.js'
];
const migrations = [
    isTs ? 'src/migrations/codeclarity/*.ts' : 'dist/src/migrations/codeclarity/*.js'
];

export const CodeClarityDataSource = new DataSource({
    ...buildBaseOptions(),
    name: 'codeclarity',
    database: 'codeclarity',
    entities,
    migrations
});
