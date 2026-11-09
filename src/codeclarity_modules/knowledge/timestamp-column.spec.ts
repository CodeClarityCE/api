import { timestampAsIso } from "./timestamp-column";

describe("timestampAsIso", () => {
  it("reads a stored date as an ISO string", () => {
    expect(timestampAsIso.from(new Date("2019-12-20T02:08:50Z"))).toBe(
      "2019-12-20T02:08:50.000Z",
    );
  });

  it("reads an unset date as null", () => {
    expect(timestampAsIso.from(null)).toBeNull();
  });

  it("writes the value unchanged", () => {
    expect(timestampAsIso.to("2019-12-20T02:08:50Z")).toBe(
      "2019-12-20T02:08:50Z",
    );
  });
});
