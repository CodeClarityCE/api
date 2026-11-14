import {
  Column,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Relation,
  Unique,
} from "typeorm";

import type { User } from "../../base_modules/users/users.entity";

import type { Experiment } from "./experiment.entity";
import type { ExperimentResults } from "./experiment-results";

/** An experiment's results frozen under one metric version (ADR 0007). */
@Entity()
@Unique(["experiment", "metric_version"])
export class ExperimentPublishedResults {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column("integer")
  metric_version!: number;

  @Column("jsonb")
  results!: ExperimentResults;

  /** SHA-256 of the replication package */
  @Column("varchar", { length: 64, nullable: true })
  package_checksum?: string | null;

  /** The replication package, built once at publish; read only for download */
  @Column("bytea", { nullable: true, select: false })
  package_archive?: Buffer | null;

  @Column("timestamptz")
  published_on!: Date;

  @ManyToOne("Experiment", { nullable: false, onDelete: "CASCADE" })
  experiment!: Relation<Experiment>;

  @ManyToOne("User", { nullable: true, onDelete: "SET NULL" })
  published_by?: Relation<User> | null;
}
