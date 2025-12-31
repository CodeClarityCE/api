import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";
import {
  Column,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Relation,
} from "typeorm";

import type { Analysis } from "../../base_modules/analyses/analysis.entity";
import type { Organization } from "../../base_modules/organizations/organization.entity";
import type { Project } from "../../base_modules/projects/project.entity";
import type { User } from "../../base_modules/users/users.entity";

import type { TicketEvent } from "./ticket-event.entity";
import type { TicketExternalLink } from "./ticket-external-link.entity";
import type { TicketVulnerabilityOccurrence } from "./ticket-occurrence.entity";

export enum TicketStatus {
  OPEN = "OPEN",
  IN_PROGRESS = "IN_PROGRESS",
  RESOLVED = "RESOLVED",
  CLOSED = "CLOSED",
  WONT_FIX = "WONT_FIX",
}

export enum TicketPriority {
  CRITICAL = "CRITICAL",
  HIGH = "HIGH",
  MEDIUM = "MEDIUM",
  LOW = "LOW",
}

export enum TicketType {
  VULNERABILITY = "VULNERABILITY",
  LICENSE = "LICENSE",
  UPGRADE = "UPGRADE",
}

@Entity()
export class Ticket {
  @ApiProperty()
  @Expose()
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ApiProperty()
  @Expose()
  @Column({ length: 200 })
  title!: string;

  @ApiProperty()
  @Expose()
  @Column("text")
  description!: string;

  @ApiProperty({ enum: TicketStatus })
  @Expose()
  @Column({
    type: "enum",
    enum: TicketStatus,
    default: TicketStatus.OPEN,
  })
  status!: TicketStatus;

  @ApiProperty({ enum: TicketPriority })
  @Expose()
  @Column({
    type: "enum",
    enum: TicketPriority,
  })
  priority!: TicketPriority;

  @ApiProperty({ enum: TicketType })
  @Expose()
  @Column({
    type: "enum",
    enum: TicketType,
  })
  type!: TicketType;

  @ApiProperty({ description: "Vulnerability ID (e.g., CVE-2021-44228)" })
  @Expose()
  @Index()
  @Column({ length: 100, nullable: true })
  vulnerability_id?: string;

  @ApiProperty()
  @Expose()
  @Column({ length: 200, nullable: true })
  affected_package?: string;

  @ApiProperty()
  @Expose()
  @Column({ length: 50, nullable: true })
  affected_version?: string;

  @ApiProperty()
  @Expose()
  @Column({ type: "float", nullable: true })
  severity_score?: number;

  @ApiProperty()
  @Expose()
  @Column({ length: 20, nullable: true })
  severity_class?: string;

  @ApiProperty()
  @Expose()
  @Column({ length: 50, nullable: true })
  recommended_version?: string;

  @ApiProperty()
  @Expose()
  @Column("text", { nullable: true })
  remediation_notes?: string;

  @ApiProperty()
  @Expose()
  @Column("timestamptz")
  created_on!: Date;

  @ApiProperty()
  @Expose()
  @Column("timestamptz", { nullable: true })
  updated_on?: Date | undefined;

  @ApiProperty()
  @Expose()
  @Column("timestamptz", { nullable: true })
  resolved_on?: Date | undefined;

  @ApiProperty()
  @Expose()
  @Column("timestamptz", { nullable: true })
  due_date?: Date | undefined;

  @ApiProperty({
    description: "External status from linked provider (e.g., ClickUp)",
  })
  @Expose()
  @Column({ length: 100, nullable: true })
  external_status?: string;

  // Foreign keys
  @ApiProperty()
  @Expose()
  @ManyToOne("Project", "tickets")
  project!: Relation<Project>;

  @ManyToOne("Organization", "tickets")
  organization!: Relation<Organization>;

  @ApiProperty()
  @Expose()
  @ManyToOne("User", "tickets_created")
  created_by!: Relation<User>;

  @ApiProperty()
  @Expose()
  @ManyToOne("User", "tickets_assigned", { nullable: true })
  assigned_to?: Relation<User> | undefined;

  @ApiProperty()
  @Expose()
  @ManyToOne("Analysis", { nullable: true })
  source_analysis?: Relation<Analysis>;

  @OneToMany("TicketEvent", "ticket")
  events!: Relation<TicketEvent[]>;

  @OneToMany("TicketExternalLink", "ticket")
  external_links!: Relation<TicketExternalLink[]>;

  @OneToMany("TicketVulnerabilityOccurrence", "ticket")
  occurrences!: Relation<TicketVulnerabilityOccurrence[]>;
}

export interface TicketFrontend {
  id: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  type: TicketType;
  vulnerability_id?: string;
  affected_package?: string;
  affected_version?: string;
  severity_score?: number;
  severity_class?: string;
  recommended_version?: string;
  remediation_notes?: string;
  created_on: Date;
  updated_on?: Date;
  resolved_on?: Date;
  due_date?: Date;
  external_status?: string;
  project_id: string;
  project_name: string;
  created_by_id: string;
  created_by_name: string;
  assigned_to_id?: string;
  assigned_to_name?: string;
}
