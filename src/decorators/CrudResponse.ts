import { applyDecorators } from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiExtraModels,
  getSchemaPath,
} from "@nestjs/swagger";
import { CreatedResponse, Status } from "src/types/apiResponses.types";

export const APIDocCreatedResponseDecorator = (): ReturnType<
  typeof applyDecorators
> =>
  applyDecorators(
    ApiExtraModels(CreatedResponse),
    ApiCreatedResponse({
      schema: {
        allOf: [
          { $ref: getSchemaPath(CreatedResponse) },
          {
            example: {
              id: "72305504",
              status_code: 201,
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
