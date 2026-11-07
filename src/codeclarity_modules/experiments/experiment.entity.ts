import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";
import {
  Column,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Relation,
  Unique,
} from "typeorm";

import type { StageBase } from "../../base_modules/analyses/analysis.entity";
import type { Analyzer } from "../../base_modules/analyzers/analyzer.entity";
import type { Organization } from "../../base_modules/organizations/organization.entity";
import type { User } from "../../base_modules/users/users.entity";
import type { Dataset } from "../datasets/dataset.entity";

import { GridInterval } from "./experiment-grid";
import type { ExperimentRun } from "./experiment-run.entity";

export enum ExperimentStatus {
  PENDING = "PENDING",
  RUNNING = "RUNNING",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
  FAILED = "FAILED",
}

/** The analyzer step actually executed, snapshotted when the experiment starts. */
export type AnalyzerStepSnapshot = Pick<StageBase, "name" | "version">;

/**
 * A named, one-shot run of one analyzer over every snapshot of every entry of
 * one READY dataset. Its configuration, snapshot grid included, is frozen at
 * creation; running again later means creating a new experiment.
 */
@Entity()
@Unique(["organization", "name"])
export class Experiment {
  @ApiProperty()
  @Expose()
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ApiProperty()
  @Expose()
  @Column({ length: 100 })
  name!: string;

  @ApiProperty({ enum: ExperimentStatus })
  @Expose()
  @Column({
    type: "enum",
    enum: ExperimentStatus,
    default: ExperimentStatus.PENDING,
  })
  status!: ExperimentStatus;

  @ApiProperty({ description: "Retries of a failed run on the same SHA" })
  @Expose()
  @Column("integer", { default: 2 })
  retries!: number;

  /** Step between grid dates; never updated once created */
  @ApiProperty({ enum: GridInterval })
  @Expose()
  @Column({
    type: "enum",
    enum: GridInterval,
    default: GridInterval.MONTH,
    update: false,
  })
  grid_interval!: GridInterval;

  /** Grid dates before HEAD; 0 is HEAD only (older experiments) */
  @ApiProperty({ description: "Grid dates before HEAD (0: HEAD only)" })
  @Expose()
  @Column({ type: "integer", default: 0, update: false })
  grid_count!: number;

  @ApiProperty({ description: "Why the experiment FAILED, if it did" })
  @Expose()
  @Column("varchar", { length: 1000, nullable: true })
  error?: string | null;

  @ApiProperty({ description: "Analyzer steps (name, version) at start" })
  @Expose()
  @Column("jsonb", { nullable: true })
  analyzer_steps?: AnalyzerStepSnapshot[][] | null;

  /** Knowledge provenance and API version, recorded at start and end */
  @ApiProperty()
  @Expose()
  @Column("jsonb", { nullable: true })
  provenance?: Record<string, unknown> | null;

  /** API instance currently driving the experiment */
  @Column("varchar", { length: 200, nullable: true })
  lease_owner?: string | null;

  /** No other instance picks the experiment up before this time */
  @Column("timestamptz", { nullable: true })
  lease_until?: Date | null;

  @ApiProperty()
  @Expose()
  @Column("timestamptz")
  created_on!: Date;

  @ApiProperty()
  @Expose()
  @Column("timestamptz", { nullable: true })
  started_on?: Date | null;

  @ApiProperty()
  @Expose()
  @Column("timestamptz", { nullable: true })
  ended_on?: Date | null;

  @ManyToOne("Organization", { onDelete: "CASCADE" })
  organization!: Relation<Organization>;

  @ManyToOne("User", { nullable: true, onDelete: "SET NULL" })
  created_by?: Relation<User> | null;

  /** A dataset that has experiments cannot be deleted */
  @ManyToOne("Dataset", { nullable: false, onDelete: "RESTRICT" })
  dataset!: Relation<Dataset>;

  /**
   * Kept nullable: an analyzer may be deleted once no PENDING or RUNNING
   * experiment uses it, and the step snapshot remains.
   */
  @ManyToOne("Analyzer", { nullable: true, onDelete: "SET NULL" })
  analyzer?: Relation<Analyzer> | null;

  @OneToMany("ExperimentRun", "experiment", { cascade: ["insert"] })
  runs!: Relation<ExperimentRun[]>;
}
