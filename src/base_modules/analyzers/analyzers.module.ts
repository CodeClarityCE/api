import { Analyzer } from 'src/base_modules/analyzers/analyzer.entity';

import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { OrganizationsModule } from '../organizations/organizations.module';
import { UsersModule } from '../users/users.module';

import { AnalyzerTemplatesService } from './analyzer-templates.service';
import {
    AnalyzersController,
    AnalyzerTemplatesController,
    LanguagesController
} from './analyzers.controller';
import { AnalyzersRepository } from './analyzers.repository';
import { AnalyzersService } from './analyzers.service';

@Module({
    imports: [
        forwardRef(() => UsersModule),
        OrganizationsModule,
        TypeOrmModule.forFeature([Analyzer], 'codeclarity')
    ],
    exports: [AnalyzersService, AnalyzersRepository, AnalyzerTemplatesService],
    providers: [AnalyzersService, AnalyzersRepository, AnalyzerTemplatesService],
    controllers: [AnalyzersController, AnalyzerTemplatesController, LanguagesController]
})
export class AnalyzersModule {}
