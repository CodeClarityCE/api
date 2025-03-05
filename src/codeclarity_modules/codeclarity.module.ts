import { Module } from '@nestjs/common';

import { ResultsModule } from './results/results.module';
import { PolicyModule } from './policies/policy.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { defaultOptions } from 'src/app.module';

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
                autoLoadEntities: true,
                database: 'knowledge'
            })
        }),
        TypeOrmModule.forRootAsync({
            imports: [ConfigModule],
            name: 'codeclarity',
            useFactory: () => ({
                ...defaultOptions,
                autoLoadEntities: true,
                database: 'codeclarity'
            })
        }),
    ],
    providers: [],
    controllers: []
})
export class CodeClarityModule { }
