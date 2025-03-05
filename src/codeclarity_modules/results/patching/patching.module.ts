import { Module } from '@nestjs/common';
import { PatchingService } from './patching.service';
import { PatchingController } from './patching.controller';
import { AnalysisResultsService } from '../results.service';
import { Result } from 'src/entity/codeclarity/Result';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectMemberService } from 'src/base_modules/projects/projectMember.service';
import { AnalysesMemberService } from 'src/base_modules/analyses/analysesMembership.service';
import { Project } from 'src/entity/codeclarity/Project';
import { Analysis } from 'src/entity/codeclarity/Analysis';
import { Invitation } from 'src/entity/codeclarity/Invitation';
import { EmailService } from 'src/base_modules/email/email.service';
import { Email } from 'src/entity/codeclarity/Email';
import { UsersModule } from 'src/base_modules/users/users.module';
import { OrganizationsModule } from 'src/base_modules/organizations/organizations.module';

@Module({
    imports: [
        UsersModule,
        OrganizationsModule,
        TypeOrmModule.forFeature(
            [
                Result,
                Project,
                Analysis,
                Invitation,
                Email
            ],
            'codeclarity'
        )
    ],
    providers: [
        PatchingService,
        AnalysisResultsService,
        ProjectMemberService,
        AnalysesMemberService,
        EmailService
    ],
    controllers: [PatchingController]
})
export class PatchingModule {}
