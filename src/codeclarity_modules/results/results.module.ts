import { forwardRef, Module } from '@nestjs/common';
import { VulnerabilitiesModule } from './vulnerabilities/vulnerabilities.module';
import { SbomModule } from './sbom/sbom.module';
import { PatchingModule } from './patching/patching.module';
import { LicenseModule } from './licenses/licenses.module';
import { OrganizationsModule } from 'src/base_modules/organizations/organizations.module';
import { AnalysesModule } from 'src/base_modules/analyses/analyses.module';
import { AnalysisResultsRepository } from './results.repository';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Result } from 'src/codeclarity_modules/results/result.entity';
import { ResultsController } from './results.controller';
import { AnalysisResultsService } from './results.service';
import { UsersModule } from 'src/base_modules/users/users.module';
import { ProjectsModule } from 'src/base_modules/projects/projects.module';

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
