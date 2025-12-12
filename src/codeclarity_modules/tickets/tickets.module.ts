import { forwardRef, Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Analysis } from 'src/base_modules/analyses/analysis.entity';
import { Organization } from 'src/base_modules/organizations/organization.entity';
import { Result } from 'src/codeclarity_modules/results/result.entity';
import { VulnerabilitiesModule } from 'src/codeclarity_modules/results/vulnerabilities/vulnerabilities.module';
import { TicketAutomationService } from './automation/ticket-automation.service';
import { ClickUpService } from './integrations/clickup/clickup.service';
import { TicketIntegrationService } from './integrations/ticket-integration.service';
import { TicketEvent } from './ticket-event.entity';
import { TicketExternalLink } from './ticket-external-link.entity';
import { TicketIntegrationConfig } from './ticket-integration-config.entity';
import { TicketVulnerabilityOccurrence } from './ticket-occurrence.entity';
import { Ticket } from './ticket.entity';
import { TicketsController, ProjectTicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';

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
                Result
            ],
            'codeclarity'
        ),
        forwardRef(() => VulnerabilitiesModule)
    ],
    controllers: [TicketsController, ProjectTicketsController],
    providers: [TicketsService, TicketAutomationService, TicketIntegrationService, ClickUpService],
    exports: [TicketsService, TicketAutomationService, TicketIntegrationService]
})
export class TicketsModule implements OnModuleInit {
    constructor(
        private readonly ticketIntegrationService: TicketIntegrationService,
        private readonly clickUpService: ClickUpService
    ) {}

    onModuleInit(): void {
        // Register integration providers
        this.ticketIntegrationService.registerProvider(this.clickUpService);
    }
}
