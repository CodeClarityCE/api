import { Transform } from "class-transformer";
import { IsInt, IsOptional, IsString, Min } from "class-validator";

/**
 * Path parameters for analysis-related endpoints
 */
export class AnalysisParamsDto {
  @IsString()
  org_id!: string;

  @IsString()
  project_id!: string;

  @IsString()
  analysis_id!: string;
}

/**
 * Common query parameters for paginated results
 */
export class ResultsQueryDto {
  @IsString()
  workspace!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Transform(({ value }) => (value ? parseInt(value as string, 10) : 0))
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Transform(({ value }) => (value ? parseInt(value as string, 10) : 0))
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
 * Query parameters for SBOM results (extends common with ecosystem_filter)
 */
export class SbomQueryDto extends ResultsQueryDto {
  @IsOptional()
  @IsString()
  ecosystem_filter?: string;
}

/**
 * Query parameters for licenses results
 */
export class LicensesQueryDto extends ResultsQueryDto {
  @IsOptional()
  @IsString()
  ecosystem_filter?: string;
}

/**
 * Query parameters for patching results
 */
export class PatchingQueryDto extends ResultsQueryDto {}

/**
 * Helper to convert query DTO to service parameters
 */
export function getQueryParams(query: ResultsQueryDto): {
  page: number;
  entriesPerPage: number;
  sortBy: string | undefined;
  sortDirection: string | undefined;
  activeFilters: string | undefined;
  searchKey: string | undefined;
} {
  return {
    page: query.page ?? -1,
    entriesPerPage: query.entries_per_page ?? -1,
    sortBy: query.sort_by,
    sortDirection: query.sort_direction,
    activeFilters: query.active_filters,
    searchKey: query.search_key,
  };
}
