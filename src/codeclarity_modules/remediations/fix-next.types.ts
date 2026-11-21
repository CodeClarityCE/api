import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

import type { FixNextRank } from "./fix-next-rank";
import type { RemediationKind } from "./remediation.types";
import type { RemediationTicket } from "./remediation-tickets";

export const DEFAULT_FIX_NEXT_LIMIT = 10;
export const MAX_FIX_NEXT_LIMIT = 50;

export class FixNextQuery {
  /** How many entries, most urgent first */
  @IsOptional()
  @Transform(({ value }: { value: string }) => parseInt(value, 10), {
    toClassOnly: true,
  })
  @IsInt()
  @Min(1)
  @Max(MAX_FIX_NEXT_LIMIT)
  limit = DEFAULT_FIX_NEXT_LIMIT;
}

/** The change one Fix next entry makes in one project workspace. */
export class FixNextRemediation {
  @ApiProperty()
  project_id!: string;

  @ApiProperty()
  project_name!: string;

  @ApiProperty()
  workspace!: string;

  /** Null when the analysis names no package manager we have commands for */
  @ApiProperty({ nullable: true, type: String })
  command!: string | null;

  /** The ticket tracking it; null when it has none */
  @ApiProperty({ nullable: true })
  ticket!: RemediationTicket | null;
}

/**
 * One change across the organization's projects: the same kind, package and
 * target version, ranked by its reasons.
 */
export class FixNextEntry {
  @ApiProperty()
  kind!: RemediationKind;

  @ApiProperty()
  package!: string;

  @ApiProperty()
  target_version!: string;

  /** True when the target leaves the current major of an installed version */
  @ApiProperty()
  potentially_breaking!: boolean;

  /** The worst vulnerability it resolves, for the vulnerability page */
  @ApiProperty()
  vulnerability_id!: string;

  /** The reasons for its place in the list */
  @ApiProperty()
  rank!: FixNextRank;

  @ApiProperty()
  vulnerability_count!: number;

  @ApiProperty()
  project_count!: number;

  @ApiProperty()
  instance_count!: number;

  /** One per project workspace, by project name */
  @ApiProperty({ type: [FixNextRemediation] })
  remediations!: FixNextRemediation[];
}
