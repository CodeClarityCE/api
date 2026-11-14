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
import type { ProbeCandidate } from "./experiment-probes";

/**
 * The lockfile-touching commits between two snapshot commits of a dataset
 * entry, listed once from GitHub: the candidates fix probes halve over.
 */
@Entity()
@Unique(["experiment", "dataset_entry", "from_commit", "to_commit"])
export class ExperimentProbeInterval {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @ManyToOne("Experiment", { nullable: false, onDelete: "CASCADE" })
  experiment!: Relation<Experiment>;

  @ManyToOne("DatasetEntry", { nullable: false, onDelete: "CASCADE" })
  dataset_entry!: Relation<DatasetEntry>;

  /** Empty when the interval starts before the repository's first commit */
  @Column("varchar", { length: 64 })
  from_commit!: string;

  @Column("varchar", { length: 64 })
  to_commit!: string;

  /** The lockfile path the commits were listed for */
  @Column("text", { nullable: true })
  lockfile_path!: string | null;

  /** Oldest first, the later snapshot's commit last when it touched the lockfile */
  @Column("jsonb")
  candidates!: ProbeCandidate[];

  /** Why the commits could not be listed */
  @Column("varchar", { length: 1000, nullable: true })
  error!: string | null;
}
