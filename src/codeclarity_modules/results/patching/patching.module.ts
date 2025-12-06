import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailModule } from 'src/base_modules/email/email.module';
import { OrganizationsModule } from 'src/base_modules/organizations/organizations.module';
import { UsersModule } from 'src/base_modules/users/users.module';
import { Result } from 'src/codeclarity_modules/results/result.entity';
import { AnalysisResultsRepository } from '../results.repository';
import { AnalysisResultsService } from '../results.service';
import { SbomModule } from '../sbom/sbom.module';
import { VulnerabilitiesModule } from '../vulnerabilities/vulnerabilities.module';
import { PatchingController } from './patching.controller';
import { PatchingService } from './patching.service';
import { PatchingUtilsService } from './utils/utils';

@Module({
    imports: [
        forwardRef(() => UsersModule),
        OrganizationsModule,
        forwardRef(() => VulnerabilitiesModule),
        EmailModule,
        forwardRef(() => SbomModule),
        TypeOrmModule.forFeature([Result], 'codeclarity')
    ],
    exports: [PatchingUtilsService],
    providers: [
        PatchingService,
        AnalysisResultsService,
        PatchingUtilsService,
        AnalysisResultsRepository
    ],
    controllers: [PatchingController]
})
export class PatchingModule {}
