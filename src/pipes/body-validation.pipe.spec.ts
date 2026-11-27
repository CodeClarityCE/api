import type { ArgumentMetadata } from "@nestjs/common";
import { IsOptional, IsString } from "class-validator";

import { ValidationFailed } from "../types/error.types";

import { BodyValidationPipe } from "./body-validation.pipe";

class OptionalFieldsBody {
  @IsOptional()
  @IsString()
  name?: string;
}

class UnvalidatedBody {
  name?: string;
}

const pipe = new BodyValidationPipe({
  exceptionFactory: (errors) => new ValidationFailed(errors),
});

function body(metatype: ArgumentMetadata["metatype"]): ArgumentMetadata {
  return { type: "body", metatype };
}

describe("BodyValidationPipe", () => {
  it.each([null, undefined])(
    "refuses a body of %s where a validated object is expected",
    async (value) => {
      await expect(
        pipe.transform(value, body(OptionalFieldsBody)),
      ).rejects.toBeInstanceOf(ValidationFailed);
    },
  );

  it("passes an empty object through", async () => {
    await expect(pipe.transform({}, body(OptionalFieldsBody))).resolves.toEqual(
      {},
    );
  });

  it("leaves a missing body alone when the class has no validation rules", async () => {
    await expect(
      pipe.transform(undefined, body(UnvalidatedBody)),
    ).resolves.toBeUndefined();
  });

  it("leaves a missing query or param value alone", async () => {
    await expect(
      pipe.transform(undefined, {
        type: "query",
        metatype: OptionalFieldsBody,
      }),
    ).resolves.toBeUndefined();
  });
});
