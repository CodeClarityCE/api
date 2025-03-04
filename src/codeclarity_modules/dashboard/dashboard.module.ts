import { Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { OrganizationsMemberService } from '../../base_modules/organizations/organizationMember.service';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { OWASPRepository } from '../knowledge/OWASPRepository';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization } from 'src/entity/codeclarity/Organization';
import { OrganizationMemberships } from 'src/entity/codeclarity/OrganizationMemberships';

@Module({
    imports: [
        TypeOrmModule.forFeature([Organization, OrganizationMemberships], 'codeclarity'),
        KnowledgeModule
    ],
    providers: [DashboardService, OrganizationsMemberService, OWASPRepository],
    controllers: [DashboardController]
})
export class DashboardModule {}
