import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

import { RemediationKind } from "src/codeclarity_modules/remediations/remediation.types";

import type { FixNextRank } from "../remediations/fix-next-rank";

import type { DueDateState } from "./service-level-targets";
import { TicketPriority, TicketStatus } from "./ticket.entity";

const DEFAULT_MY_WORK_LIMIT = 20;
const MAX_MY_WORK_LIMIT = 100;

export class MyWorkQuery {
  /** How many entries, most pressing first */
  @IsOptional()
  @Transform(({ value }: { value: string }) => parseInt(value, 10), {
    toClassOnly: true,
  })
  @IsInt()
  @Min(1)
  @Max(MAX_MY_WORK_LIMIT)
  limit = DEFAULT_MY_WORK_LIMIT;
}

/** The remediation a ticket tracks. */
export class MyWorkRemediation {
  @ApiProperty({ enum: RemediationKind })
  kind!: RemediationKind;

  @ApiProperty()
  workspace!: string;

  @ApiProperty()
  package!: string;

  @ApiProperty({ type: String, nullable: true })
  target_version!: string | null;
}

/** One open ticket assigned to the signed-in user. */
export class MyWorkEntry {
  @ApiProperty()
  ticket_id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ enum: TicketStatus })
  status!: TicketStatus;

  @ApiProperty({ enum: TicketPriority })
  priority!: TicketPriority;

  @ApiProperty()
  project_id!: string;

  @ApiProperty()
  project_name!: string;

  @ApiProperty({ type: String, nullable: true })
  due_date!: string | null;

  @ApiProperty({ enum: ["overdue", "due_soon", "on_track", "none"] })
  deadline!: DueDateState;

  @ApiProperty({ type: MyWorkRemediation, nullable: true })
  remediation!: MyWorkRemediation | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: "The vulnerability of an old one-vulnerability ticket",
  })
  vulnerability_id!: string | null;

  @ApiProperty({ type: String, nullable: true })
  affected_package!: string | null;

  @ApiProperty({
    description:
      "The Fix next rank of the instances the ticket still tracks in the current analysis",
  })
  rank!: FixNextRank;
}
