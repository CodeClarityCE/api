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

@Module({
    imports: [
        forwardRef(() => UsersModule),
        OrganizationsModule,
        forwardRef(() => AnalysesModule),
        forwardRef(() => ProjectsModule),
        EmailModule,
        TypeOrmModule.forFeature(
            [
                Result
            ],
            'codeclarity'
        )
    ],
    providers: [
        PatchingService,
        AnalysisResultsService,
    ],
    controllers: [PatchingController]
})
export class PatchingModule {}
