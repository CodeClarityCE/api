import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LicensesService } from './licenses.service';
import { LicensesController } from './licenses.controller';
import { Result } from 'src/codeclarity_modules/results/result.entity';
import { AnalysisResultsService } from '../results.service';
import { LicenseRepository } from 'src/codeclarity_modules/knowledge/license/license.repository';
import { License } from 'src/codeclarity_modules/knowledge/license/license.entity';
import { OrganizationsModule } from 'src/base_modules/organizations/organizations.module';
import { ProjectsModule } from 'src/base_modules/projects/projects.module';
import { AnalysesModule } from 'src/base_modules/analyses/analyses.module';
import { LicensesRepository } from './licenses.repository';

@Module({
    imports: [
        OrganizationsModule,
        forwardRef(() => ProjectsModule),
        forwardRef(() => AnalysesModule),
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
        LicensesRepository,
    ],
    exports: [LicensesRepository],
    controllers: [LicensesController]
})
export class LicenseModule {}
