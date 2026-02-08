import type { GCVE } from "src/codeclarity_modules/knowledge/gcve/gcve.entity";
import type { NVD } from "src/codeclarity_modules/knowledge/nvd/nvd.entity";
import type { OSV } from "src/codeclarity_modules/knowledge/osv/osv.entity";

import {
  buildAffectedVersionsString,
  extractGCVERanges,
  extractNVDRanges,
  extractOSVRanges,
  filterNVDByPackage,
  formatRange,
  formatRangeHuman,
  formatRangesRaw,
  mergeSourceRangeData,
} from "./rangeExtractor";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNVD(affected: unknown): NVD {
  return { affected } as NVD;
}
function makeOSV(affected: unknown): OSV {
  return { affected } as OSV;
}
function makeGCVE(affected: unknown): GCVE {
  return { affected } as GCVE;
}

// ===========================================================================
// NVD extraction
// ===========================================================================

describe("extractNVDRanges", () => {
  it("should extract a simple start+end range", () => {
    const nvd = makeNVD([
      {
        sources: [
          { versionStartIncluding: "1.0.0", versionEndExcluding: "1.5.0" },
        ],
      },
    ]);
    const result = extractNVDRanges(nvd);
    expect(result).toHaveLength(1);
    expect(result[0]!.ranges).toHaveLength(1);
    expect(result[0]!.ranges[0]).toEqual({
      introduced: "1.0.0",
      introducedInclusive: true,
      fixed: "1.5.0",
      fixedInclusive: false,
    });
  });

  it("should extract inclusive end range", () => {
    const nvd = makeNVD([{ sources: [{ versionEndIncluding: "3.0.0" }] }]);
    const result = extractNVDRanges(nvd);
    expect(result[0]!.ranges[0]!.fixedInclusive).toBe(true);
    expect(result[0]!.ranges[0]!.fixed).toBe("3.0.0");
  });

  it("should extract exclusive start range", () => {
    const nvd = makeNVD([
      {
        sources: [
          { versionStartExcluding: "2.0.0", versionEndExcluding: "3.0.0" },
        ],
      },
    ]);
    const result = extractNVDRanges(nvd);
    expect(result[0]!.ranges[0]!.introducedInclusive).toBe(false);
    expect(result[0]!.ranges[0]!.introduced).toBe("2.0.0");
  });

  it("should extract exact version from criteriaDict", () => {
    const nvd = makeNVD([
      { sources: [{ criteriaDict: { version: "4.2.0" } }] },
    ]);
    const result = extractNVDRanges(nvd);
    expect(result[0]!.exactVersions).toEqual(["4.2.0"]);
  });

  it("should mark universal for wildcard version", () => {
    const nvd = makeNVD([{ sources: [{ criteriaDict: { version: "*" } }] }]);
    const result = extractNVDRanges(nvd);
    expect(result[0]!.universal).toBe(true);
  });

  it("should suppress universal when ranges exist", () => {
    const nvd = makeNVD([
      {
        sources: [
          { versionEndExcluding: "7.5.7" },
          { criteriaDict: { version: "*" } },
        ],
      },
    ]);
    const result = extractNVDRanges(nvd);
    expect(result[0]!.universal).toBe(false);
    expect(result[0]!.ranges).toHaveLength(1);
  });

  it("should preserve product and vendor", () => {
    const nvd = makeNVD([
      {
        sources: [
          {
            versionEndExcluding: "1.47.1",
            criteriaDict: {
              product: "visual_studio_code",
              vendor: "microsoft",
            },
          },
        ],
      },
    ]);
    const result = extractNVDRanges(nvd);
    expect(result[0]!.product).toBe("visual_studio_code");
    expect(result[0]!.vendor).toBe("microsoft");
  });

  it("should return empty for null affected", () => {
    expect(extractNVDRanges(makeNVD(null))).toEqual([]);
  });

  // CVE-2020-1416: multiple products
  it("should produce separate entries per NVD affected block", () => {
    const nvd = makeNVD([
      {
        sources: [
          {
            versionStartIncluding: "15.0",
            versionEndExcluding: "15.9.25",
            criteriaDict: { product: "visual_studio", vendor: "microsoft" },
          },
        ],
      },
      {
        sources: [
          {
            versionEndExcluding: "1.47.1",
            criteriaDict: {
              product: "visual_studio_code",
              vendor: "microsoft",
            },
          },
        ],
      },
      {
        sources: [
          {
            criteriaDict: {
              product: "typescript",
              vendor: "microsoft",
              version: "*",
            },
          },
        ],
      },
    ]);
    const result = extractNVDRanges(nvd);
    expect(result).toHaveLength(3);
    expect(result[0]!.product).toBe("visual_studio");
    expect(result[1]!.product).toBe("visual_studio_code");
    expect(result[2]!.product).toBe("typescript");
  });
});

