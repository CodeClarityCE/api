import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";
import { Entity, Column, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { User } from "../../users/users.entity";
import { Organization } from "../organization.entity";

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
  @ManyToOne(
    () => Organization,
    (organization) => organization.organizationMemberships,
  )
  public organization!: Organization;
}
