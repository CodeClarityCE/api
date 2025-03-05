import { forwardRef, Module } from '@nestjs/common';
import { AnalysesService } from './analyses.service';
import { AnalysesController } from './analyses.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Analysis } from 'src/base_modules/analyses/analysis.entity';
import { UsersModule } from '../users/users.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ProjectsModule } from '../projects/projects.module';
import { AnalyzersModule } from '../analyzers/analyzers.module';
import { ResultsModule } from 'src/codeclarity_modules/results/results.module';
import { SbomModule } from 'src/codeclarity_modules/results/sbom/sbom.module';
import { LicenseModule } from 'src/codeclarity_modules/results/licenses/licenses.module';
import { VulnerabilitiesModule } from 'src/codeclarity_modules/results/vulnerabilities/vulnerabilities.module';
import { AnalysesRepository } from './analyses.repository';

@Module({
    imports: [
        UsersModule,
        OrganizationsModule,
        ProjectsModule,
        AnalyzersModule,
        forwardRef(() => ResultsModule),
        forwardRef(() => SbomModule),
        forwardRef(() => LicenseModule),
        forwardRef(() => VulnerabilitiesModule),
        TypeOrmModule.forFeature(
            [Analysis],
            'codeclarity'
        )
    ],
    exports: [
        AnalysesService,
        AnalysesRepository
    ],
    providers: [
        AnalysesService,
        AnalysesRepository
    ],
    controllers: [AnalysesController]
})
export class AnalysesModule { }
