import {
  Column,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Relation,
  Unique,
} from "typeorm";

import type { Analysis } from "../../base_modules/analyses/analysis.entity";
import type { DatasetEntry } from "../datasets/dataset-entry.entity";

import type { Experiment } from "./experiment.entity";

export type ExperimentProbeStatus = "pending" | "done" | "failed";

/**
 * One fix probe: an SBOM-only analysis of one commit of a dataset entry
 * (ADR 0005). Pending once submitted; done once its packages are written to
 * the probe outcome rows; failed with the reason otherwise.
 */
@Entity()
@Unique(["experiment", "dataset_entry", "commit_hash"])
export class ExperimentProbe {
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

  @Column("varchar", { length: 16, default: "pending" })
  status!: ExperimentProbeStatus;

  @Column("varchar", { length: 1000, nullable: true })
  error!: string | null;

  @Column("timestamptz", { nullable: true })
  submitted_on!: Date | null;

  @Column("timestamptz", { nullable: true })
  ended_on!: Date | null;

  /** Deleting the analysis never deletes the probe */
  @ManyToOne("Analysis", { nullable: true, onDelete: "SET NULL" })
  analysis?: Relation<Analysis> | null;
}
