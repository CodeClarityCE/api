import { ValidationFailed } from "src/types/error.types";

import { IdParamPipe } from "./id-param.pipe";

describe("IdParamPipe", () => {
  const pipe = new IdParamPipe();
  const uuid = "6f1c2a4e-1d2b-4c3a-9e8f-0a1b2c3d4e5f";

  it("passes a uuid project id through", () => {
    expect(pipe.transform(uuid, { type: "param", data: "project_id" })).toBe(
      uuid,
    );
  });

  it("rejects a malformed project id with ValidationFailed", () => {
    expect(() =>
      pipe.transform("not-a-uuid", { type: "param", data: "project_id" }),
    ).toThrow(ValidationFailed);
  });

  it("leaves other route params alone", () => {
    expect(pipe.transform("@self", { type: "param", data: "user_id" })).toBe(
      "@self",
    );
  });

  it("leaves bodies and queries alone", () => {
    expect(pipe.transform("x", { type: "query", data: "org_id" })).toBe("x");
    expect(pipe.transform({ a: 1 }, { type: "body" })).toEqual({ a: 1 });
  });
});
