import {
  type ArgumentMetadata,
  type Type,
  ValidationPipe,
} from "@nestjs/common";

/** ValidationPipe that also refuses a missing or null body for a class with validation rules. */
export class BodyValidationPipe extends ValidationPipe {
  override async transform(
    value: unknown,
    metadata: ArgumentMetadata,
  ): Promise<unknown> {
    const result: unknown = await super.transform(value, metadata);
    const metatype = metadata.metatype as Type<unknown> | undefined;
    if (
      metadata.type === "body" &&
      (result === null || result === undefined) &&
      metatype !== undefined &&
      this.toValidate(metadata) &&
      (await this.hasValidationRules(metatype))
    ) {
      throw await this.exceptionFactory([
        {
          property: metadata.data ?? metadata.type,
          constraints: {
            isObject: "Validation failed (object is expected)",
          },
          children: [],
        },
      ]);
    }
    return result;
  }
}
