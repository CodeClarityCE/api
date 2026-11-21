import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";
import {
  Column,
  Entity,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Relation,
} from "typeorm";

import type { Policy } from "../../codeclarity_modules/policies/policy.entity";
import type { ServiceLevelTargetDays } from "../../codeclarity_modules/tickets/service-level-targets";
import type { Analysis } from "../analyses/analysis.entity";
import type { Analyzer } from "../analyzers/analyzer.entity";
import type { Integration } from "../integrations/integrations.entity";
import type { Project } from "../projects/project.entity";
import type { User } from "../users/users.entity";

import type { Invitation } from "./invitations/invitation.entity";
import type { Log } from "./log/log.entity";
import type { OrganizationMemberships } from "./memberships/organization.memberships.entity";

@Entity()
export class Organization {
  @ApiProperty()
  @Expose()
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ApiProperty()
  @Expose()
  @Column({
    length: 100,
  })
  name!: string;

  @ApiProperty()
  @Expose()
  @Column("text")
  description!: string;

  @ApiProperty()
  @Expose()
  @Column({
    length: 5,
  })
  color_scheme!: string;

  @ApiProperty()
  @Expose()
  @Column("timestamptz")
  created_on!: Date;

  @ApiProperty()
  @Expose()
  @Column()
  personal!: boolean;

  @ApiProperty()
  @Expose()
  @Column({ default: false })
  auto_resolve_tickets!: boolean;

  /** Days after which a project's current analysis counts as stale */
  @ApiProperty()
  @Expose()
  @Column({ type: "integer", default: 14 })
  freshness_threshold_days!: number;

  /** Whether new tickets get due dates from the service level targets */
  @ApiProperty()
  @Expose()
  @Column({ default: false })
  service_level_targets_enabled!: boolean;

  /** Days allowed per severity; null means no target for that severity */
  @ApiProperty()
  @Expose()
  @Column({
    type: "jsonb",
    // Postgres's own text for the suggested days, so schema sync sees no change.
    default: () => `'{"low": null, "high": 30, "medium": 90, "critical": 7}'`,
  })
  service_level_targets!: ServiceLevelTargetDays;

  // Foreign keys
  @ApiProperty()
  @Expose()
  @ManyToOne("User", "organizations_created")
  created_by!: Relation<User>;

  @OneToMany("Invitation", "organization")
  invitations?: Relation<Invitation[]>;

  @ApiProperty()
  @Expose()
  @OneToMany("OrganizationMemberships", "organization")
  organizationMemberships!: Relation<OrganizationMemberships[]>;

  @ManyToMany("User", "ownerships")
  @JoinTable()
  owners?: Relation<User[]>;

  @OneToMany("User", "default_org")
  default!: Relation<User[]>;

  @ApiProperty()
  @Expose()
  @ManyToMany("Integration", "organizations")
  @JoinTable()
  integrations?: Relation<Integration[]>;

  @ManyToMany("Policy", "organizations")
  @JoinTable()
  policies?: Relation<Policy[]>;

  @ApiProperty()
  @Expose()
  @ManyToMany("Project", "organizations")
  @JoinTable()
  projects!: Relation<Project[]>;

  @OneToMany("Analyzer", "organization")
  analyzers!: Relation<Analyzer[]>;

  @OneToMany("Analysis", "organization")
  analyses!: Relation<Analysis[]>;

  @OneToMany("Log", "organization")
  logs!: Relation<Log[]>;

  @OneToMany("Ticket", "organization")
  tickets!: Relation<unknown[]>;
}
