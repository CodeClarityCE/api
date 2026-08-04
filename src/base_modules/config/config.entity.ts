import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("config")
export class Config {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "nvd_last", type: "timestamptz", nullable: true })
  nvdLast?: Date;

  @Column({ name: "npm_last", type: "varchar", nullable: true })
  npmLast?: string;

  @Column({ name: "gcve_last", type: "timestamptz", nullable: true })
  gcveLast?: Date;

  @Column({ name: "osv_last", type: "timestamptz", nullable: true })
  osvLast?: Date;
}
