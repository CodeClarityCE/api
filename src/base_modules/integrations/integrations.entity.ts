import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToMany,
  Relation,
  ManyToOne,
  OneToMany,
} from "typeorm";
import type { Analysis } from "../analyses/analysis.entity";
import type { Organization } from "../organizations/organization.entity";
import type { Project } from "../projects/project.entity";
import type { RepositoryCache } from "../projects/repositoryCache.entity";
import type { User } from "../users/users.entity";

export enum IntegrationType {
  VCS = "VCS",
}

export enum IntegrationProvider {
  GITHUB = "GITHUB",
  GITLAB = "GITLAB",
  FILE = "FILE",
}

@Entity()
export class Integration {
  @ApiProperty()
  @Expose()
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ApiProperty()
  @Expose()
  @Column({
    length: 25,
  })
  integration_type!: IntegrationType;

  @ApiProperty()
  @Expose()
  @Column({
    length: 25,
  })
  integration_provider!: IntegrationProvider;

  @Column({
    length: 100,
  })
  access_token!: string;

  @ApiProperty()
  @Expose()
  @Column({
    length: 100,
    nullable: true,
  })
  token_type?: string;

  @Column({
    length: 100,
    nullable: true,
  })
  refresh_token?: string;

  @ApiProperty()
  @Expose()
  @Column("timestamptz", { nullable: true })
  expiry_date?: Date;

  @ApiProperty()
  @Expose()
  @Column()
  invalid!: boolean;

  @ApiProperty()
  @Expose()
  @Column({
    length: 25,
  })
  service_domain!: string;

  @ApiProperty()
  @Expose()
  @Column("timestamptz")
  added_on!: Date;

  @Column("timestamptz", { nullable: true })
  last_repository_sync!: Date;

  // Foreign keys
  @ManyToMany("Organization", "integrations")
  organizations!: Relation<Organization[]>;

  @ManyToMany("User", "integrations")
  users!: Relation<User[]>;

  @ManyToOne("RepositoryCache", "integration")
  repository_cache!: Relation<RepositoryCache>;

  @OneToMany("Project", "integration")
  projects!: Relation<Project[]>;

  @OneToMany("Analysis", "integration")
  analyses!: Relation<Analysis[]>;

  @ManyToOne("User", "integrations_owned")
  owner!: Relation<User>;
}
