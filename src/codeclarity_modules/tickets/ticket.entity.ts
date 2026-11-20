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
import type { ManifestEdit } from "../remediations/package-manager-commands";
import { RemediationKind } from "../remediations/remediation.types";

import type { TicketEvent } from "./ticket-event.entity";
import type { TicketExternalLink } from "./ticket-external-link.entity";
import type { TicketVulnerabilityOccurrence } from "./ticket-occurrence.entity";

// The frontend copies TicketStatus in frontend/src/codeclarity_components/tickets/tickets.entity.ts.
// The umbrella type-sync check (scripts/type-sync) fails CI when it lacks a value.
export enum TicketStatus {
  OPEN = "OPEN",
  IN_PROGRESS = "IN_PROGRESS",
  RESOLVED = "RESOLVED",
  CLOSED = "CLOSED",
  WONT_FIX = "WONT_FIX",
}

// The frontend copies TicketPriority in frontend/src/codeclarity_components/tickets/tickets.entity.ts.
// The umbrella type-sync check (scripts/type-sync) fails CI when it lacks a value.
export enum TicketPriority {
  CRITICAL = "CRITICAL",
  HIGH = "HIGH",
  MEDIUM = "MEDIUM",
  LOW = "LOW",
}

// The frontend copies TicketType in frontend/src/codeclarity_components/tickets/tickets.entity.ts.
// The umbrella type-sync check (scripts/type-sync) fails CI when it lacks a value.
export enum TicketType {
  VULNERABILITY = "VULNERABILITY",
  LICENSE = "LICENSE",
  UPGRADE = "UPGRADE",
}

@Entity()
// Finds the open ticket of a remediation (ADR 0016).
@Index([
  "project",
  "remediation_kind",
  "remediation_workspace",
  "remediation_package",
])
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

  // The remediation the ticket tracks; null for tickets that track one vulnerability.
  @ApiProperty({ enum: RemediationKind })
  @Expose()
  @Column({ type: "varchar", length: 30, nullable: true })
  remediation_kind?: RemediationKind | null;

  @ApiProperty()
  @Expose()
  @Column({ type: "varchar", length: 200, nullable: true })
  remediation_workspace?: string | null;

  @ApiProperty()
  @Expose()
  @Column({ type: "varchar", length: 200, nullable: true })
  remediation_package?: string | null;

  @ApiProperty()
  @Expose()
  @Column({ type: "boolean", nullable: true })
  potentially_breaking?: boolean | null;

  @ApiProperty()
  @Expose()
  @Column({ type: "varchar", length: 20, nullable: true })
  package_manager?: string | null;

  @ApiProperty()
  @Expose()
  @Column({ type: "text", nullable: true })
  remediation_command?: string | null;

  @ApiProperty()
  @Expose()
  @Column({ type: "jsonb", nullable: true })
  remediation_manifest_edit?: ManifestEdit | null;

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
  // A ticket belongs to its project and is deleted with it.
  @ManyToOne("Project", "tickets", { onDelete: "CASCADE" })
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
  // A ticket outlives the analysis that found it.
  @ManyToOne("Analysis", { nullable: true, onDelete: "SET NULL" })
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
