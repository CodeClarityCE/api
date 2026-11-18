import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { Analyzer } from "src/base_modules/analyzers/analyzer.entity";
import { Experiment } from "src/codeclarity_modules/experiments/experiment.entity";

import { OrganizationsModule } from "../organizations/organizations.module";
import { PluginAvailabilityModule } from "../plugin-availability/plugin-availability.module";
import { PluginModule } from "../plugins/plugin.module";

import { AnalyzerLanguagesService } from "./analyzer-languages.service";
import { AnalyzerTemplatesService } from "./analyzer-templates.service";
import {
  AnalyzersController,
  AnalyzerTemplatesController,
  LanguagesController,
} from "./analyzers.controller";
import { AnalyzersRepository } from "./analyzers.repository";
import { AnalyzersService } from "./analyzers.service";

@Module({
  imports: [
    OrganizationsModule, // For OrganizationLoggerService
    PluginModule, // For the dependency rules of a workflow
    PluginAvailabilityModule, // For whether an analyzer can run here
    TypeOrmModule.forFeature([Analyzer, Experiment], "codeclarity"),
  ],
  exports: [
    AnalyzersService,
    AnalyzersRepository,
    AnalyzerTemplatesService,
    AnalyzerLanguagesService,
  ],
  providers: [
    AnalyzersService,
    AnalyzersRepository,
    AnalyzerTemplatesService,
    AnalyzerLanguagesService,
  ],
  controllers: [
    AnalyzersController,
    AnalyzerTemplatesController,
    LanguagesController,
  ],
})
export class AnalyzersModule {}
