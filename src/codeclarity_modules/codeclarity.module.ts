import { Module } from '@nestjs/common';

import { ResultsModule } from './results/results.module';
import { PolicyModule } from './policies/policy.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { defaultOptions } from 'src/app.module';
import { CWE } from 'src/codeclarity_modules/knowledge/cwe/cwe.entity';
import { NVD } from 'src/codeclarity_modules/knowledge/nvd/nvd.entity';
import { OSV } from 'src/codeclarity_modules/knowledge/osv/osv.entity';
import { Package, Version } from 'src/codeclarity_modules/knowledge/package/package.entity';
import { License } from 'src/codeclarity_modules/knowledge/license/license.entity';

@Module({
    imports: [
        ResultsModule,
        PolicyModule,
        KnowledgeModule,
        DashboardModule,
        TypeOrmModule.forRootAsync({
            imports: [ConfigModule],
            name: 'knowledge',
            useFactory: () => ({
                ...defaultOptions,
                database: 'knowledge',
                entities: [CWE, NVD, OSV, Package, Version, License]
            })
        }),
    ],
    providers: [],
    controllers: []
})
export class CodeClarityModule {}
