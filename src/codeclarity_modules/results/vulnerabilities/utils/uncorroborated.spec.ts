import {
  type SourceVerdict,
  SourceVerdictValue as V,
} from "src/codeclarity_modules/results/source-comparison/source-match.types";

import { isUncorroborated } from "./uncorroborated";

function verdicts(osv: V, nvd: V, gcve: V): SourceVerdict[] {
  return [
    { source: "osv", verdict: osv },
    { source: "nvd", verdict: nvd },
    { source: "gcve", verdict: gcve },
  ];
}

describe("uncorroborated vulnerability instance", () => {
  it("labels a GCVE-only match whose advisory has no package data", () => {
    expect(
      isUncorroborated(verdicts(V.NoPackageData, V.NoRecord, V.Matched)),
    ).toBe(true);
  });

  it("counts an NVD and GCVE pair with no OSV record as one origin", () => {
    expect(isUncorroborated(verdicts(V.NoRecord, V.Matched, V.Matched))).toBe(
      true,
    );
  });

  it("labels an OSV-only match when the CVE List sources are stale or have no record", () => {
    expect(
      isUncorroborated(verdicts(V.Matched, V.StaleOrFailed, V.NoRecord)),
    ).toBe(true);
  });

  it("does not label a match corroborated by another origin", () => {
    expect(isUncorroborated(verdicts(V.Matched, V.NoRecord, V.Matched))).toBe(
      false,
    );
  });

  it.each([V.VersionExcluded, V.NamesAnotherProduct, V.Retired])(
    "does not label a match when another origin's record is %s",
    (other) => {
      expect(isUncorroborated(verdicts(other, V.NoRecord, V.Matched))).toBe(
        false,
      );
    },
  );

  it("ignores a same-origin source that excludes the version", () => {
    expect(
      isUncorroborated(verdicts(V.NoRecord, V.VersionExcluded, V.Matched)),
    ).toBe(true);
  });

  it("does not label an instance no source matched", () => {
    expect(isUncorroborated(verdicts(V.NoRecord, V.NoRecord, V.Retired))).toBe(
      false,
    );
  });

  it("leaves an older analysis without verdicts unlabelled", () => {
    expect(isUncorroborated(undefined)).toBe(false);
  });
});
