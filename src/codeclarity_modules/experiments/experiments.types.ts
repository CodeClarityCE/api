import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

import { AnalyzerStepSnapshot, ExperimentStatus } from "./experiment.entity";
import { ExperimentRunStatus } from "./experiment-run.entity";

export const EXPERIMENT_DEFAULT_RETRIES = 2;
export const EXPERIMENT_MAX_RETRIES = 10;

export const SBOM_PLUGIN = "js-sbom";
export const VULN_PLUGIN = "vuln-finder";
/** Plugins whose results an experiment copies; the analyzer must run both */
export const EXPERIMENT_REQUIRED_PLUGINS = [SBOM_PLUGIN, VULN_PLUGIN];

export class CreateExperimentBody {
  @ApiProperty({ maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiProperty({ description: "A READY dataset of the organization" })
  @IsUUID()
  dataset_id!: string;

  @ApiProperty({ description: "Analyzer running js-sbom and vuln-finder" })
  @IsUUID()
  analyzer_id!: string;

  @ApiPropertyOptional({
    description: "Retries of a failed run on the same pinned SHA",
    default: EXPERIMENT_DEFAULT_RETRIES,
    maximum: EXPERIMENT_MAX_RETRIES,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(EXPERIMENT_MAX_RETRIES)
  retries?: number;
}

export type ExperimentRunCounts = Record<ExperimentRunStatus, number>;

export interface ExperimentSummary {
  id: string;
  name: string;
  status: ExperimentStatus;
  retries: number;
  error: string | null;
  dataset_id: string | null;
  dataset_name: string | null;
  analyzer_id: string | null;
  analyzer_name: string | null;
  analyzer_steps: AnalyzerStepSnapshot[][] | null;
  created_by_name: string | null;
  created_on: Date;
  started_on: Date | null;
  ended_on: Date | null;
  run_count: number;
  run_counts: ExperimentRunCounts;
}

export interface ExperimentRunSummary {
  id: string;
  status: ExperimentRunStatus;
  error: string | null;
  attempts: number;
  branch: string | null;
  commit_hash: string | null;
  committed_at: Date | null;
  submitted_on: Date | null;
  ended_on: Date | null;
  analysis_id: string | null;
  project_id: string | null;
  entry: {
    id: string;
    rank: number;
    full_name: string;
    git_url: string;
    stars: number;
  };
}
