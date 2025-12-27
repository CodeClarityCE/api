import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";
import { Entity, Column, PrimaryGeneratedColumn } from "typeorm";

@Entity("plugin")
export class Plugin {
  @PrimaryGeneratedColumn("uuid")
  @ApiProperty()
  @Expose()
  id!: string;

  @Column({ nullable: true })
  @ApiProperty()
  @Expose()
  name?: string;

  @Column({ nullable: true })
  @ApiProperty()
  @Expose()
  version?: string;

  @Column({ nullable: true })
  @ApiProperty()
  @Expose()
  description?: string;

  @Column("jsonb", { nullable: true })
  @ApiProperty()
  @Expose()
  depends_on?: string[];

  @Column("jsonb", { nullable: true })
  @ApiProperty()
  @Expose()
  config?: Record<string, unknown>;
}
