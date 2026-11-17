import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiOperation } from "@nestjs/swagger";

import { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import { AuthUser } from "src/decorators/UserDecorator";
import { Response } from "src/types/apiResponses.types";

import { PatchingService } from "./patching.service";

@Controller("/org/:org_id/projects/:project_id/analysis")
export class PatchingController {
  constructor(private readonly patchingService: PatchingService) {}

  @ApiOperation({
    summary: "Patches of a workspace",
    description:
      "Every direct dependency's patch in the workspace, production and development. Not paginated, sorted or filtered.",
  })
  @Get(":analysis_id/patching")
  async getPatches(
    @Param("org_id") org_id: string,
    @Param("project_id") project_id: string,
    @Param("analysis_id") analysis_id: string,
    @AuthUser() user: AuthenticatedUser,
    @Query("workspace") workspace: string,
  ): Promise<Response> {
    return {
      data: await this.patchingService.getPatches(
        org_id,
        project_id,
        analysis_id,
        user,
        { workspace },
      ),
    };
  }

  @Get(":analysis_id/patching/manifest")
  async getPatchedManifest(
    @Param("org_id") org_id: string,
    @Param("project_id") project_id: string,
    @Param("analysis_id") analysis_id: string,
    @AuthUser() user: AuthenticatedUser,
    @Query("workspace") workspace: string,
  ): Promise<Response> {
    return {
      data: await this.patchingService.getPatchedManifest(
        org_id,
        project_id,
        analysis_id,
        user,
        workspace,
      ),
    };
  }

  @Get(":analysis_id/patching/stats")
  async getStats(
    @Param("org_id") org_id: string,
    @Param("project_id") project_id: string,
    @Param("analysis_id") analysis_id: string,
    @AuthUser() user: AuthenticatedUser,
    @Query("workspace") workspace: string,
  ): Promise<Response> {
    return {
      data: await this.patchingService.getStats(
        org_id,
        project_id,
        analysis_id,
        user,
        workspace,
      ),
    };
  }
}
