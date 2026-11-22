import { IsNotEmpty, IsString, IsUUID } from "class-validator";

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
