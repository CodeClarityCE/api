import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LicensesService } from './licenses.service';
import { LicensesController } from './licenses.controller';
import { Result } from 'src/entity/codeclarity/Result';
import { AnalysisResultsService } from '../results.service';
import { LicenseRepository } from 'src/codeclarity_modules/knowledge/license/license.repository';
import { Package } from 'src/entity/knowledge/Package';
import { License } from 'src/entity/knowledge/License';
import { OrganizationsModule } from 'src/base_modules/organizations/organizations.module';
import { ProjectsModule } from 'src/base_modules/projects/projects.module';
import { AnalysesModule } from 'src/base_modules/analyses/analyses.module';

@Module({
    imports: [
        OrganizationsModule,
        ProjectsModule,
        AnalysesModule,
        TypeOrmModule.forFeature(
            [Result],
            'codeclarity'
        ),
        TypeOrmModule.forFeature([License], 'knowledge')
    ],
    providers: [
        LicensesService,
        AnalysisResultsService,
        LicenseRepository,
    ],
    controllers: [LicensesController]
})
export class LicenseModule {}
