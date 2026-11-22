import { ApiProperty } from "@nestjs/swagger";
import { Expose, Type } from "class-transformer";
import {
  Column,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Relation,
} from "typeorm";

import type { User } from "../../users/users.entity";
import type { Organization } from "../organization.entity";

import { OrganizationTokenScope } from "./organization-token.types";

/** A secret a pipeline uses to act in one organization; only its hash is stored. */
@Entity()
export class OrganizationToken {
  @ApiProperty()
  @Expose()
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ApiProperty()
  @Expose()
  @Column({ length: 100 })
  name!: string;

  @ApiProperty({ enum: OrganizationTokenScope })
  @Expose()
  @Column("varchar", { length: 20 })
  scope!: OrganizationTokenScope;

  // SHA-256 of the secret, in hex.
  @Column("char", { length: 64, unique: true })
  secret_hash!: string;

  @ApiProperty()
  @Expose()
  @Type(() => Date)
  @Column("timestamptz")
  created_on!: Date;

  @ApiProperty()
  @Expose()
  @Type(() => Date)
  @Column("timestamptz")
  expires_on!: Date;

  // Set when an admin revokes the token; a revoked token never works again.
  @Column("timestamptz", { nullable: true })
  revoked_on!: Date | null;

  @ManyToOne("Organization", { onDelete: "CASCADE", nullable: false })
  organization!: Relation<Organization>;

  @Column("uuid")
  organizationId!: string;

  // The token outlives its creator, so the creator may be gone.
  @ManyToOne("User", { onDelete: "SET NULL", nullable: true })
  created_by?: Relation<User> | null;
}
