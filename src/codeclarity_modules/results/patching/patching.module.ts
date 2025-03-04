import { Module } from '@nestjs/common';
import { PatchingService } from './patching.service';
import { PatchingController } from './patching.controller';
import { AnalysisResultsService } from '../results.service';
import { Result } from 'src/entity/codeclarity/Result';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationsService } from 'src/base_modules/organizations/organizations.service';
import { OrganizationsMemberService } from 'src/base_modules/organizations/organizationMember.service';
import { ProjectMemberService } from 'src/base_modules/projects/projectMember.service';
import { AnalysesMemberService } from 'src/base_modules/analyses/analysesMembership.service';
import { Organization } from 'src/entity/codeclarity/Organization';
import { User } from 'src/entity/codeclarity/User';
import { OrganizationMemberships } from 'src/entity/codeclarity/OrganizationMemberships';
import { Project } from 'src/entity/codeclarity/Project';
import { Analysis } from 'src/entity/codeclarity/Analysis';
import { Invitation } from 'src/entity/codeclarity/Invitation';
import { EmailService } from 'src/base_modules/email/email.service';
import { Email } from 'src/entity/codeclarity/Email';

@Module({
    imports: [
        TypeOrmModule.forFeature(
            [
                Result,
                Organization,
                User,
                OrganizationMemberships,
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
        OrganizationsService,
        OrganizationsMemberService,
        ProjectMemberService,
        AnalysesMemberService,
        EmailService
    ],
    controllers: [PatchingController]
})
export class PatchingModule {}
