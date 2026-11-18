import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";
import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from "typeorm";

import { User } from "../../users/users.entity";
import type { Organization } from "../organization.entity";

// The frontend copies MemberRole in frontend/src/codeclarity_components/organizations/organization.entity.ts.
// The umbrella type-sync check (scripts/type-sync) fails CI when it lacks a value.
export enum MemberRole {
  OWNER = 0,
  ADMIN = 1,
  MODERATOR = 2,
  USER = 3,
}

@Entity()
export class OrganizationMemberships {
  @PrimaryGeneratedColumn("uuid")
  public organizationMembershipId!: string;

  @ApiProperty()
  @Expose()
  @Column()
  public role!: MemberRole;

  @ApiProperty()
  @Expose()
  @Column("timestamptz")
  public joined_on!: Date;

  @ApiProperty()
  @Expose()
  @ManyToOne(() => User, (user) => user.organizationMemberships)
  public user!: User;

  @ApiProperty()
  @Expose()
  @ManyToOne("Organization", "organizationMemberships")
  public organization!: Organization;
}
