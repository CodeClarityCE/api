import type { SourceRangeData } from "./types";
import {
  buildSourceVerdict,
  checkVersionAgainstSource,
  cleanVersion,
} from "./versionChecker";

// ---------------------------------------------------------------------------
// cleanVersion
// ---------------------------------------------------------------------------

describe("cleanVersion", () => {
  it("should pass through valid semver", () => {
    expect(cleanVersion("1.2.3")).toBe("1.2.3");
  });

  it("should strip leading v", () => {
    expect(cleanVersion("v1.2.3")).toBe("1.2.3");
  });

  it("should coerce partial versions", () => {
    expect(cleanVersion("1.2")).toBe("1.2.0");
    expect(cleanVersion("1")).toBe("1.0.0");
  });

  it("should handle pre-release tags", () => {
    expect(cleanVersion("1.2.3-alpha.1")).toBe("1.2.3-alpha.1");
  });

  it("should return null for garbage", () => {
    expect(cleanVersion("not-a-version")).toBeNull();
    expect(cleanVersion("")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// checkVersionAgainstSource — range boundary checks
// ---------------------------------------------------------------------------

describe("checkVersionAgainstSource", () => {
  function makeSource(
    overrides: Partial<SourceRangeData> = {},
  ): SourceRangeData {
    return {
      source: "OSV",
      ranges: [],
      exactVersions: [],
      universal: false,
      ...overrides,
    };
  }

  describe("exact version matching", () => {
    it("should match an exact listed version", () => {
      const result = checkVersionAgainstSource(
        "1.0.0",
        makeSource({ exactVersions: ["1.0.0", "1.0.1"] }),
      );
      expect(result.affected).toBe(true);
      expect(result.definitive).toBe(true);
      expect(result.reason).toContain("explicitly listed");
    });

    it("should not match a version not in the list", () => {
      const result = checkVersionAgainstSource(
        "2.0.0",
        makeSource({ exactVersions: ["1.0.0", "1.0.1"] }),
      );
      expect(result.affected).toBe(false);
      expect(result.definitive).toBe(true);
    });
  });

  describe("universal flag", () => {
    it("should report all versions affected", () => {
      const result = checkVersionAgainstSource(
        "99.99.99",
        makeSource({ universal: true }),
      );
      expect(result.affected).toBe(true);
      expect(result.definitive).toBe(true);
      expect(result.reason).toContain("All versions");
    });
  });

  describe("inclusive start, exclusive end (>=A <B)", () => {
    const source = makeSource({
      ranges: [
        {
          introduced: "1.0.0",
          introducedInclusive: true,
          fixed: "2.0.0",
          fixedInclusive: false,
        },
      ],
    });

    it("should include the introduced version", () => {
      expect(checkVersionAgainstSource("1.0.0", source).affected).toBe(true);
    });

    it("should include a version within the range", () => {
      expect(checkVersionAgainstSource("1.5.0", source).affected).toBe(true);
    });

    it("should exclude the fixed version", () => {
      expect(checkVersionAgainstSource("2.0.0", source).affected).toBe(false);
    });

    it("should exclude versions below the range", () => {
      expect(checkVersionAgainstSource("0.9.0", source).affected).toBe(false);
    });

    it("should exclude versions above the range", () => {
      expect(checkVersionAgainstSource("3.0.0", source).affected).toBe(false);
    });
  });

  describe("exclusive start, inclusive end (>A <=B)", () => {
    const source = makeSource({
      ranges: [
        {
          introduced: "1.0.0",
          introducedInclusive: false,
          fixed: "2.0.0",
          fixedInclusive: true,
        },
      ],
    });

    it("should exclude the introduced version exactly", () => {
      expect(checkVersionAgainstSource("1.0.0", source).affected).toBe(false);
    });

    it("should include version just above introduced", () => {
      expect(checkVersionAgainstSource("1.0.1", source).affected).toBe(true);
    });

    it("should include the fixed version (inclusive)", () => {
      expect(checkVersionAgainstSource("2.0.0", source).affected).toBe(true);
    });

    it("should exclude versions above fixed", () => {
      expect(checkVersionAgainstSource("2.0.1", source).affected).toBe(false);
    });
  });

  describe("introduced:0 (no lower bound)", () => {
    const source = makeSource({
      ranges: [
        {
          introduced: "0",
          introducedInclusive: true,
          fixed: "1.5.0",
          fixedInclusive: false,
        },
      ],
    });

    it("should include very early versions", () => {
      expect(checkVersionAgainstSource("0.0.1", source).affected).toBe(true);
    });

    it("should include versions just before fix", () => {
      expect(checkVersionAgainstSource("1.4.9", source).affected).toBe(true);
    });

    it("should exclude the fixed version", () => {
      expect(checkVersionAgainstSource("1.5.0", source).affected).toBe(false);
    });
  });

  describe("open-ended range (no upper bound)", () => {
    const source = makeSource({
      ranges: [
        {
          introduced: "3.0.0",
          introducedInclusive: true,
          fixed: null,
          fixedInclusive: false,
        },
      ],
    });

    it("should include the introduced version", () => {
      expect(checkVersionAgainstSource("3.0.0", source).affected).toBe(true);
    });

    it("should include any version above", () => {
      expect(checkVersionAgainstSource("99.0.0", source).affected).toBe(true);
    });

    it("should exclude versions below", () => {
      expect(checkVersionAgainstSource("2.9.9", source).affected).toBe(false);
    });
  });

  // CVE-2023-29019: two disjoint OSV ranges
  describe("multiple disjoint ranges", () => {
    const source = makeSource({
      source: "OSV",
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
    });

    it("should match version in first range", () => {
      expect(checkVersionAgainstSource("0.5.0", source).affected).toBe(true);
    });

    it("should not match version between ranges", () => {
      expect(checkVersionAgainstSource("1.5.0", source).affected).toBe(false);
    });

    it("should match version in second range", () => {
      expect(checkVersionAgainstSource("2.1.0", source).affected).toBe(true);
    });

    it("should not match fixed version of first range", () => {
      expect(checkVersionAgainstSource("1.1.0", source).affected).toBe(false);
    });

    it("should not match fixed version of second range", () => {
      expect(checkVersionAgainstSource("2.3.0", source).affected).toBe(false);
    });
  });

  describe("unparseable version", () => {
    it("should return non-definitive result", () => {
      const source = makeSource({
        ranges: [
          {
            introduced: "1.0.0",
            introducedInclusive: true,
            fixed: "2.0.0",
            fixedInclusive: false,
          },
        ],
      });
      const result = checkVersionAgainstSource("not-a-version", source);
      expect(result.affected).toBe(false);
      expect(result.definitive).toBe(false);
      expect(result.reason).toContain("Unable to parse");
    });
  });

  describe("empty source (no ranges, no exact versions)", () => {
    it("should return non-definitive empty result", () => {
      const result = checkVersionAgainstSource("1.0.0", makeSource());
      expect(result.affected).toBe(false);
      expect(result.definitive).toBe(false);
      expect(result.reason).toBe("");
    });
  });

  describe("exact version priority over range", () => {
    it("should detect exact match even if range would exclude it", () => {
      const source = makeSource({
        exactVersions: ["3.0.0"],
        ranges: [
          {
            introduced: "1.0.0",
            introducedInclusive: true,
            fixed: "2.0.0",
            fixedInclusive: false,
          },
        ],
      });
      const result = checkVersionAgainstSource("3.0.0", source);
      expect(result.affected).toBe(true);
      expect(result.reason).toContain("explicitly listed");
    });
  });

  describe("version coercion", () => {
    it("should handle v-prefixed versions", () => {
      const source = makeSource({
        ranges: [
          {
            introduced: "1.0.0",
            introducedInclusive: true,
            fixed: "2.0.0",
            fixedInclusive: false,
          },
        ],
      });
      expect(checkVersionAgainstSource("v1.5.0", source).affected).toBe(true);
    });
  });

  describe("empty string boundary handling", () => {
    it("should treat empty string introduced as no lower bound", () => {
      const source = makeSource({
        ranges: [
          {
            introduced: "",
            introducedInclusive: true,
            fixed: "2.0.0",
            fixedInclusive: false,
          },
        ],
      });
      expect(checkVersionAgainstSource("0.0.1", source).affected).toBe(true);
      expect(checkVersionAgainstSource("1.9.9", source).affected).toBe(true);
      expect(checkVersionAgainstSource("2.0.0", source).affected).toBe(false);
    });

    it("should treat empty string fixed as no upper bound", () => {
      const source = makeSource({
        ranges: [
          {
            introduced: "1.0.0",
            introducedInclusive: true,
            fixed: "",
            fixedInclusive: false,
          },
        ],
      });
      expect(checkVersionAgainstSource("1.0.0", source).affected).toBe(true);
      expect(checkVersionAgainstSource("99.0.0", source).affected).toBe(true);
      expect(checkVersionAgainstSource("0.9.0", source).affected).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// buildSourceVerdict
// ---------------------------------------------------------------------------

describe("buildSourceVerdict", () => {
  it("should produce a full verdict with allVersionsRaw", () => {
    const rangeData: SourceRangeData = {
      source: "NVD",
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
    };
    const verdict = buildSourceVerdict("1.5.0", rangeData);
    expect(verdict.source).toBe("NVD");
    expect(verdict.affected).toBe(true);
    expect(verdict.definitive).toBe(true);
    expect(verdict.reason).toContain(">=1.0.0 <2.0.0");
    expect(verdict.allVersionsRaw).toBe(">=1.0.0 <2.0.0");
  });

  it("should produce not-affected verdict", () => {
    const rangeData: SourceRangeData = {
      source: "OSV",
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
    };
    const verdict = buildSourceVerdict("3.0.0", rangeData);
    expect(verdict.affected).toBe(false);
    expect(verdict.definitive).toBe(true);
    expect(verdict.reason).toContain("NOT in");
  });
});
