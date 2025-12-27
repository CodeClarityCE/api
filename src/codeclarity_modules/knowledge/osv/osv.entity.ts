import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";
import { Entity, Column, PrimaryGeneratedColumn, Index } from "typeorm";

@Entity("osv")
export class OSV {
  @PrimaryGeneratedColumn("uuid")
  @ApiProperty()
  @Expose()
  id!: string;

  @Column()
  @Index({ unique: true })
  @ApiProperty()
  @Expose()
  osv_id!: string;

  @Column({ nullable: true })
  @ApiProperty()
  @Expose()
  schema_version!: string;

  @Column({ nullable: true })
  @ApiProperty()
  @Expose()
  vlai_score!: string;

  @Column("float", { nullable: true })
  @ApiProperty()
  @Expose()
  vlai_confidence!: number;

  @Column({ nullable: true })
  @ApiProperty()
  @Expose()
  modified!: string;

  @Column({ nullable: true })
  @ApiProperty()
  @Expose()
  published!: string;

  @Column({ nullable: true })
  @ApiProperty()
  @Expose()
  withdrawn!: string;

  @Column({ nullable: true })
  @ApiProperty()
  @Expose()
  summary!: string;

  @Column({ nullable: true })
  @ApiProperty()
  @Expose()
  details!: string;

  @Column({ nullable: true })
  @ApiProperty()
  @Expose()
  cve!: string;

  @Column("jsonb", { nullable: true })
  @ApiProperty()
  @Expose()
  aliases!: unknown;

  @Column("jsonb", { nullable: true })
  @ApiProperty()
  @Expose()
  related!: unknown;

  @Column("jsonb", { nullable: true })
  @ApiProperty()
  @Expose()
  severity!: unknown;

  @Column("jsonb", { nullable: true })
  @ApiProperty()
  @Expose()
  affected!: unknown;

  @Column("jsonb", { nullable: true })
  @ApiProperty()
  @Expose()
  references!: unknown;

  @Column("jsonb", { nullable: true })
  @ApiProperty()
  @Expose()
  credits!: unknown;

  @Column("jsonb", { nullable: true })
  @ApiProperty()
  @Expose()
  database_specific!: unknown;

  @Column("jsonb", { nullable: true })
  @ApiProperty()
  @Expose()
  cwes!: unknown;
}
