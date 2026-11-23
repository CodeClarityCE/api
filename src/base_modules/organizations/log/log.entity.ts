import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";
import {
  Column,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Relation,
} from "typeorm";

import type { Organization } from "../organization.entity";

import type {
  ActionClassType,
  ActionSeverity,
  ActionType,
} from "./orgAuditLog.types";

@Entity()
export class Log {
  @PrimaryGeneratedColumn("uuid")
  @ApiProperty()
  @Expose()
  id!: string;

  @Column("integer")
  @ApiProperty()
  @Expose()
  action_severity!: ActionSeverity;

  @Column("varchar", { length: 25 })
  @ApiProperty()
  @Expose()
  action_class!: ActionClassType;

  @Column("varchar", { length: 50 })
  @ApiProperty()
  @Expose()
  action!: ActionType;

  @Column("text")
  @ApiProperty()
  @Expose()
  description!: string;

  // Empty when an Organization token is the actor.
  @Column("varchar", { length: 100, nullable: true })
  @ApiProperty()
  @Expose()
  blame_on_email?: string | null;

  @Column("timestamptz")
  @ApiProperty()
  @Expose()
  created_on!: Date;

  // Foreign keys
  @ManyToOne("Organization", "logs")
  organization!: Relation<Organization>;

  @Column()
  organization_id!: string;

  @Column({ nullable: true })
  blame_on?: string;

  // Set when an Organization token is the actor; the name is kept as it was then.
  @Column("uuid", { nullable: true })
  @ApiProperty({ required: false })
  @Expose()
  blame_on_token_id?: string | null;

  @Column("varchar", { length: 100, nullable: true })
  @ApiProperty({ required: false })
  @Expose()
  blame_on_token_name?: string | null;
}
