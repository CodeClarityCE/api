import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { Analysis } from "src/base_modules/analyses/analysis.entity";

import { AnalysesRepository } from "../analyses/analyses.repository";
import { FileModule } from "../file/file.module";

import { ProjectRowsService } from "./project-rows.service";

/** Project row deletion, kept apart so organizations can use it without a module cycle. */
@Module({
  imports: [FileModule, TypeOrmModule.forFeature([Analysis], "codeclarity")],
  providers: [ProjectRowsService, AnalysesRepository],
  exports: [ProjectRowsService],
})
export class ProjectRowsModule {}
