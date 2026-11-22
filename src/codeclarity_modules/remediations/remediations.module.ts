import { Module } from "@nestjs/common";

import { KnowledgeModule } from "src/codeclarity_modules/knowledge/knowledge.module";

import { FixNextController } from "./fix-next.controller";
import { FixNextService } from "./fix-next.service";
import {
  RemediationTicketLookup,
  TicketRemediationLookup,
} from "./remediation-tickets";
import { RemediationsService } from "./remediations.service";

@Module({
  imports: [KnowledgeModule],
  providers: [
    RemediationsService,
    FixNextService,
    { provide: RemediationTicketLookup, useClass: TicketRemediationLookup },
  ],
  controllers: [FixNextController],
  exports: [RemediationsService, RemediationTicketLookup],
})
export class RemediationsModule {}
