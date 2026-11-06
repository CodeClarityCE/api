import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AnalyzersModule } from "src/base_modules/analyzers/analyzers.module";

import { Dataset } from "../datasets/dataset.entity";
import { DatasetEntry } from "../datasets/dataset-entry.entity";

import { Experiment } from "./experiment.entity";
import { ExperimentRun } from "./experiment-run.entity";
import { ExperimentsController } from "./experiments.controller";
import { ExperimentsService } from "./experiments.service";

@Module({
  imports: [
    TypeOrmModule.forFeature(
      [Experiment, ExperimentRun, Dataset, DatasetEntry],
      "codeclarity",
    ),
    AnalyzersModule,
  ],
  controllers: [ExperimentsController],
  providers: [ExperimentsService],
})
export class ExperimentsModule {}
