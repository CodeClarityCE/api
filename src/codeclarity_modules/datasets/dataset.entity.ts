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

import type { Integration } from "../../base_modules/integrations/integrations.entity";
import type { Organization } from "../../base_modules/organizations/organization.entity";
import type { User } from "../../base_modules/users/users.entity";

import type { DatasetEntry } from "./dataset-entry.entity";

export enum DatasetStatus {
  BUILDING = "BUILDING",
  READY = "READY",
  FAILED = "FAILED",
}

/** The GitHub search languages a dataset can be drawn from. */
export enum DatasetLanguage {
  JAVASCRIPT = "JavaScript",
  TYPESCRIPT = "TypeScript",
}

/** How the dataset was drawn; stored so a build can be repeated exactly. */
export interface DatasetParams {
  languages: DatasetLanguage[];
  /** Search pages fetched per language, 100 results each */
  pages: number;
  min_stars: number;
  /** Number of qualifying repositories to keep */
  limit: number;
  /** A repository qualifies if its root holds package.json and one of these */
  lockfiles: string[];
}

/** Why candidates were not selected, filled in when the build completes. */
export interface DatasetStats {
  /** Raw search results over every language and page */
  search_results: number;
  /** Distinct active repositories after the search stage, in probe order */
  candidates: number;
  /** Candidates looked up before the limit was reached */
  probed: number;
  selected: number;
  rejected: {
    repo_gone: number;
    duplicate_canonical: number;
    fork_or_archived: number;
    no_branch: number;
    no_package_json: number;
    no_lockfile: number;
  };
}

/**
 * A named, immutable list of repositories ranked by GitHub stars. Built in
 * the background (status BUILDING), then frozen once READY so that the same
 * cohort can be referred to later.
 */
@Entity()
@Unique(["organization", "name"])
export class Dataset {
  @ApiProperty()
  @Expose()
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ApiProperty()
  @Expose()
  @Column({ length: 100 })
  name!: string;

  @ApiProperty({ enum: DatasetStatus })
  @Expose()
  @Column({
    type: "enum",
    enum: DatasetStatus,
    default: DatasetStatus.BUILDING,
  })
  status!: DatasetStatus;

  @ApiProperty()
  @Expose()
  @Column("jsonb")
  params!: DatasetParams;

  @ApiProperty()
  @Expose()
  @Column("jsonb", { nullable: true })
  stats?: DatasetStats | null;

  @ApiProperty()
  @Expose()
  @Column("varchar", { length: 1000, nullable: true })
  error?: string | null;

  /** API instance currently building the dataset */
  @Column("varchar", { length: 200, nullable: true })
  lease_owner?: string | null;

  /** No other instance picks the build up before this time */
  @Column("timestamptz", { nullable: true })
  lease_until?: Date | null;

  @ApiProperty()
  @Expose()
  @Column("timestamptz")
  created_on!: Date;

  @ApiProperty()
  @Expose()
  @Column("timestamptz", { nullable: true })
  built_on?: Date | null;

  @ManyToOne("Organization", { onDelete: "CASCADE" })
  organization!: Relation<Organization>;

  @ManyToOne("User", { nullable: true, onDelete: "SET NULL" })
  created_by?: Relation<User> | null;

  /** The GitHub integration whose token the build uses */
  @ManyToOne("Integration", { nullable: true, onDelete: "SET NULL" })
  integration?: Relation<Integration> | null;

  @OneToMany("DatasetEntry", "dataset")
  entries!: Relation<DatasetEntry[]>;
}
