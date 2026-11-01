import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { GithubModule } from "src/base_modules/integrations/github/github.module";

import { Dataset } from "./dataset.entity";
import { DatasetBuildService } from "./dataset-build.service";
import { DatasetEntry } from "./dataset-entry.entity";
import { DatasetsController } from "./datasets.controller";
import { DatasetsService } from "./datasets.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([Dataset, DatasetEntry], "codeclarity"),
    GithubModule,
  ],
  controllers: [DatasetsController],
  providers: [DatasetsService, DatasetBuildService],
})
export class DatasetsModule {}
