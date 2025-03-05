import { forwardRef, Module } from '@nestjs/common';
import { AnalysesService } from './analyses.service';
import { AnalysesMemberService } from './analysesMembership.service';
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
        AnalysesMemberService
    ],
    providers: [
        AnalysesService,
        AnalysesMemberService
    ],
    controllers: [AnalysesController]
})
export class AnalysesModule {}
