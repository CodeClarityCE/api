import { applyDecorators } from "@nestjs/common";
import { ApiExtraModels, ApiResponse, getSchemaPath } from "@nestjs/swagger";

import { NoDataResponse, Status } from "src/types/apiResponses.types";

export const APIDocNoDataResponseDecorator = (
  statusCode = 200,
): ReturnType<typeof applyDecorators> =>
  applyDecorators(
    ApiExtraModels(NoDataResponse),
    ApiResponse({
      status: statusCode,
      schema: {
        allOf: [
          { $ref: getSchemaPath(NoDataResponse) },
          {
            example: {
              status_code: statusCode,
              status_message: Status.Success,
            },
            properties: {
              status_code: { type: "number" },
              status_message: { type: "string" },
            },
          },
        ],
      },
    }),
  );
