import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
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
                TicketIntegrationConfig
            ],
            'codeclarity'
        )
    ],
    controllers: [TicketsController, ProjectTicketsController],
    providers: [TicketsService],
    exports: [TicketsService]
})
export class TicketsModule {}
