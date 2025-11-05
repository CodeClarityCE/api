import 'reflect-metadata';
import { DataSource } from 'typeorm';

import { buildBaseOptions } from './base-options';

const isTs = __filename.endsWith('.ts');
const entities = [
    // Base modules (excluding plugins entity which belongs to 'plugins' DB)
    isTs
        ? 'src/base_modules/!(plugins)/**/*.entity.ts'
        : 'dist/src/base_modules/!(plugins)/**/*.entity.js',
    // CodeClarity modules: results, policies, dashboard (excluding knowledge)
    // Knowledge entities belong in 'knowledge' DB only
    isTs
        ? 'src/codeclarity_modules/!(knowledge)/**/*.entity.ts'
        : 'dist/src/codeclarity_modules/!(knowledge)/**/*.entity.js'
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
