import { Module } from '@nestjs/common';

import { ResultsModule } from './results/results.module';
import { PolicyModule } from './policies/policy.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { defaultOptions } from 'src/app.module';
import { CWE } from 'src/entity/knowledge/CWE';
import { NVD } from 'src/entity/knowledge/NVD';
import { OSV } from 'src/entity/knowledge/OSV';
import { Package, Version } from 'src/entity/knowledge/Package';
import { License } from 'src/entity/knowledge/License';

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
