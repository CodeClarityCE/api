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

import type { Dataset } from "./dataset.entity";

/** One selected repository of a dataset, at its star rank. */
@Entity()
@Unique(["dataset", "rank"])
export class DatasetEntry {
  @ApiProperty()
  @Expose()
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ApiProperty({ description: "0-based star rank among the selected repos" })
  @Expose()
  @Column("integer")
  rank!: number;

  @ApiProperty({ description: "Canonical owner/repo slug" })
  @Expose()
  @Column({ length: 200 })
  full_name!: string;

  @ApiProperty()
  @Expose()
  @Column({ length: 100 })
  owner!: string;

  @ApiProperty()
  @Expose()
  @Column({ length: 100 })
  repo!: string;

  @ApiProperty()
  @Expose()
  @Column({ length: 300 })
  git_url!: string;

  @ApiProperty()
  @Expose()
  @Column({ length: 255 })
  default_branch!: string;

  @ApiProperty({ description: "Stars at build time (the ranking key)" })
  @Expose()
  @Column("integer")
  stars!: number;

  @ApiProperty()
  @Expose()
  @Column({ length: 50, nullable: true })
  language?: string | null;

  @ApiProperty()
  @Expose()
  @Column("bigint", { nullable: true })
  github_id?: string | null;

  @ApiProperty({ description: "Root lockfiles found when the repo qualified" })
  @Expose()
  @Column("jsonb")
  lockfiles!: string[];

  @ManyToOne("Dataset", "entries", { onDelete: "CASCADE" })
  dataset!: Relation<Dataset>;
}