// ===========================================================================
// OSV extraction
// ===========================================================================

describe("extractOSVRanges", () => {
  // CVE-2023-29019: two disjoint ranges
  it("should handle multiple disjoint ranges (Bug 1 fix)", () => {
    const osv = makeOSV([
      {
        package: { name: "@fastify/passport" },
        ranges: [
          {
            events: [
              { introduced: "0" },
              { fixed: "1.1.0" },
              { introduced: "2.0.0" },
              { fixed: "2.3.0" },
            ],
          },
        ],
      },
    ]);
    const result = extractOSVRanges(osv);
    expect(result).toHaveLength(1);
    expect(result[0]!.ranges).toHaveLength(2);

    expect(result[0]!.ranges[0]).toEqual({
      introduced: "0",
      introducedInclusive: true,
      fixed: "1.1.0",
      fixedInclusive: false,
    });
    expect(result[0]!.ranges[1]).toEqual({
      introduced: "2.0.0",
      introducedInclusive: true,
      fixed: "2.3.0",
      fixedInclusive: false,
    });
  });

  it("should preserve introduced:0 (Bug 2 fix)", () => {
    const osv = makeOSV([
      {
        ranges: [{ events: [{ introduced: "0" }, { fixed: "0.7.2" }] }],
      },
    ]);
    const result = extractOSVRanges(osv);
    expect(result[0]!.ranges[0]!.introduced).toBe("0");
  });

  it("should handle last_affected event", () => {
    const osv = makeOSV([
      {
        ranges: [
          { events: [{ introduced: "1.0.0" }, { last_affected: "1.5.0" }] },
        ],
      },
    ]);
    const result = extractOSVRanges(osv);
    expect(result[0]!.ranges[0]).toEqual({
      introduced: "1.0.0",
      introducedInclusive: true,
      fixed: "1.5.0",
      fixedInclusive: true,
    });
  });

  it("should handle open-ended range (no fixed)", () => {
    const osv = makeOSV([
      {
        ranges: [{ events: [{ introduced: "3.0.0" }] }],
      },
    ]);
    const result = extractOSVRanges(osv);
    expect(result[0]!.ranges[0]!.fixed).toBeNull();
  });

  it("should collect specific version lists", () => {
    const osv = makeOSV([{ versions: ["1.0.0", "1.0.1", "v1.0.2"] }]);
    const result = extractOSVRanges(osv);
    expect(result[0]!.exactVersions).toEqual(["1.0.0", "1.0.1", "1.0.2"]);
  });

  it("should extract package name", () => {
    const osv = makeOSV([
      {
        package: { name: "express", ecosystem: "npm" },
        ranges: [{ events: [{ introduced: "0" }, { fixed: "4.17.3" }] }],
      },
    ]);
    const result = extractOSVRanges(osv);
    expect(result[0]!.packageName).toBe("express");
  });

  it("should return empty for null affected", () => {
    expect(extractOSVRanges(makeOSV(null))).toEqual([]);
  });

  it("should handle multiple affected entries", () => {
    const osv = makeOSV([
      {
        package: { name: "pkg-a" },
        ranges: [{ events: [{ introduced: "0" }, { fixed: "1.0.0" }] }],
      },
      {
        package: { name: "pkg-b" },
        ranges: [{ events: [{ introduced: "0" }, { fixed: "2.0.0" }] }],
      },
    ]);
    const result = extractOSVRanges(osv);
    expect(result).toHaveLength(2);
    expect(result[0]!.packageName).toBe("pkg-a");
    expect(result[1]!.packageName).toBe("pkg-b");
  });

  it("should normalize empty string introduced to '0'", () => {
    const osv = makeOSV([
      {
        ranges: [{ events: [{ introduced: "" }, { fixed: "1.0.0" }] }],
      },
    ]);
    const result = extractOSVRanges(osv);
    expect(result[0]!.ranges[0]!.introduced).toBe("0");
  });

  it("should ignore empty string fixed events", () => {
    const osv = makeOSV([
      {
        ranges: [{ events: [{ introduced: "1.0.0" }, { fixed: "" }] }],
      },
    ]);
    const result = extractOSVRanges(osv);
    // empty fixed is ignored, so range stays open-ended
    expect(result[0]!.ranges[0]!.introduced).toBe("1.0.0");
    expect(result[0]!.ranges[0]!.fixed).toBeNull();
  });
});

