import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";
import {
  Column,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";

import { Integration } from "../integrations/integrations.entity";

export enum RepositoryType {
  GITHUB = "GITHUB",
  GITLAB = "GITLAB",
}

@Entity()
@Unique("UQ_repository_cache_integration_provider_id", [
  "integration",
  "provider_id",
])
export class RepositoryCache {
  @PrimaryGeneratedColumn("uuid")
  @ApiProperty()
  @Expose()
  id!: string;

  @Column()
  repository_type!: RepositoryType;

  @Column()
  @ApiProperty()
  @Expose()
  url!: string;

  @Column()
  @ApiProperty()
  @Expose()
  default_branch!: string;

  @Column()
  @ApiProperty()
  @Expose()
  visibility!: string;

  @Column()
  @ApiProperty()
  @Expose()
  fully_qualified_name!: string;

  @Column({
    nullable: true,
  })
  service_domain!: string;

  /** The provider's stable repository id; null on rows cached before it was kept */
  @Column({ type: "varchar", nullable: true })
  provider_id?: string | null;

  @Column()
  @ApiProperty()
  @Expose()
  description!: string;

  @Column("timestamptz")
  @ApiProperty()
  @Expose()
  created_at!: Date;

  @ManyToOne(() => Integration, (integration) => integration.repository_cache)
  integration!: Integration;
}
