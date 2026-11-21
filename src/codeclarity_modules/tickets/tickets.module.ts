import { forwardRef, Module, OnModuleInit } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { Analysis } from "src/base_modules/analyses/analysis.entity";
import { Organization } from "src/base_modules/organizations/organization.entity";
import { KnowledgeModule } from "src/codeclarity_modules/knowledge/knowledge.module";
import { RemediationsModule } from "src/codeclarity_modules/remediations/remediations.module";
import { Result } from "src/codeclarity_modules/results/result.entity";
import { VulnerabilitiesModule } from "src/codeclarity_modules/results/vulnerabilities/vulnerabilities.module";
import { VulnerabilityInstancesModule } from "src/codeclarity_modules/vulnerability_instances/vulnerability-instances.module";

import { TicketAutomationService } from "./automation/ticket-automation.service";
import { ClickUpService } from "./integrations/clickup/clickup.service";
import { TicketIntegrationService } from "./integrations/ticket-integration.service";
import { MyWorkController } from "./my-work.controller";
import { MyWorkService } from "./my-work.service";
import { RemediationTicketsService } from "./remediation-tickets.service";
import { Ticket } from "./ticket.entity";
import { TicketContentService } from "./ticket-content.service";
import { TicketEvent } from "./ticket-event.entity";
import { TicketExternalLink } from "./ticket-external-link.entity";
import { TicketIntegrationConfig } from "./ticket-integration-config.entity";
import { TicketVulnerabilityOccurrence } from "./ticket-occurrence.entity";
import {
  ProjectTicketsController,
  TicketsController,
} from "./tickets.controller";
import { TicketsService } from "./tickets.service";

@Module({
  imports: [
    TypeOrmModule.forFeature(
      [
        Ticket,
        TicketEvent,
        TicketExternalLink,
        TicketVulnerabilityOccurrence,
        TicketIntegrationConfig,
        Analysis,
        Organization,
        Result,
      ],
      "codeclarity",
    ),
    forwardRef(() => VulnerabilitiesModule),
    KnowledgeModule,
    RemediationsModule,
    VulnerabilityInstancesModule,
  ],
  controllers: [MyWorkController, TicketsController, ProjectTicketsController],
  providers: [
    TicketsService,
    RemediationTicketsService,
    TicketContentService,
    MyWorkService,
    TicketAutomationService,
    TicketIntegrationService,
    ClickUpService,
  ],
  exports: [
    TicketsService,
    RemediationTicketsService,
    TicketAutomationService,
    TicketIntegrationService,
  ],
})
export class TicketsModule implements OnModuleInit {
  constructor(
    private readonly ticketIntegrationService: TicketIntegrationService,
    private readonly clickUpService: ClickUpService,
  ) {}

  onModuleInit(): void {
    // Register integration providers
    this.ticketIntegrationService.registerProvider(this.clickUpService);
  }
}