// ===========================================================================
// GCVE extraction
// ===========================================================================

describe("extractGCVERanges", () => {
  it("should handle lessThan with normal version", () => {
    const gcve = makeGCVE([
      {
        versions: [{ version: "1.0.0", lessThan: "1.5.0", status: "affected" }],
      },
    ]);
    const result = extractGCVERanges(gcve);
    expect(result[0]!.ranges[0]).toEqual({
      introduced: "1.0.0",
      introducedInclusive: true,
      fixed: "1.5.0",
      fixedInclusive: false,
    });
  });

  it("should handle lessThanOrEqual", () => {
    const gcve = makeGCVE([
      {
        versions: [
          { version: "2.0.0", lessThanOrEqual: "2.4.11", status: "affected" },
        ],
      },
    ]);
    const result = extractGCVERanges(gcve);
    expect(result[0]!.ranges[0]!.fixedInclusive).toBe(true);
    expect(result[0]!.ranges[0]!.fixed).toBe("2.4.11");
  });

  it("should normalize embedded '< 7.5.7'", () => {
    const gcve = makeGCVE([
      { versions: [{ version: "< 7.5.7", status: "affected" }] },
    ]);
    const result = extractGCVERanges(gcve);
    expect(result[0]!.ranges[0]!.fixed).toBe("7.5.7");
    expect(result[0]!.ranges[0]!.fixedInclusive).toBe(false);
  });

  it("should normalize embedded '<= 2.4.11'", () => {
    const gcve = makeGCVE([
      { versions: [{ version: "<= 2.4.11", status: "affected" }] },
    ]);
    const result = extractGCVERanges(gcve);
    expect(result[0]!.ranges[0]!.fixed).toBe("2.4.11");
    expect(result[0]!.ranges[0]!.fixedInclusive).toBe(true);
  });

  it("should handle exact affected version", () => {
    const gcve = makeGCVE([
      { versions: [{ version: "3.2.1", status: "affected" }] },
    ]);
    const result = extractGCVERanges(gcve);
    expect(result[0]!.exactVersions).toEqual(["3.2.1"]);
  });

  it("should handle unspecified version as universal", () => {
    const gcve = makeGCVE([
      { versions: [{ version: "unspecified", status: "affected" }] },
    ]);
    const result = extractGCVERanges(gcve);
    expect(result[0]!.universal).toBe(true);
  });

  it("should handle defaultStatus affected", () => {
    const gcve = makeGCVE([{ defaultStatus: "affected" }]);
    const result = extractGCVERanges(gcve);
    expect(result[0]!.universal).toBe(true);
  });

  it("should handle special version '0' as lower bound", () => {
    const gcve = makeGCVE([
      { versions: [{ version: "0", lessThan: "7.5.7", status: "affected" }] },
    ]);
    const result = extractGCVERanges(gcve);
    expect(result[0]!.ranges[0]!.introduced).toBe("0");
  });

  it("should preserve vendor and product", () => {
    const gcve = makeGCVE([
      {
        vendor: "fastify",
        product: "passport",
        versions: [{ version: "0", lessThan: "1.1.0", status: "affected" }],
      },
    ]);
    const result = extractGCVERanges(gcve);
    expect(result[0]!.vendor).toBe("fastify");
    expect(result[0]!.product).toBe("passport");
  });

  it("should return empty for null affected", () => {
    expect(extractGCVERanges(makeGCVE(null))).toEqual([]);
  });

  // CVE-2023-29019: compound version string ">= 2.0.0, < 2.3.0"
  it("should parse compound version string '>= X, < Y'", () => {
    const gcve = makeGCVE([
      {
        vendor: "fastify",
        product: "passport",
        versions: [
          { version: "< 1.1.0", status: "affected" },
          { version: ">= 2.0.0, < 2.3.0", status: "affected" },
        ],
      },
    ]);
    const result = extractGCVERanges(gcve);
    expect(result).toHaveLength(1);
    expect(result[0]!.ranges).toHaveLength(2);

    // First range: < 1.1.0
    expect(result[0]!.ranges[0]).toEqual({
      introduced: "0",
      introducedInclusive: true,
      fixed: "1.1.0",
      fixedInclusive: false,
    });

    // Second range: >= 2.0.0, < 2.3.0
    expect(result[0]!.ranges[1]).toEqual({
      introduced: "2.0.0",
      introducedInclusive: true,
      fixed: "2.3.0",
      fixedInclusive: false,
    });

    // Should NOT produce exact versions
    expect(result[0]!.exactVersions).toEqual([]);
  });

  it("should parse compound version string '>= X, <= Y'", () => {
    const gcve = makeGCVE([
      {
        versions: [{ version: ">= 1.0.0, <= 2.4.11", status: "affected" }],
      },
    ]);
    const result = extractGCVERanges(gcve);
    expect(result[0]!.ranges[0]).toEqual({
      introduced: "1.0.0",
      introducedInclusive: true,
      fixed: "2.4.11",
      fixedInclusive: true,
    });
  });

  it("should parse compound version string '> X, < Y'", () => {
    const gcve = makeGCVE([
      {
        versions: [{ version: "> 1.0.0, < 2.0.0", status: "affected" }],
      },
    ]);
    const result = extractGCVERanges(gcve);
    expect(result[0]!.ranges[0]).toEqual({
      introduced: "1.0.0",
      introducedInclusive: true,
      fixed: "2.0.0",
      fixedInclusive: false,
    });
  });
});

