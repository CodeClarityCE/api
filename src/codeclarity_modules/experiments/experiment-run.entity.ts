import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";
import {
  Column,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Relation,
  Unique,
} from "typeorm";

import type { Analysis } from "../../base_modules/analyses/analysis.entity";
import type { DatasetEntry } from "../datasets/dataset-entry.entity";

import type { Experiment } from "./experiment.entity";

export enum ExperimentRunStatus {
  PENDING = "pending",
  DONE = "done",
  FAILED = "failed",
  SKIPPED = "skipped",
}

/**
 * The outcome of an experiment for one snapshot (dataset entry, grid date).
 * Retries replace the analysis link and bump attempts; they never add rows.
 */
@Entity()
@Unique(["experiment", "dataset_entry", "grid_index"])
export class ExperimentRun {
  @ApiProperty()
  @Expose()
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ApiProperty({ enum: ExperimentRunStatus })
  @Expose()
  @Column({
    type: "enum",
    enum: ExperimentRunStatus,
    default: ExperimentRunStatus.PENDING,
  })
  status!: ExperimentRunStatus;

  /** Position in the experiment's grid; HEAD is the last (0 when HEAD-only) */
  @ApiProperty({ description: "Position in the grid, HEAD last" })
  @Expose()
  @Column("integer", { default: 0 })
  grid_index!: number;

  /** The calendar date (UTC midnight) the snapshot is pinned at; null for HEAD */
  @ApiProperty({ description: "Grid date, null for HEAD" })
  @Expose()
  @Column("timestamptz", { nullable: true })
  grid_date?: Date | null;

  @ApiProperty({
    description:
      "Why the run failed or was skipped, or why a done run is empty",
  })
  @Expose()
  @Column("varchar", { length: 1000, nullable: true })
  error?: string | null;

  @ApiProperty({ description: "Analyses submitted for this run so far" })
  @Expose()
  @Column("integer", { default: 0 })
  attempts!: number;

  @ApiProperty({ description: "Default branch pinned at submit time" })
  @Expose()
  @Column("varchar", { length: 255, nullable: true })
  branch?: string | null;

  @ApiProperty({ description: "Tip SHA of the branch pinned at submit time" })
  @Expose()
  @Column("varchar", { length: 64, nullable: true })
  commit_hash?: string | null;

  @ApiProperty()
  @Expose()
  @Column("timestamptz", { nullable: true })
  committed_at?: Date | null;

  /** When the current analysis was submitted (for the run ceiling) */
  @ApiProperty()
  @Expose()
  @Column("timestamptz", { nullable: true })
  submitted_on?: Date | null;

  /** When the first analysis was submitted: retries never reset the ceiling */
  @ApiProperty()
  @Expose()
  @Column("timestamptz", { nullable: true })
  first_submitted_on?: Date | null;

  @ApiProperty()
  @Expose()
  @Column("timestamptz", { nullable: true })
  ended_on?: Date | null;

  @ManyToOne("Experiment", "runs", { onDelete: "CASCADE" })
  experiment!: Relation<Experiment>;

  @ManyToOne("DatasetEntry", { nullable: false, onDelete: "CASCADE" })
  dataset_entry!: Relation<DatasetEntry>;

  /** The run whose analysis and copied rows this one shares (same commit) */
  @ManyToOne("ExperimentRun", { nullable: true, onDelete: "SET NULL" })
  shared_from?: Relation<ExperimentRun> | null;

  /** The current analysis; deleting it never deletes the run */
  @ManyToOne("Analysis", { nullable: true, onDelete: "SET NULL" })
  analysis?: Relation<Analysis> | null;
}
