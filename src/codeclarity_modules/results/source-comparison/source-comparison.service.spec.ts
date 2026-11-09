import { AuthenticatedUser, ROLE } from "src/base_modules/auth/auth.types";
import type { SourceOriginService } from "src/codeclarity_modules/knowledge/comparison/source-origin.service";
import { UnknownWorkspace } from "src/types/error.types";

import type { AnalysisResultsService } from "../results.service";
import type { VulnerabilitiesUtilsService } from "../vulnerabilities/utils/utils.service";

import { SourceComparisonService } from "./source-comparison.service";

const user = new AuthenticatedUser("user-1", [ROLE.USER], true);

const healthy = (source: string) => ({
  source,
  status: "healthy",
  comparable: true,
});

const instance = (id: string, records: [string, string][]) => ({
  VulnerabilityId: id,
  AffectedDependency: "lodash",
  AffectedVersion: "1.0.0",
  SourceMatches: records.map(([source, record_id], i) => ({
    source,
    record_id,
    winning: i === 0,
    affected: { ranges: [], exact: [], universal: false },
    evidence: "VULNERABLE_EVIDENCE_RANGE",
    severity: null,
  })),
});

function serviceWith(origins: Record<string, string>) {
  const checkAccess = jest.fn().mockResolvedValue(undefined);
  const originsOf = jest
    .fn()
    .mockResolvedValue(new Map(Object.entries(origins)));
  const output = {
    analysis_info: {
      status: "success",
      knowledge_snapshot: {
        taken_at: "2026-11-09T12:00:00Z",
        sources: ["osv", "friends_of_php", "gcve", "nvd"].map(healthy),
      },
    },
    workspaces: {
      default: {
        Vulnerabilities: [
          instance("CVE-2024-1", [
            ["osv", "GHSA-1"],
            ["nvd", "CVE-2024-1"],
          ]),
        ],
      },
      other: {
        Vulnerabilities: [
          instance("CVE-2024-2", [
            ["gcve", "GCVE-0-2024-2"],
            ["nvd", "CVE-2024-2"],
          ]),
        ],
      },
    },
  };
  const service = new SourceComparisonService(
    { checkAccess } as unknown as AnalysisResultsService,
    {
      getVulnsResult: jest.fn().mockResolvedValue(output),
    } as unknown as VulnerabilitiesUtilsService,
    { originsOf } as unknown as SourceOriginService,
  );
  return { service, checkAccess };
}

describe("SourceComparisonService", () => {
  it("checks access and compares one workspace using the origins stored in the knowledge DB", async () => {
    const { service, checkAccess } = serviceWith({
      "osv:GHSA-1": "ghsa",
      "nvd:CVE-2024-1": "cve-list",
    });

    const result = await service.compare("org", "proj", "an", user, "default");

    expect(checkAccess).toHaveBeenCalledWith("org", "proj", "an", user);
    expect(result.overlap).toEqual([
      expect.objectContaining({
        sources: ["nvd", "osv"],
        instances: 1,
        corroborating: 1,
      }),
    ]);
  });

  it("compares every workspace when none is named", async () => {
    const { service } = serviceWith({
      "gcve:GCVE-0-2024-2": "cve-list",
      "nvd:CVE-2024-2": "cve-list",
    });

    const result = await service.compare("org", "proj", "an", user);

    expect(result.instances.compared).toBe(2);
    expect(
      result.overlap.find((o) => o.sources.join() === "gcve,nvd"),
    ).toMatchObject({ same_origin: 1 });
  });

  it("rejects an unknown workspace", async () => {
    const { service } = serviceWith({});

    await expect(
      service.compare("org", "proj", "an", user, "missing"),
    ).rejects.toBeInstanceOf(UnknownWorkspace);
  });
});
