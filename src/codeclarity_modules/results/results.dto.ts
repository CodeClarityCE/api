import { Transform } from "class-transformer";
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from "class-validator";

/**
 * Query parameters for reading one result of an analysis by plugin type
 */
export class ResultByTypeQuery {
  @IsUUID()
  org_id!: string;

  @IsUUID()
  project_id!: string;

  @IsUUID()
  analysis_id!: string;

  @IsString()
  @IsNotEmpty()
  type!: string;
}

/**
 * Common query parameters for paginated results
 */
class ResultsQueryDto {
  @IsString()
  workspace!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Transform(({ value }) => (value ? parseInt(value as string, 10) : 0), {
    toClassOnly: true,
  })
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Transform(({ value }) => (value ? parseInt(value as string, 10) : 0), {
    toClassOnly: true,
  })
  entries_per_page?: number;

  @IsOptional()
  @IsString()
  sort_by?: string;

  @IsOptional()
  @IsString()
  sort_direction?: string;

  @IsOptional()
  @IsString()
  active_filters?: string;

  @IsOptional()
  @IsString()
  search_key?: string;
}

/**
 * Query parameters for patching results
 * @jsPatching Removed with js-patching (#334).
 */
export class PatchingQueryDto extends ResultsQueryDto {}
