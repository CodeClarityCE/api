import { forwardRef, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { OrganizationsModule } from "src/base_modules/organizations/organizations.module";
import { KnowledgeModule } from "src/codeclarity_modules/knowledge/knowledge.module";
import { Result } from "src/codeclarity_modules/results/result.entity";

import { AnalysisResultsRepository } from "../results.repository";
import { AnalysisResultsService } from "../results.service";
import { SbomModule } from "../sbom/sbom.module";

import { LicensesController } from "./licenses.controller";
import { LicensesRepository } from "./licenses.repository";
import { LicensesService } from "./licenses.service";
import { LicensesUtilsService } from "./utils/utils";

@Module({
  imports: [
    OrganizationsModule,
    KnowledgeModule,
    forwardRef(() => SbomModule),
    TypeOrmModule.forFeature([Result], "codeclarity"),
  ],
  providers: [
    LicensesService,
    AnalysisResultsService,
    AnalysisResultsRepository,
    LicensesRepository,
    LicensesUtilsService,
  ],
  exports: [LicensesRepository, LicensesUtilsService],
  controllers: [LicensesController],
})
export class LicenseModule {}
