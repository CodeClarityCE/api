import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";

import { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import { AuthUser } from "src/decorators/UserDecorator";
import { TypedResponse } from "src/types/apiResponses.types";

import { KnowledgeProvenance, ProvenanceService } from "./provenance.service";

@ApiTags("Knowledge - Provenance")
@Controller("knowledge/provenance")
export class ProvenanceController {
  constructor(private readonly provenanceService: ProvenanceService) {}

  @Get()
  @ApiOperation({
    summary: "Get knowledge database provenance",
    description:
      "Returns the last-update timestamp of each knowledge source and the number of EPSS rows, identifying the vulnerability-data snapshot currently in use.",
  })
  @ApiResponse({
    status: 200,
    description: "Knowledge database provenance",
    schema: {
      type: "object",
      properties: {
        data: {
          type: "object",
          properties: {
            knowledge_sources: {
              type: "object",
              additionalProperties: { type: "string", nullable: true },
              description:
                "Last-update timestamp (ISO) per knowledge source, or null if never updated",
            },
            epss_rows: {
              type: "number",
              description: "Number of rows in the EPSS table",
            },
          },
        },
      },
    },
  })
  async get(
    @AuthUser() _user: AuthenticatedUser,
  ): Promise<TypedResponse<KnowledgeProvenance>> {
    return { data: await this.provenanceService.get() };
  }
}
