import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AnalysesModule } from "src/base_modules/analyses/analyses.module";
import { AnalyzersModule } from "src/base_modules/analyzers/analyzers.module";
import { GithubModule } from "src/base_modules/integrations/github/github.module";
import { ProjectsModule } from "src/base_modules/projects/projects.module";
import { KnowledgeModule } from "src/codeclarity_modules/knowledge/knowledge.module";

import { Dataset } from "../datasets/dataset.entity";
import { DatasetEntry } from "../datasets/dataset-entry.entity";
import { Result } from "../results/result.entity";

import { Experiment } from "./experiment.entity";
import { ExperimentFigure } from "./experiment-figure.entity";
import { ExperimentFiguresService } from "./experiment-figures.service";
import { ExperimentProbe } from "./experiment-probe.entity";
import { ExperimentProbeInterval } from "./experiment-probe-interval.entity";
import { ExperimentProbeOutcome } from "./experiment-probe-outcome.entity";
import { ExperimentPublishedResults } from "./experiment-published-results.entity";
import { ExperimentResultsService } from "./experiment-results.service";
import { ExperimentRun } from "./experiment-run.entity";
import { ExperimentRunSubmission } from "./experiment-run-submission";
import { ExperimentRunSummaryRow } from "./experiment-run-summary-row.entity";
import { ExperimentRunnerService } from "./experiment-runner.service";
import { ExperimentStore, TypeOrmExperimentStore } from "./experiment-store";
import { ExperimentVulnerabilityInstance } from "./experiment-vulnerability-instance.entity";
import { ExperimentsController } from "./experiments.controller";
import { ExperimentsService } from "./experiments.service";

@Module({
  imports: [
    TypeOrmModule.forFeature(
      [
        Experiment,
        ExperimentRun,
        ExperimentRunSummaryRow,
        ExperimentVulnerabilityInstance,
        ExperimentProbeOutcome,
        ExperimentProbe,
        ExperimentProbeInterval,
        ExperimentFigure,
        ExperimentPublishedResults,
        Dataset,
        DatasetEntry,
        Result,
      ],
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
    ExperimentResultsService,
    ExperimentFiguresService,
    ExperimentRunnerService,
    ExperimentRunSubmission,
    { provide: ExperimentStore, useClass: TypeOrmExperimentStore },
  ],
})
export class ExperimentsModule {}
