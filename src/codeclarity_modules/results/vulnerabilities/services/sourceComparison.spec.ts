import { compareSourceVerdicts } from "./sourceComparison";
import type { ComparisonResult, SourceVerdict } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeVerdict(
  overrides: Partial<SourceVerdict> & { source: SourceVerdict["source"] },
): SourceVerdict {
  return {
    affected: false,
    definitive: true,
    reason: "",
    allVersionsRaw: "",
    ...overrides,
  };
}

// ===========================================================================
// compareSourceVerdicts
// ===========================================================================

describe("compareSourceVerdicts", () => {
  describe("agreement logic", () => {
    it("should agree when all definitive verdicts say affected", () => {
      const result = compareSourceVerdicts([
        makeVerdict({
          source: "NVD",
          affected: true,
          reason: "in range",
          allVersionsRaw: "<2.0.0",
        }),
        makeVerdict({
          source: "OSV",
          affected: true,
          reason: "in range",
          allVersionsRaw: "<2.0.0",
        }),
      ]);
      expect(result.agree).toBe(true);
    });

    it("should agree when all definitive verdicts say not affected", () => {
      const result = compareSourceVerdicts([
        makeVerdict({
          source: "NVD",
          affected: false,
          reason: "not in range",
        }),
        makeVerdict({
          source: "OSV",
          affected: false,
          reason: "not in range",
        }),
      ]);
      expect(result.agree).toBe(true);
    });

    it("should disagree when definitive verdicts conflict", () => {
      const result = compareSourceVerdicts([
        makeVerdict({
          source: "NVD",
          affected: true,
          reason: "in range",
        }),
        makeVerdict({
          source: "OSV",
          affected: false,
          reason: "not in range",
        }),
      ]);
      expect(result.agree).toBe(false);
    });

    it("should agree when only one definitive verdict exists", () => {
      const result = compareSourceVerdicts([
        makeVerdict({
          source: "NVD",
          affected: true,
          definitive: true,
          reason: "in range",
        }),
        makeVerdict({
          source: "OSV",
          affected: false,
          definitive: false,
          reason: "",
        }),
      ]);
      expect(result.agree).toBe(true);
    });

    it("should agree when no definitive verdicts exist", () => {
      const result = compareSourceVerdicts([
        makeVerdict({
          source: "NVD",
          definitive: false,
          reason: "",
        }),
        makeVerdict({
          source: "OSV",
          definitive: false,
          reason: "",
        }),
      ]);
      expect(result.agree).toBe(true);
    });

    it("should agree with empty verdict list", () => {
      const result = compareSourceVerdicts([]);
      expect(result.agree).toBe(true);
    });
  });

  describe("three-source agreement", () => {
    it("should agree when NVD, OSV, and GCVE all say affected", () => {
      const result = compareSourceVerdicts([
        makeVerdict({ source: "NVD", affected: true, reason: "NVD reason" }),
        makeVerdict({ source: "OSV", affected: true, reason: "OSV reason" }),
        makeVerdict({ source: "GCVE", affected: true, reason: "GCVE reason" }),
      ]);
      expect(result.agree).toBe(true);
    });

    it("should disagree when one of three sources differs", () => {
      const result = compareSourceVerdicts([
        makeVerdict({ source: "NVD", affected: true, reason: "in range" }),
        makeVerdict({ source: "OSV", affected: true, reason: "in range" }),
        makeVerdict({
          source: "GCVE",
          affected: false,
          reason: "not in range",
        }),
      ]);
      expect(result.agree).toBe(false);
    });

    it("should ignore non-definitive when two definitive agree", () => {
      const result = compareSourceVerdicts([
        makeVerdict({ source: "NVD", affected: true, definitive: true }),
        makeVerdict({ source: "OSV", affected: true, definitive: true }),
        makeVerdict({ source: "GCVE", affected: false, definitive: false }),
      ]);
      expect(result.agree).toBe(true);
    });
  });

  describe("output shape", () => {
    it("should populate all fields in ComparisonResult", () => {
      const result: ComparisonResult = compareSourceVerdicts([
        makeVerdict({
          source: "NVD",
          affected: true,
          reason: "NVD reason text",
          allVersionsRaw: "<2.0.0",
        }),
        makeVerdict({
          source: "OSV",
          affected: true,
          reason: "OSV reason text",
          allVersionsRaw: "<2.0.0\n>=3.0.0 <4.0.0",
        }),
        makeVerdict({
          source: "GCVE",
          affected: true,
          reason: "GCVE reason text",
          allVersionsRaw: "<=2.4.11",
        }),
      ]);

      expect(result.nvd).toBe("NVD reason text");
      expect(result.osv).toBe("OSV reason text");
      expect(result.gcve).toBe("GCVE reason text");
      expect(result.nvdReason).toBe("NVD reason text");
      expect(result.osvReason).toBe("OSV reason text");
      expect(result.gcveReason).toBe("GCVE reason text");
      expect(result.nvdAllVersions).toBe("<2.0.0");
      expect(result.osvAllVersions).toBe("<2.0.0\n>=3.0.0 <4.0.0");
      expect(result.gcveAllVersions).toBe("<=2.4.11");
      expect(result.agree).toBe(true);
    });

    it("should default missing sources to empty strings", () => {
      const result = compareSourceVerdicts([
        makeVerdict({ source: "NVD", affected: true, reason: "NVD only" }),
      ]);
      expect(result.nvdReason).toBe("NVD only");
      expect(result.osvReason).toBe("");
      expect(result.gcveReason).toBe("");
      expect(result.osvAllVersions).toBe("");
      expect(result.gcveAllVersions).toBe("");
    });
  });
});
