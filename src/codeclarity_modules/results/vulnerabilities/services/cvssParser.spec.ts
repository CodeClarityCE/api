import { ghsaSeverityClass } from "./cvssParser";

describe("ghsaSeverityClass", () => {
  it.each([
    ["LOW", "LOW"],
    ["MODERATE", "MEDIUM"],
    ["moderate", "MEDIUM"],
    ["HIGH", "HIGH"],
    ["CRITICAL", "CRITICAL"],
  ])("reads the GHSA label %s as %s", (label, expected) => {
    expect(ghsaSeverityClass({ severity: label })).toBe(expected);
  });

  it.each([{ severity: "UNKNOWN" }, { severity: 3 }, {}, null, undefined])(
    "has no class for %p",
    (databaseSpecific) => {
      expect(ghsaSeverityClass(databaseSpecific)).toBeUndefined();
    },
  );
});
