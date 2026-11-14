import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";
import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Entity("epss")
export class EPSS {
  @PrimaryGeneratedColumn("uuid")
  @ApiProperty()
  @Expose()
  id!: string;

  @Column()
  @ApiProperty()
  @Expose()
  @Index({ unique: true })
  cve!: string;

  @Column("float", { nullable: true })
  @ApiProperty()
  @Expose()
  score!: number;

  @Column("float", { nullable: true })
  @ApiProperty()
  @Expose()
  percentile!: number;

  @Column({ type: "date", nullable: true })
  @ApiProperty()
  @Expose()
  score_date?: string | null;
}
