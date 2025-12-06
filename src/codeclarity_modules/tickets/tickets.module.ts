import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Analysis } from 'src/base_modules/analyses/analysis.entity';
import { Organization } from 'src/base_modules/organizations/organization.entity';
import { Result } from 'src/codeclarity_modules/results/result.entity';
import { TicketAutomationService } from './automation/ticket-automation.service';
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
        )
    ],
    controllers: [TicketsController, ProjectTicketsController],
    providers: [TicketsService, TicketAutomationService],
    exports: [TicketsService, TicketAutomationService]
})
export class TicketsModule {}
