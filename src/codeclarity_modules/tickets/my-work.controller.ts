import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import { ApiErrorDecorator } from "src/decorators/ApiException";
import { APIDocTypedManyResponseDecorator } from "src/decorators/TypedManyResponse";
import { AuthUser } from "src/decorators/UserDecorator";
import { TypedResponse } from "src/types/apiResponses.types";
import {
  InternalError,
  NotAuthenticated,
  NotAuthorized,
} from "src/types/error.types";

import { MyWorkService } from "./my-work.service";
import { MyWorkEntry, MyWorkQuery } from "./my-work.types";

@Controller("org/:org_id/tickets/my-work")
export class MyWorkController {
  constructor(private readonly service: MyWorkService) {}

  @ApiTags("Tickets")
  @ApiErrorDecorator({ statusCode: 401, errors: [NotAuthenticated] })
  @ApiErrorDecorator({ statusCode: 403, errors: [NotAuthorized] })
  @ApiErrorDecorator({ statusCode: 500, errors: [InternalError] })
  @APIDocTypedManyResponseDecorator(MyWorkEntry)
  @Get()
  async myWork(
    @AuthUser() user: AuthenticatedUser,
    @Param("org_id") orgId: string,
    @Query() query: MyWorkQuery,
  ): Promise<TypedResponse<MyWorkEntry[]>> {
    return { data: await this.service.myWork(orgId, user, query.limit) };
  }
}
