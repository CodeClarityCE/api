import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsDateString, IsOptional, IsString } from "class-validator";

import { OptionalTransform } from "src/transformers/transformer";

export class DashboardQueryOptions {
  @IsOptional()
  @IsDateString()
  @OptionalTransform((v: unknown) => new Date(v as string))
  startDate?: Date;
  @IsOptional()
  @IsDateString()
  @OptionalTransform((v: unknown) => new Date(v as string))
  endDate?: Date;
  @IsOptional()
  @IsString({ each: true })
  @Transform(
    ({ value }: { value: unknown }) => {
      if (value === undefined || value === null) return undefined;
      return Array.isArray(value) ? (value as string[]) : [value as string];
    },
    { toClassOnly: true },
  )
  integrationIds?: string[];
}

export class GetOverallCIADistQueryOptions extends DashboardQueryOptions {}
export class GetOverallLicenseDistQueryOptions extends DashboardQueryOptions {}

export class CIAImpact {
  @ApiProperty()
  cia!: string;
  @ApiProperty()
  impact!: number;
}
