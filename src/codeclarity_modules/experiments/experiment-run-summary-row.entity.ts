import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  Relation,
} from "typeorm";

import type { Experiment } from "./experiment.entity";
import type { RunSummaryRow } from "./experiment-row-copy";
import type { ExperimentRun } from "./experiment-run.entity";

/**
 * The tidy summary copied from a done run's results (ADR 0001), columns as
 * the archived harness's analyses.parquet. Entry metadata (rank, slug,
 * stars, git_url) is joined through the run's dataset entry, not copied.
 * Owned by the experiment: deleted with it or with the run.
 */
@Entity()
export class ExperimentRunSummaryRow implements RunSummaryRow {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @ManyToOne("Experiment", { nullable: false, onDelete: "CASCADE" })
  experiment!: Relation<Experiment>;

  @OneToOne("ExperimentRun", { nullable: false, onDelete: "CASCADE" })
  @JoinColumn()
  run!: Relation<ExperimentRun>;

  @Column("integer")
  total_dependencies!: number;

  @Column("integer")
  direct_dependencies!: number;

  @Column("integer")
  transitive_dependencies!: number;

  @Column("integer")
  dev_dependencies!: number;

  @Column("integer")
  prod_dependencies!: number;

  @Column("varchar", { length: 32, nullable: true })
  package_manager!: string | null;

  @Column("integer")
  total_vulnerabilities!: number;

  @Column("integer")
  vulnerable_dependencies!: number;

  @Column("integer")
  direct_vulnerabilities!: number;

  @Column("integer")
  transitive_vulnerabilities!: number;

  @Column("integer")
  n_critical!: number;

  @Column("integer")
  n_high!: number;

  @Column("integer")
  n_medium!: number;

  @Column("integer")
  n_low!: number;

  @Column("integer")
  n_none!: number;
}
