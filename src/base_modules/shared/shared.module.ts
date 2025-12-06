import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import { User } from 'src/base_modules/users/users.entity';
import { Organization } from 'src/base_modules/organizations/organization.entity';
import { OrganizationMemberships } from 'src/base_modules/organizations/memberships/organization.memberships.entity';
import { Invitation } from 'src/base_modules/organizations/invitations/invitation.entity';
import { Log } from 'src/base_modules/organizations/log/log.entity';
import { Project } from 'src/base_modules/projects/project.entity';
import { Analysis } from 'src/base_modules/analyses/analysis.entity';
import { Integration } from 'src/base_modules/integrations/integrations.entity';

// Shared Repositories
import {
    UsersRepository,
    OrganizationsRepository,
    MembershipsRepository,
    InvitationsRepository,
    ProjectsRepository,
    AnalysesRepository,
    IntegrationsRepository,
    LogsRepository
} from './repositories';

/**
 * Global module providing shared repositories for database operations.
 *
 * This module breaks circular dependencies by:
 * 1. Centralizing all entity registrations with TypeORM
 * 2. Providing pure repositories that only depend on TypeORM (no cross-repo deps)
 * 3. Being globally available without explicit imports
 *
 * Business logic that spans multiple repositories should remain in service classes.
 */
@Global()
@Module({
    imports: [
        TypeOrmModule.forFeature(
            [
                User,
                Organization,
                OrganizationMemberships,
                Invitation,
                Log,
                Project,
                Analysis,
                Integration
            ],
            'codeclarity'
        )
    ],
    providers: [
        UsersRepository,
        OrganizationsRepository,
        MembershipsRepository,
        InvitationsRepository,
        ProjectsRepository,
        AnalysesRepository,
        IntegrationsRepository,
        LogsRepository
    ],
    exports: [
        UsersRepository,
        OrganizationsRepository,
        MembershipsRepository,
        InvitationsRepository,
        ProjectsRepository,
        AnalysesRepository,
        IntegrationsRepository,
        LogsRepository,
        TypeOrmModule
    ]
})
export class SharedRepositoriesModule {}
