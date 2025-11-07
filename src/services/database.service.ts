import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Service responsible for managing database operations including
 * creating and maintaining custom indexes that persist across schema sync
 */
@Injectable()
export class DatabaseService implements OnApplicationBootstrap {
    private readonly logger = new Logger(DatabaseService.name);

    constructor(
        @InjectDataSource('knowledge')
        private readonly knowledgeDataSource: DataSource
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        this.logger.log('Initializing database indexes...');
        await this.createKnowledgeIndexes();
        this.logger.log('Database indexes initialized successfully');
    }

    /**
     * Creates GIN indexes for efficient JSON lookups in knowledge database tables
     */
    private async createKnowledgeIndexes(): Promise<void> {
        const indexes = [
            {
                name: 'nvd_affectedflattened_gin_pathops_idx',
                table: 'nvd',
                column: '"affectedFlattened"',
                type: 'GIN',
                options: 'jsonb_path_ops'
            },
            {
                name: 'osv_affected_gin_pathops_idx',
                table: 'osv',
                column: '"affected"',
                type: 'GIN',
                options: 'jsonb_path_ops'
            }
        ];

        for (const index of indexes) {
            await this.createIndexIfNotExists(index);
        }
    }

    /**
     * Creates an index if it doesn't already exist
     */
    private async createIndexIfNotExists(indexConfig: {
        name: string;
        table: string;
        column: string;
        type: string;
        options?: string;
    }): Promise<void> {
        const { name, table, column, type, options } = indexConfig;

        try {
            // Check if index already exists
            const indexExists = await this.knowledgeDataSource.query<{ "?column?": number }[]>(
                `
                SELECT 1 FROM pg_indexes
                WHERE indexname = $1 AND tablename = $2
            `,
                [name, table]
            );

            if (indexExists.length > 0) {
                this.logger.debug(`Index ${name} already exists`);
                return;
            }

            // Create the index
            const optionsPart = options ? ` ${options}` : '';
            const createIndexQuery = `
                CREATE INDEX ${name} ON ${table} USING ${type} (${column}${optionsPart})
            `;

            await this.knowledgeDataSource.query(createIndexQuery);
            this.logger.log(`Created index: ${name}`);
        } catch (error) {
            // If index creation fails due to it already existing, that's fine
            const pgError = error as { code?: string };
            if (pgError.code === '42P07') {
                this.logger.debug(`Index ${name} already exists (caught during creation)`);
            } else {
                this.logger.error(`Failed to create index ${name}:`, (error as Error).message);
                throw error;
            }
        }
    }

    /**
     * Manually trigger index creation (useful for testing or maintenance)
     */
    async recreateKnowledgeIndexes(): Promise<void> {
        this.logger.log('Recreating knowledge database indexes...');
        await this.createKnowledgeIndexes();
        this.logger.log('Knowledge database indexes recreated successfully');
    }
}
