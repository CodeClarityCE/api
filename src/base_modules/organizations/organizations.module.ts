import { forwardRef, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { Invitation } from "src/base_modules/organizations/invitations/invitation.entity";
import { Log } from "src/base_modules/organizations/log/log.entity";
import { OrganizationMemberships } from "src/base_modules/organizations/memberships/organization.memberships.entity";
import { Organization } from "src/base_modules/organizations/organization.entity";

import { EmailModule } from "../email/email.module";
import { ProjectRowsModule } from "../projects/project-rows.module";
import { UsersModule } from "../users/users.module";

import { InvitationsRepository } from "./invitations/invitations.repository";
import { LogsRepository } from "./log/logs.repository";
import { OrganizationLoggerService } from "./log/organizationLogger.service";
import { OrganizationTeardown } from "./organization-teardown";
import { OrganizationsController } from "./organizations.controller";
import { OrganizationsRepository } from "./organizations.repository";
import { OrganizationsService } from "./organizations.service";

@Module({
  imports: [
    forwardRef(() => UsersModule),
    EmailModule,
    ProjectRowsModule,
    TypeOrmModule.forFeature(
      [OrganizationMemberships, Organization, Log, Invitation],
      "codeclarity",
    ),
  ],
  exports: [OrganizationsRepository, OrganizationLoggerService],
  providers: [
    OrganizationsService,
    OrganizationTeardown,
    OrganizationLoggerService,
    OrganizationsRepository,
    InvitationsRepository,
    LogsRepository,
  ],
  controllers: [OrganizationsController],
})
export class OrganizationsModule {}
