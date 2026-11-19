import { differentOrigins, SourceOrigin, sourceOrigin } from "./source-origin";

describe("source origin", () => {
  it("puts OSV in its own origin and NVD and GCVE in the CVE List", () => {
    expect(sourceOrigin("osv")).toBe(SourceOrigin.Osv);
    expect(sourceOrigin("nvd")).toBe(SourceOrigin.CveList);
    expect(sourceOrigin("gcve")).toBe(SourceOrigin.CveList);
  });

  it("accepts the upper-case source names the results also use", () => {
    expect(sourceOrigin("NVD")).toBe(SourceOrigin.CveList);
  });

  it("says NVD and GCVE share an origin and OSV does not", () => {
    expect(differentOrigins("nvd", "gcve")).toBe(false);
    expect(differentOrigins("osv", "gcve")).toBe(true);
    expect(differentOrigins("nvd", "osv")).toBe(true);
  });

  it("never treats an unknown source as a different origin", () => {
    expect(sourceOrigin("friends_of_php")).toBeUndefined();
    expect(differentOrigins("osv", "friends_of_php")).toBe(false);
  });
});
