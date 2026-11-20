import { Module } from "@nestjs/common";

import { KnowledgeModule } from "src/codeclarity_modules/knowledge/knowledge.module";
import { PatchingModule } from "src/codeclarity_modules/results/patching/patching.module";

import { FixNextController } from "./fix-next.controller";
import { FixNextService } from "./fix-next.service";
import {
  RemediationTicketLookup,
  VulnerabilityTicketLookup,
} from "./remediation-tickets";
import { RemediationsService } from "./remediations.service";
import {
  JsPatchingUpgradeSource,
  TopLevelUpgradeSource,
} from "./top-level-upgrades";

@Module({
  imports: [KnowledgeModule, PatchingModule],
  providers: [
    RemediationsService,
    // A language-agnostic patcher replaces this source.
    { provide: TopLevelUpgradeSource, useClass: JsPatchingUpgradeSource },
    FixNextService,
    // Tickets that reference remediations replace this lookup.
    { provide: RemediationTicketLookup, useClass: VulnerabilityTicketLookup },
  ],
  controllers: [FixNextController],
  exports: [RemediationsService, RemediationTicketLookup],
})
export class RemediationsModule {}
