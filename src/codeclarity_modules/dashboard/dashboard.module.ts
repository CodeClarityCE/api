import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { Organization } from "src/base_modules/organizations/organization.entity";
import { OrganizationsModule } from "src/base_modules/organizations/organizations.module";

import { KnowledgeModule } from "../knowledge/knowledge.module";
import { VulnerabilitiesModule } from "../results/vulnerabilities/vulnerabilities.module";

import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";

@Module({
  imports: [
    OrganizationsModule,
    TypeOrmModule.forFeature([Organization], "codeclarity"),
    KnowledgeModule,
    VulnerabilitiesModule,
  ],
  providers: [DashboardService],
  controllers: [DashboardController],
})
export class DashboardModule {}
