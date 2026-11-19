import type { SourceVerdict } from "src/codeclarity_modules/results/source-comparison/source-match.types";

import { instanceStatus } from "./instance-status";
import cases from "./instance-status.cases.json";

// The same cases drive the Go copy of this rule in vuln-finder.
interface StatusCase {
  name: string;
  verdicts?: SourceVerdict[];
  hidden: string | null;
  contradicted_by: string[];
}

describe("instance status", () => {
  it.each(cases as StatusCase[])("$name", (c) => {
    expect(instanceStatus(c.verdicts)).toEqual({
      hidden: c.hidden,
      contradicted_by: c.contradicted_by,
    });
  });

  it("reads the upper-case source names some results use", () => {
    expect(
      instanceStatus([
        { source: "GCVE", verdict: "matched" },
        { source: "OSV", verdict: "version_excluded" },
      ] as SourceVerdict[]),
    ).toEqual({ hidden: "contradicted", contradicted_by: ["osv"] });
  });
});
