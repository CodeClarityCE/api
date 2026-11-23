import { applyDecorators, type Type } from "@nestjs/common";
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from "@nestjs/swagger";

import { TypedResponse } from "src/types/apiResponses.types";

export const APIDocTypedResponseDecorator = <DataDto extends Type<unknown>>(
  dataDto: DataDto,
): ReturnType<typeof applyDecorators> =>
  applyDecorators(
    ApiExtraModels(TypedResponse, dataDto),
    ApiOkResponse({
      schema: {
        allOf: [
          { $ref: getSchemaPath(TypedResponse) },
          {
            properties: {
              data: { $ref: getSchemaPath(dataDto) },
            },
          },
          {
            properties: {
              status_code: { type: "number" },
              status_message: { type: "string" },
            },
          },
        ],
      },
    }),
  );

/** Documents a `{ data: DataDto[] }` response. */
export const APIDocTypedManyResponseDecorator = <DataDto extends Type<unknown>>(
  dataDto: DataDto,
): ReturnType<typeof applyDecorators> =>
  applyDecorators(
    ApiExtraModels(TypedResponse, dataDto),
    ApiOkResponse({
      schema: {
        allOf: [
          { $ref: getSchemaPath(TypedResponse) },
          {
            properties: {
              data: { type: "array", items: { $ref: getSchemaPath(dataDto) } },
            },
          },
        ],
      },
    }),
  );
