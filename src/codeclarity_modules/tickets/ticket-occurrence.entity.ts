import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";
import {
  Column,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Relation,
} from "typeorm";

import type { Analysis } from "../../base_modules/analyses/analysis.entity";
import type { TopLevelDependency } from "../vulnerability_instances/top-level-paths";

import type { Ticket } from "./ticket.entity";

/**
 * One vulnerability instance a ticket's remediation resolves, as an analysis
 * found it. Its key matches that analysis's instance row.
 */
@Entity()
@Index(
  [
    "ticket",
    "analysis",
    "workspace",
    "vulnerability_id",
    "package",
    "installed_version",
  ],
  { unique: true },
)
export class TicketVulnerabilityOccurrence {
  @ApiProperty()
  @Expose()
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ApiProperty()
  @Expose()
  @Column({ length: 200 })
  workspace!: string;

  @ApiProperty({ description: "Canonical vulnerability id" })
  @Expose()
  @Column({ length: 100 })
  vulnerability_id!: string;

  @ApiProperty({ description: "The id the analysis's results use" })
  @Expose()
  @Column({ length: 100 })
  analysis_vulnerability_id!: string;

  @ApiProperty()
  @Expose()
  @Column({ length: 200 })
  package!: string;

  @ApiProperty()
  @Expose()
  @Column({ type: "varchar", length: 50, nullable: true })
  ecosystem!: string | null;

  @ApiProperty()
  @Expose()
  @Column({ length: 100 })
  installed_version!: string;

  @ApiProperty()
  @Expose()
  @Column()
  prod!: boolean;

  @ApiProperty()
  @Expose()
  @Column({ length: 20 })
  severity_class!: string;

  @ApiProperty()
  @Expose()
  @Column({ type: "float", nullable: true })
  severity_score!: number | null;

  @ApiProperty()
  @Expose()
  @Column({ type: "varchar", length: 100, nullable: true })
  fixed_version!: string | null;

  @ApiProperty({ description: "Top-level dependencies and their paths" })
  @Expose()
  @Column("jsonb", { default: () => "'[]'" })
  top_level_dependencies!: TopLevelDependency[];

  @ApiProperty()
  @Expose()
  @Column("timestamptz")
  detected_on!: Date;

  @ApiProperty({ description: "False when fixed in subsequent scan" })
  @Expose()
  @Column({ default: true })
  is_active!: boolean;

  @ApiProperty()
  @Expose()
  @Column("timestamptz", { nullable: true })
  resolved_on?: Date;

  // Foreign keys
  @ManyToOne("Ticket", "occurrences", { onDelete: "CASCADE" })
  ticket!: Relation<Ticket>;

  @ApiProperty()
  @Expose()
  @ManyToOne("Analysis", { onDelete: "CASCADE" })
  analysis!: Relation<Analysis>;
}
