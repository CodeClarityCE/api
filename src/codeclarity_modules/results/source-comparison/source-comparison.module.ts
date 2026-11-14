import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { OrganizationsModule } from "src/base_modules/organizations/organizations.module";
import { KnowledgeModule } from "src/codeclarity_modules/knowledge/knowledge.module";
import { Result } from "src/codeclarity_modules/results/result.entity";

import { AnalysisResultsRepository } from "../results.repository";
import { AnalysisResultsService } from "../results.service";
import { VulnerabilitiesModule } from "../vulnerabilities/vulnerabilities.module";

import { SourceComparisonController } from "./source-comparison.controller";
import { SourceComparisonService } from "./source-comparison.service";

@Module({
  imports: [
    OrganizationsModule,
    KnowledgeModule,
    VulnerabilitiesModule,
    TypeOrmModule.forFeature([Result], "codeclarity"),
  ],
  providers: [
    SourceComparisonService,
    AnalysisResultsService,
    AnalysisResultsRepository,
  ],
  controllers: [SourceComparisonController],
})
export class SourceComparisonModule {}
