import { forwardRef, Module } from '@nestjs/common';
import { PatchingService } from './patching.service';
import { PatchingController } from './patching.controller';
import { AnalysisResultsService } from '../results.service';
import { Result } from 'src/codeclarity_modules/results/result.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from 'src/base_modules/users/users.module';
import { OrganizationsModule } from 'src/base_modules/organizations/organizations.module';
import { AnalysesModule } from 'src/base_modules/analyses/analyses.module';
import { ProjectsModule } from 'src/base_modules/projects/projects.module';
import { EmailModule } from 'src/base_modules/email/email.module';
import { PatchingUtilsService } from './utils/utils';
import { SbomModule } from '../sbom/sbom.module';
import { VulnerabilitiesModule } from '../vulnerabilities/vulnerabilities.module';
import { AnalysisResultsRepository } from '../results.repository';

@Module({
    imports: [
        forwardRef(() => UsersModule),
        OrganizationsModule,
        forwardRef(() => AnalysesModule),
        forwardRef(() => ProjectsModule),
        forwardRef(() => VulnerabilitiesModule),
        EmailModule,
        SbomModule,
        TypeOrmModule.forFeature([Result], 'codeclarity')
    ],
    exports: [PatchingUtilsService],
    providers: [PatchingService, AnalysisResultsService, PatchingUtilsService, AnalysisResultsRepository],
    controllers: [PatchingController]
})
export class PatchingModule {}
