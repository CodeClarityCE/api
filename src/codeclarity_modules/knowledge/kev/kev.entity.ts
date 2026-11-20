import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";
import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

// One CISA Known Exploited Vulnerabilities catalog entry, mirrored by the knowledge service.
@Entity("kev")
export class Kev {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ unique: true })
  @ApiProperty()
  @Expose()
  cve!: string;

  @Column({ type: "varchar", nullable: true })
  @ApiProperty()
  @Expose()
  vendor_project!: string | null;

  @Column({ type: "varchar", nullable: true })
  @ApiProperty()
  @Expose()
  product!: string | null;

  @Column({ type: "varchar", nullable: true })
  @ApiProperty()
  @Expose()
  vulnerability_name!: string | null;

  // YYYY-MM-DD the catalog listed it.
  @Column({ type: "date" })
  @ApiProperty()
  @Expose()
  date_added!: string;

  @Column({ type: "date", nullable: true })
  @ApiProperty()
  @Expose()
  due_date!: string | null;

  @Column({ type: "text", nullable: true })
  @ApiProperty()
  @Expose()
  short_description!: string | null;

  @Column({ type: "text", nullable: true })
  @ApiProperty()
  @Expose()
  required_action!: string | null;

  @Column({ type: "text", nullable: true })
  @ApiProperty()
  @Expose()
  notes!: string | null;

  @Column({ default: false })
  @ApiProperty()
  @Expose()
  known_ransomware_use!: boolean;

  @Column({ type: "jsonb", default: () => "'[]'" })
  @ApiProperty()
  @Expose()
  cwes!: string[];
}