// ===========================================================================
// NVD package filtering
// ===========================================================================

describe("filterNVDByPackage", () => {
  const entries = [
    {
      source: "NVD" as const,
      ranges: [],
      exactVersions: [],
      universal: false,
      product: "visual_studio",
    },
    {
      source: "NVD" as const,
      ranges: [],
      exactVersions: [],
      universal: false,
      product: "visual_studio_code",
    },
    {
      source: "NVD" as const,
      ranges: [],
      exactVersions: [],
      universal: false,
      product: "typescript",
    },
  ];

  it("should filter to matching product (CVE-2020-1416 scenario)", () => {
    const filtered = filterNVDByPackage(entries, "typescript");
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.product).toBe("typescript");
  });

  it("should match scoped npm package", () => {
    const filtered = filterNVDByPackage(
      [
        {
          source: "NVD",
          ranges: [],
          exactVersions: [],
          universal: false,
          product: "passport",
        },
      ],
      "@fastify/passport",
    );
    expect(filtered).toHaveLength(1);
  });

  it("should return all when no product info available", () => {
    const noProducts = [
      {
        source: "NVD" as const,
        ranges: [],
        exactVersions: [],
        universal: false,
      },
      {
        source: "NVD" as const,
        ranges: [],
        exactVersions: [],
        universal: false,
      },
    ];
    expect(filterNVDByPackage(noProducts, "anything")).toEqual(noProducts);
  });

  it("should return all when no package name given", () => {
    expect(filterNVDByPackage(entries, "")).toEqual(entries);
  });

  it("should keep entries without product even when others have it", () => {
    const mixed = [
      {
        source: "NVD" as const,
        ranges: [],
        exactVersions: [],
        universal: false,
        product: "unrelated",
      },
      {
        source: "NVD" as const,
        ranges: [],
        exactVersions: [],
        universal: false,
      },
    ];
    const filtered = filterNVDByPackage(mixed, "my-pkg");
    // Entry without product is kept, unrelated is removed
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.product).toBeUndefined();
  });
});

// ===========================================================================
// Formatting
// ===========================================================================

