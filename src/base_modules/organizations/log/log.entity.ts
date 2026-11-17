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

  @Column({
    length: 100,
  })
  @ApiProperty()
  @Expose()
  blame_on_email!: string;

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
}
