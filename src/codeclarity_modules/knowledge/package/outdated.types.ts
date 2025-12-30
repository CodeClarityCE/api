import { ApiProperty } from "@nestjs/swagger";
import { Expose, Type } from "class-transformer";
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from "class-validator";

/********************************************/
/*                   Enums                  */
/********************************************/

export enum PackageEcosystem {
  NPM = "npm",
  PACKAGIST = "packagist",
}

/********************************************/
/*             HTTP Post bodies             */
/********************************************/

export class PackageVersionRequestItem {
  @IsNotEmpty()
  @IsString()
  @ApiProperty({
    description: "Package name",
    example: "lodash",
  })
  name!: string;

  @IsNotEmpty()
  @IsString()
  @ApiProperty({
    description: "Current installed version",
    example: "4.17.0",
  })
  currentVersion!: string;

  @IsNotEmpty()
  @IsEnum(PackageEcosystem)
  @ApiProperty({
    description: "Package ecosystem",
    enum: PackageEcosystem,
    example: "npm",
  })
  ecosystem!: PackageEcosystem;
}

export class OutdatedCheckRequestBody {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PackageVersionRequestItem)
  @ApiProperty({
    description: "Array of packages to check",
    type: [PackageVersionRequestItem],
  })
  packages!: PackageVersionRequestItem[];
}

/********************************************/
/*             Response types               */
/********************************************/

export class PackageVersionResult {
  @ApiProperty({
    description: "Package name",
    example: "lodash",
  })
  @Expose()
  name!: string;

  @ApiProperty({
    description: "Current installed version",
    example: "4.17.0",
  })
  @Expose()
  currentVersion!: string;

  @ApiProperty({
    description: "Latest available version (null if package not found)",
    example: "4.17.21",
    nullable: true,
  })
  @Expose()
  latestVersion!: string | null;

  @ApiProperty({
    description: "Whether the package is outdated",
    example: true,
  })
  @Expose()
  isOutdated!: boolean;

  @ApiProperty({
    description: "Package ecosystem",
    enum: PackageEcosystem,
    example: "npm",
  })
  @Expose()
  ecosystem!: PackageEcosystem;
}

export class OutdatedCheckResponse {
  @ApiProperty({
    description: "Array of package check results",
    type: [PackageVersionResult],
  })
  @Expose()
  packages!: PackageVersionResult[];

  @ApiProperty({
    description: "Timestamp when the check was performed",
    example: "2024-01-15T10:30:00.000Z",
  })
  @Expose()
  checkedAt!: string;
}