describe("formatRange", () => {
  it("should format inclusive start, exclusive end", () => {
    expect(
      formatRange({
        introduced: "1.0.0",
        introducedInclusive: true,
        fixed: "2.0.0",
        fixedInclusive: false,
      }),
    ).toBe(">=1.0.0 <2.0.0");
  });

  it("should format exclusive start, inclusive end", () => {
    expect(
      formatRange({
        introduced: "1.0.0",
        introducedInclusive: false,
        fixed: "2.0.0",
        fixedInclusive: true,
      }),
    ).toBe(">1.0.0 <=2.0.0");
  });

  it("should omit lower bound when introduced is 0", () => {
    expect(
      formatRange({
        introduced: "0",
        introducedInclusive: true,
        fixed: "1.5.0",
        fixedInclusive: false,
      }),
    ).toBe("<1.5.0");
  });

  it("should return * for fully open range", () => {
    expect(
      formatRange({
        introduced: null,
        introducedInclusive: true,
        fixed: null,
        fixedInclusive: false,
      }),
    ).toBe("*");
  });

  it("should treat empty string introduced as no lower bound", () => {
    expect(
      formatRange({
        introduced: "",
        introducedInclusive: true,
        fixed: "1.5.0",
        fixedInclusive: false,
      }),
    ).toBe("<1.5.0");
  });

  it("should treat empty string fixed as no upper bound", () => {
    expect(
      formatRange({
        introduced: "1.0.0",
        introducedInclusive: true,
        fixed: "",
        fixedInclusive: false,
      }),
    ).toBe(">=1.0.0");
  });

  it("should return * for both empty strings", () => {
    expect(
      formatRange({
        introduced: "",
        introducedInclusive: true,
        fixed: "",
        fixedInclusive: false,
      }),
    ).toBe("*");
  });
});

describe("formatRangeHuman", () => {
  it("should produce human-readable range", () => {
    expect(
      formatRangeHuman({
        introduced: "1.0.0",
        introducedInclusive: true,
        fixed: "2.0.0",
        fixedInclusive: false,
      }),
    ).toBe("1.0.0 up to (but not including) 2.0.0");
  });

  it("should handle introduced:0 as 'all versions'", () => {
    expect(
      formatRangeHuman({
        introduced: "0",
        introducedInclusive: true,
        fixed: "1.5.0",
        fixedInclusive: false,
      }),
    ).toBe("all versions up to (but not including) 1.5.0");
  });

  it("should handle inclusive end", () => {
    expect(
      formatRangeHuman({
        introduced: "1.0.0",
        introducedInclusive: true,
        fixed: "2.0.0",
        fixedInclusive: true,
      }),
    ).toBe("1.0.0 up to 2.0.0 (inclusive)");
  });

  it("should handle open-ended range", () => {
    expect(
      formatRangeHuman({
        introduced: "3.0.0",
        introducedInclusive: true,
        fixed: null,
        fixedInclusive: false,
      }),
    ).toBe("3.0.0 and later");
  });
});

describe("formatRangesRaw", () => {
  it("should format range data with deduplication", () => {
    const data = {
      source: "OSV" as const,
      ranges: [
        {
          introduced: "0",
          introducedInclusive: true,
          fixed: "1.1.0",
          fixedInclusive: false,
        },
        {
          introduced: "2.0.0",
          introducedInclusive: true,
          fixed: "2.3.0",
          fixedInclusive: false,
        },
      ],
      exactVersions: [],
      universal: false,
    };
    expect(formatRangesRaw(data)).toBe("<1.1.0\n>=2.0.0 <2.3.0");
  });
});

describe("buildAffectedVersionsString", () => {
  it("should combine ranges and exact versions", () => {
    const entries = [
      {
        source: "OSV" as const,
        ranges: [
          {
            introduced: "0",
            introducedInclusive: true,
            fixed: "1.1.0",
            fixedInclusive: false,
          },
        ],
        exactVersions: ["3.2.1"],
        universal: false,
      },
    ];
    const result = buildAffectedVersionsString(entries);
    expect(result).toContain("all versions up to (but not including) 1.1.0");
    expect(result).toContain("exactly 3.2.1");
  });
});

describe("mergeSourceRangeData", () => {
  it("should merge multiple entries into one", () => {
    const entries = [
      {
        source: "NVD" as const,
        ranges: [
          {
            introduced: "1.0.0",
            introducedInclusive: true,
            fixed: "2.0.0",
            fixedInclusive: false,
          },
        ],
        exactVersions: [],
        universal: false,
      },
      {
        source: "NVD" as const,
        ranges: [
          {
            introduced: "3.0.0",
            introducedInclusive: true,
            fixed: "4.0.0",
            fixedInclusive: false,
          },
        ],
        exactVersions: ["5.0.0"],
        universal: false,
      },
    ];
    const merged = mergeSourceRangeData(entries);
    expect(merged).not.toBeNull();
    expect(merged!.ranges).toHaveLength(2);
    expect(merged!.exactVersions).toEqual(["5.0.0"]);
  });

  it("should return null for empty array", () => {
    expect(mergeSourceRangeData([])).toBeNull();
  });
});
