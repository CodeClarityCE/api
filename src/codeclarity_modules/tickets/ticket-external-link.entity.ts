import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  Relation,
} from "typeorm";
import type { Ticket } from "./ticket.entity";

export enum ExternalTicketProvider {
  CLICKUP = "CLICKUP",
  JIRA = "JIRA",
  LINEAR = "LINEAR",
}

@Entity()
export class TicketExternalLink {
  @ApiProperty()
  @Expose()
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ApiProperty({ enum: ExternalTicketProvider })
  @Expose()
  @Column({
    type: "enum",
    enum: ExternalTicketProvider,
  })
  provider!: ExternalTicketProvider;

  @ApiProperty({ description: "External system task/issue ID" })
  @Expose()
  @Column({ length: 100 })
  external_id!: string;

  @ApiProperty({ description: "URL to the external ticket" })
  @Expose()
  @Column({ length: 500 })
  external_url!: string;

  @ApiProperty()
  @Expose()
  @Column("timestamptz")
  synced_on!: Date;

  @ApiProperty()
  @Expose()
  @Column({ default: true })
  sync_enabled!: boolean;

  // Foreign keys
  @ManyToOne("Ticket", "external_links", { onDelete: "CASCADE" })
  ticket!: Relation<Ticket>;
}

export interface TicketExternalLinkFrontend {
  id: string;
  provider: ExternalTicketProvider;
  external_id: string;
  external_url: string;
  synced_on: Date;
  sync_enabled: boolean;
}
