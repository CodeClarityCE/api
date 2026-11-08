import {
  Column,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Relation,
} from "typeorm";

import type { Experiment } from "./experiment.entity";
import type { FigureDefinition } from "./experiment-figure-catalog";

/** A named, saved definition of one visual over one experiment's results. */
@Entity()
export class ExperimentFigure {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ length: 100 })
  name!: string;

  @Column("jsonb")
  definition!: FigureDefinition;

  @Column("timestamptz")
  created_on!: Date;

  @Index()
  @ManyToOne("Experiment", { nullable: false, onDelete: "CASCADE" })
  experiment!: Relation<Experiment>;
}
