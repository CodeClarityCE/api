import { Module } from "@nestjs/common";

import { KnowledgeModule } from "src/codeclarity_modules/knowledge/knowledge.module";
import { PatchingModule } from "src/codeclarity_modules/results/patching/patching.module";

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
  ],
  exports: [RemediationsService],
})
export class RemediationsModule {}
