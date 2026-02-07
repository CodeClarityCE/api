import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";
import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Entity("gcve")
export class GCVE {
  @PrimaryGeneratedColumn("uuid")
  @ApiProperty()
  @Expose()
  id!: string;

  @Column()
  @Index({ unique: true })
  @ApiProperty()
  @Expose()
  gcve_id!: string;

  @Column({ nullable: true })
  @ApiProperty()
  @Expose()
  cve_id!: string;

  @Column({ nullable: true })
  @ApiProperty()
  @Expose()
  data_version!: string;

  @Column({ nullable: true })
  @ApiProperty()
  @Expose()
  state!: string;

  @Column({ nullable: true })
  @ApiProperty()
  @Expose()
  date_published!: string;

  @Column({ nullable: true })
  @ApiProperty()
  @Expose()
  date_updated!: string;

  @Column({ nullable: true })
  @ApiProperty()
  @Expose()
  assigner_org_id!: string;

  @Column("jsonb", { nullable: true })
  @ApiProperty()
  @Expose()
  descriptions!: unknown;

  @Column("jsonb", { nullable: true })
  @ApiProperty()
  @Expose()
  affected!: unknown;

  @Column("jsonb", { nullable: true })
  @ApiProperty()
  @Expose()
  affected_flattened!: unknown;

  @Column("jsonb", { nullable: true })
  @ApiProperty()
  @Expose()
  metrics!: unknown;

  @Column("jsonb", { nullable: true })
  @ApiProperty()
  @Expose()
  problem_types!: unknown;

  @Column("jsonb", { nullable: true })
  @ApiProperty()
  @Expose()
  references!: unknown;

  @Column("jsonb", { nullable: true })
  @ApiProperty()
  @Expose()
  adp_enrichments!: unknown;

  @Column("text", { array: true, nullable: true })
  @ApiProperty()
  @Expose()
  cwes!: string[];

  @Column({ nullable: true })
  @ApiProperty()
  @Expose()
  vlai_score!: string;

  @Column("float", { nullable: true })
  @ApiProperty()
  @Expose()
  vlai_confidence!: number;
}
