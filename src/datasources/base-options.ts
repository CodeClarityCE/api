import * as dotenv from 'dotenv';
import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions.js';

// Load environment file similar to app.module logic
const ENV = process.env['ENV'] ?? 'dev';
try {
    dotenv.config({ path: `env/.env.${ENV}` });
} catch (_) {
    // ignore if not present
}

export function buildBaseOptions(): PostgresConnectionOptions {
    return {
        type: 'postgres',
        host: process.env['PG_DB_HOST'],
        port: parseInt(process.env['PG_DB_PORT'] ?? '6432', 10),
        username: process.env['PG_DB_USER'],
        password: process.env['PG_DB_PASSWORD'],
        logging: false
    } as PostgresConnectionOptions;
}
