import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";
import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Entity("nvd")
export class NVD {
  @PrimaryGeneratedColumn("uuid")
  @ApiProperty()
  @Expose()
  id!: string;

  @Column()
  @Index({ unique: true })
  @ApiProperty()
  @Expose()
  nvd_id!: string;

  @Column({ nullable: true })
  @ApiProperty()
  @Expose()
  sourceIdentifier!: string;

  @Column({ nullable: true })
  @ApiProperty()
  @Expose()
  published!: string;

  @Column({ nullable: true })
  @ApiProperty()
  @Expose()
  lastModified!: string;

  @Column({ nullable: true })
  @ApiProperty()
  @Expose()
  vulnStatus!: string;

  @Column("jsonb", { nullable: true })
  @ApiProperty()
  @Expose()
  descriptions!: unknown;

  @Column({ nullable: true })
  @ApiProperty()
  @Expose()
  vlai_score!: string;

  @Column("float", { nullable: true })
  @ApiProperty()
  @Expose()
  vlai_confidence!: number;

  @Column("jsonb", { nullable: true })
  @ApiProperty()
  @Expose()
  metrics!: unknown;

  @Column("jsonb", { nullable: true })
  @ApiProperty()
  @Expose()
  weaknesses!: unknown;

  @Column("jsonb", { nullable: true })
  @ApiProperty()
  @Expose()
  configurations!: unknown;

  @Column("jsonb", { nullable: true })
  @ApiProperty()
  @Expose()
  affectedFlattened!: unknown;

  @Column("jsonb", { nullable: true })
  @ApiProperty()
  @Expose()
  affected!: unknown;

  @Column("jsonb", { nullable: true })
  @ApiProperty()
  @Expose()
  references!: unknown;
}
