import {
  type ArgumentMetadata,
  type Type,
  ValidationPipe,
} from "@nestjs/common";

/**
 * The global ValidationPipe, also refusing a missing or `null` body where a
 * validated object is expected. The stock pipe validates an empty stand-in
 * and then hands the handler the `null` or `undefined` it came with.
 */
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
