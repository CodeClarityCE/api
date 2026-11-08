import {
  Column,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Relation,
  Unique,
} from "typeorm";

import type { FigureData } from "./experiment-figure-data";
import type { ExperimentPublishedResults } from "./experiment-published-results.entity";

/** What one Figure definition plotted under a Published results version. */
@Entity()
@Unique(["published_results", "definition_key"])
export class ExperimentPublishedFigureData {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  /** The canonical definition, as JSON */
  @Column("text")
  definition_key!: string;

  @Column("jsonb")
  data!: FigureData;

  @ManyToOne("ExperimentPublishedResults", {
    nullable: false,
    onDelete: "CASCADE",
  })
  published_results!: Relation<ExperimentPublishedResults>;
}
