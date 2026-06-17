import { ApiProperty } from "@nestjs/swagger";
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsOptional, IsUrl,IsUUID } from "class-validator";

import { IntegrationProvider } from "../integrations/integration.types";

/** Maximum number of ids accepted in a single batch request. */
export const BATCH_MAX_IDS = 500;

/**
 * Per-id outcome of a batch operation. `not_found` covers ids that do not
 * exist or do not belong to the org; `not_authorized` covers ids the caller
 * lacks permission to act on; `skipped` covers no-op transitions (e.g. an
 * already-terminal analysis on cancel).
 */
export type BatchItemStatus =
  | "deleted"
  | "cancelled"
  | "not_found"
  | "not_authorized"
  | "skipped";

export interface BatchItemResult {
  id: string;
  status: BatchItemStatus;
}

export interface BatchResponse {
  results: BatchItemResult[];
  succeeded: number;
  failed: number;
}

export class BatchProjectIdsBody {
  @ApiProperty({
    description: "The ids of the projects to operate on",
    type: [String],
    example: ["b15e2b8a-...", "c27f1d9c-..."],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(BATCH_MAX_IDS)
  @IsUUID("all", { each: true })
  project_ids!: string[];
}

/********************************************/
/*             HTTP Post bodies             */
/********************************************/

export class ProjectImportBody {
  @ApiProperty()
  @IsOptional()
  integration_id!: string;

  @ApiProperty()
  @IsUrl()
  @IsOptional()
  url!: string;

  @ApiProperty()
  @IsOptional()
  name!: string;

  @ApiProperty()
  @IsOptional()
  description!: string;
}

/********************************************/
/*             HTTP Patch bodies            */
/********************************************/

export interface ProjectUpdateBody {
  description: string;
}

/********************************************/
/*             Create interfaces            */
/********************************************/

export interface ProjectCreate {
  name: string;
  description: string;
  integration_id: string;
  url: string;
  type: IntegrationProvider;
  downloaded: boolean;
  imported_on: Date;
  imported_by: string;
  organization_id: string;
  default_branch: string;
}

/********************************************/
/*             Update interfaces            */
/********************************************/

export interface ProjectUpdate extends ProjectCreate {}
