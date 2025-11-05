import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalysesModule } from 'src/base_modules/analyses/analyses.module';
import { OrganizationsModule } from 'src/base_modules/organizations/organizations.module';
import { ProjectsModule } from 'src/base_modules/projects/projects.module';
import { UsersModule } from 'src/base_modules/users/users.module';
import { Result } from 'src/codeclarity_modules/results/result.entity';


import { LicenseModule } from './licenses/licenses.module';
import { PatchingModule } from './patching/patching.module';
import { ResultsController } from './results.controller';
import { AnalysisResultsRepository } from './results.repository';
import { AnalysisResultsService } from './results.service';
import { SbomModule } from './sbom/sbom.module';
import { VulnerabilitiesModule } from './vulnerabilities/vulnerabilities.module';


@Module({
    imports: [
        forwardRef(() => UsersModule),
        OrganizationsModule,
        forwardRef(() => AnalysesModule),
        forwardRef(() => ProjectsModule),
        VulnerabilitiesModule,
        SbomModule,
        PatchingModule,
        LicenseModule,
        TypeOrmModule.forFeature([Result], 'codeclarity')
    ],
    exports: [AnalysisResultsRepository],
    providers: [AnalysisResultsService, AnalysisResultsRepository],
    controllers: [ResultsController]
})
export class ResultsModule {}
