import {
  Column,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Relation,
  Unique,
} from "typeorm";

import type { DatasetEntry } from "../datasets/dataset-entry.entity";

import type { Experiment } from "./experiment.entity";
import type { ProbePackage } from "./experiment-row-copy";

/**
 * The packages one dataset entry resolves at one commit (ADR 0001), from a
 * snapshot's or a fix probe's js-sbom result. One row per commit, however
 * many snapshots pin it. Exposures are derived from these on read.
 */
@Entity()
@Unique(["experiment", "dataset_entry", "commit_hash"])
export class ExperimentProbeOutcome {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @ManyToOne("Experiment", { nullable: false, onDelete: "CASCADE" })
  experiment!: Relation<Experiment>;

  @ManyToOne("DatasetEntry", { nullable: false, onDelete: "CASCADE" })
  dataset_entry!: Relation<DatasetEntry>;

  @Column("varchar", { length: 64 })
  commit_hash!: string;

  @Column("timestamptz", { nullable: true })
  committed_at!: Date | null;

  /** Every resolved (workspace, package, version) with its direct flag */
  @Column("jsonb")
  packages!: ProbePackage[];
}
