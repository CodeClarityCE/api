import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

import {
  DatasetLanguage,
  DatasetParams,
  DatasetStats,
  DatasetStatus,
} from "./dataset.entity";

export const DATASET_DEFAULTS = {
  languages: [DatasetLanguage.JAVASCRIPT, DatasetLanguage.TYPESCRIPT],
  pages: 3,
  min_stars: 1000,
  limit: 100,
};

export const DATASET_MAX_LIMIT = 500;
/** The search API never returns more than 1000 results (10 pages of 100) */
export const DATASET_MAX_PAGES = 10;

export class CreateDatasetBody {
  @ApiProperty({ maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiProperty({ description: "GitHub integration whose token is used" })
  @IsUUID()
  integration_id!: string;

  @ApiPropertyOptional({
    description: "Number of qualifying repositories to keep",
    default: DATASET_DEFAULTS.limit,
    maximum: DATASET_MAX_LIMIT,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(DATASET_MAX_LIMIT)
  limit?: number;

  @ApiPropertyOptional({
    enum: DatasetLanguage,
    isArray: true,
    default: DATASET_DEFAULTS.languages,
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsEnum(DatasetLanguage, { each: true })
  languages?: DatasetLanguage[];

  @ApiPropertyOptional({
    description: "Search pages of 100 results fetched per language",
    default: DATASET_DEFAULTS.pages,
    maximum: DATASET_MAX_PAGES,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(DATASET_MAX_PAGES)
  pages?: number;

  @ApiPropertyOptional({ default: DATASET_DEFAULTS.min_stars })
  @IsOptional()
  @IsInt()
  @Min(0)
  min_stars?: number;
}

export interface DatasetSummary {
  id: string;
  name: string;
  status: DatasetStatus;
  params: DatasetParams;
  stats: DatasetStats | null;
  error: string | null;
  entry_count: number;
  integration_id: string | null;
  created_by_name: string | null;
  created_on: Date;
  built_on: Date | null;
}

export interface DatasetEntrySummary {
  id: string;
  rank: number;
  full_name: string;
  owner: string;
  repo: string;
  git_url: string;
  default_branch: string;
  stars: number;
  language: string | null;
  lockfiles: string[];
}
