import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { CreateDatasetBody } from "./datasets.types";

async function errorsOf(body: object): Promise<string[]> {
  const errors = await validate(plainToInstance(CreateDatasetBody, body));
  return errors.map((error) => error.property);
}

const valid = {
  name: "top100",
  integration_id: "8f8b1e2a-6a1c-4d52-9d6b-1d3c3a1d2f4e",
};

describe("CreateDatasetBody", () => {
  it("accepts a name and an integration, everything else defaulted", async () => {
    await expect(errorsOf(valid)).resolves.toEqual([]);
  });

  it("accepts every parameter within bounds", async () => {
    await expect(
      errorsOf({
        ...valid,
        limit: 500,
        pages: 10,
        min_stars: 0,
        languages: ["JavaScript", "TypeScript"],
      }),
    ).resolves.toEqual([]);
  });

  it.each([
    [{ name: "" }, "name"],
    [{ name: "x".repeat(101) }, "name"],
    [{ integration_id: "not-a-uuid" }, "integration_id"],
    [{ limit: 0 }, "limit"],
    [{ limit: 501 }, "limit"],
    [{ limit: 2.5 }, "limit"],
    [{ pages: 11 }, "pages"],
    [{ min_stars: -1 }, "min_stars"],
    [{ languages: [] }, "languages"],
    [{ languages: ["PHP"] }, "languages"],
    [{ languages: ["JavaScript", "JavaScript"] }, "languages"],
  ])("rejects %j", async (override, property) => {
    await expect(errorsOf({ ...valid, ...override })).resolves.toEqual([
      property,
    ]);
  });
});
