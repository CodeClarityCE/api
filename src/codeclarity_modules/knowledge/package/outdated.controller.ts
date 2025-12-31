import { Body, Controller, Post } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";

import { NonAuthEndpoint } from "src/decorators/SkipAuthDecorator";

import { OutdatedCheckService } from "./outdated.service";
import {
  OutdatedCheckRequestBody,
  OutdatedCheckResponse,
} from "./outdated.types";

@ApiTags("Knowledge - Packages")
@Controller("knowledge/packages")
export class OutdatedController {
  constructor(private readonly outdatedCheckService: OutdatedCheckService) {}

  @Post("check-outdated")
  @NonAuthEndpoint()
  @ApiOperation({
    summary: "Check multiple packages for newer versions",
    description:
      "Batch check packages against the knowledge database to determine if newer versions are available. Supports npm and packagist ecosystems.",
  })
  @ApiBody({
    type: OutdatedCheckRequestBody,
    description: "Array of packages to check for updates",
    examples: {
      npm: {
        summary: "NPM packages",
        value: {
          packages: [
            { name: "lodash", currentVersion: "4.17.0", ecosystem: "npm" },
            { name: "express", currentVersion: "4.18.0", ecosystem: "npm" },
          ],
        },
      },
      packagist: {
        summary: "Packagist packages",
        value: {
          packages: [
            {
              name: "laravel/framework",
              currentVersion: "10.0.0",
              ecosystem: "packagist",
            },
            {
              name: "symfony/console",
              currentVersion: "6.0.0",
              ecosystem: "packagist",
            },
          ],
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: "Package version check results",
    type: OutdatedCheckResponse,
  })
  @ApiResponse({
    status: 400,
    description: "Bad request - invalid request body",
  })
  async checkOutdated(
    @Body() request: OutdatedCheckRequestBody,
  ): Promise<OutdatedCheckResponse> {
    return await this.outdatedCheckService.checkOutdated(request);
  }
}
