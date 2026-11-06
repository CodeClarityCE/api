import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { GithubModule } from "src/base_modules/integrations/github/github.module";

import { Experiment } from "../experiments/experiment.entity";

import { Dataset } from "./dataset.entity";
import { DatasetBuildService } from "./dataset-build.service";
import { DatasetEntry } from "./dataset-entry.entity";
import { DatasetsController } from "./datasets.controller";
import { DatasetsService } from "./datasets.service";

@Module({
  imports: [
    TypeOrmModule.forFeature(
      [Dataset, DatasetEntry, Experiment],
      "codeclarity",
    ),
    GithubModule,
  ],
  controllers: [DatasetsController],
  providers: [DatasetsService, DatasetBuildService],
})
export class DatasetsModule {}
