import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";
import {
  Column,
  Entity,
  FindOptionsOrder,
  ManyToOne,
  PrimaryGeneratedColumn,
  Relation,
} from "typeorm";

import type { Analysis } from "../../base_modules/analyses/analysis.entity";

@Entity()
export class Result {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ApiProperty()
  @Expose()
  @Column("jsonb")
  result!: ResultObject;

  // Foreign keys
  @ManyToOne("Analysis", "results")
  analysis!: Relation<Analysis>;

  @ApiProperty()
  @Expose()
  @Column()
  plugin!: string;

  @ApiProperty()
  @Expose()
  @Column({ type: "timestamp", default: () => "CURRENT_TIMESTAMP" })
  created_on!: Date;
}

// Newest row first, with the ID settling rows stored at the same moment.
export const NEWEST_RESULT_FIRST: FindOptionsOrder<Result> = {
  created_on: "DESC",
  id: "DESC",
};

export interface ResultByAnalysisId {
  id: string;
  image: string;
}

export interface ResultObject {
  workspaces: object;
  analysis_info: unknown;
}

export interface AnalysisInfo {
  extra: unknown;
  errors: unknown[];
  status: string;
  time: unknown;
}
