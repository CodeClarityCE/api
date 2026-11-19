import { SeverityType } from "../vulnerabilities.types";

import { computeVulnerabilityStats, type StatsFinding } from "./stats";

const finding = (
  id: string,
  dependency: string,
  score: number,
  extra: Partial<StatsFinding> = {},
): StatsFinding => ({
  VulnerabilityId: id,
  AffectedDependency: dependency,
  AffectedVersion: "1.0.0",
  Severity: {
    Severity: score,
    ConfidentialityImpact: "NONE",
    IntegrityImpact: "NONE",
    AvailabilityImpact: "NONE",
  },
  ...extra,
});

describe("computeVulnerabilityStats", () => {
  it("buckets a vulnerability by the worst severity among its instances, like its card", () => {
    const stats = computeVulnerabilityStats(
      [finding("CVE-1", "a", 5.0), finding("CVE-1", "b", 9.8)],
      {},
    );

    expect(stats.number_of_critical).toBe(1);
    expect(stats.number_of_medium).toBe(0);
    expect(stats.graded_number_of_critical).toBe(1);
  });

  it("ranks a GHSA label above a lower CVSS score", () => {
    const ghsaHigh = finding("CVE-1", "b", 0, {
      Severity: {
        Severity: 0,
        SeverityClass: "HIGH",
        SeverityType: SeverityType.Ghsa,
        ConfidentialityImpact: "NONE",
        IntegrityImpact: "NONE",
        AvailabilityImpact: "NONE",
      },
    });

    const stats = computeVulnerabilityStats(
      [finding("CVE-1", "a", 5.0), ghsaHigh],
      {},
    );

    expect(stats.number_of_high).toBe(1);
    expect(stats.number_of_medium).toBe(0);
  });

  it("grades a vulnerability by its worst instance that is not disputed", () => {
    const stats = computeVulnerabilityStats(
      [
        finding("CVE-1", "a", 9.8, { Disputed: true }),
        finding("CVE-1", "b", 7.5),
      ],
      {},
    );

    expect(stats.graded_number_of_critical).toBe(0);
    expect(stats.graded_number_of_high).toBe(1);
  });
});
