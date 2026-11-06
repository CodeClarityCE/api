import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { CreateExperimentBody } from "./experiments.types";

async function errorsOf(body: object): Promise<string[]> {
  const errors = await validate(plainToInstance(CreateExperimentBody, body));
  return errors.map((error) => error.property);
}

const valid = {
  name: "top100-head",
  dataset_id: "8f8b1e2a-6a1c-4d52-9d6b-1d3c3a1d2f4e",
  analyzer_id: "1a2b3c4d-6a1c-4d52-9d6b-1d3c3a1d2f4e",
};

describe("CreateExperimentBody", () => {
  it("accepts a name, a dataset and an analyzer, retries defaulted", async () => {
    await expect(errorsOf(valid)).resolves.toEqual([]);
  });

  it("accepts retries within bounds", async () => {
    await expect(errorsOf({ ...valid, retries: 0 })).resolves.toEqual([]);
    await expect(errorsOf({ ...valid, retries: 10 })).resolves.toEqual([]);
  });

  it.each([
    [{ name: "" }, "name"],
    [{ name: "x".repeat(101) }, "name"],
    [{ dataset_id: "nope" }, "dataset_id"],
    [{ analyzer_id: "nope" }, "analyzer_id"],
    [{ retries: -1 }, "retries"],
    [{ retries: 11 }, "retries"],
    [{ retries: 1.5 }, "retries"],
  ])("rejects %j", async (override, property) => {
    await expect(errorsOf({ ...valid, ...override })).resolves.toEqual([
      property,
    ]);
  });
});
