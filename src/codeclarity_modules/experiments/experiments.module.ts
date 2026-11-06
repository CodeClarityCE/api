import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AnalysesModule } from "src/base_modules/analyses/analyses.module";
import { AnalyzersModule } from "src/base_modules/analyzers/analyzers.module";
import { GithubModule } from "src/base_modules/integrations/github/github.module";
import { ProjectsModule } from "src/base_modules/projects/projects.module";
import { KnowledgeModule } from "src/codeclarity_modules/knowledge/knowledge.module";

import { Dataset } from "../datasets/dataset.entity";
import { DatasetEntry } from "../datasets/dataset-entry.entity";

import { Experiment } from "./experiment.entity";
import { ExperimentRun } from "./experiment-run.entity";
import { ExperimentRunnerService } from "./experiment-runner.service";
import { ExperimentStore, TypeOrmExperimentStore } from "./experiment-store";
import { ExperimentsController } from "./experiments.controller";
import { ExperimentsService } from "./experiments.service";

@Module({
  imports: [
    TypeOrmModule.forFeature(
      [Experiment, ExperimentRun, Dataset, DatasetEntry],
      "codeclarity",
    ),
    AnalyzersModule,
    AnalysesModule,
    ProjectsModule,
    GithubModule,
    KnowledgeModule,
  ],
  controllers: [ExperimentsController],
  providers: [
    ExperimentsService,
    ExperimentRunnerService,
    { provide: ExperimentStore, useClass: TypeOrmExperimentStore },
  ],
})
export class ExperimentsModule {}
