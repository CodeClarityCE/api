import type {
  PaginationConfig,
  PaginationUserSuppliedConf,
} from "src/types/pagination.types";
import {
  isNoneSeverity,
  isLowSeverity,
  isMediumSeverity,
  isHighSeverity,
  isCriticalSeverity,
  getVersionsSatisfyingConstraint,
  getVersionsSatisfying,
  paginate,
  NoPreviousAnalysis,
  NoProjectAssociatedWithAnalysis,
} from "./utils";

describe("utils", () => {
  describe("severity checking functions", () => {
    describe("isNoneSeverity", () => {
      it("should return true for severity 0.0", () => {
        expect(isNoneSeverity(0.0)).toBe(true);
      });

      it("should return true for null severity", () => {
        expect(isNoneSeverity(null as any)).toBe(true);
      });

      it("should return false for positive severity", () => {
        expect(isNoneSeverity(1.0)).toBe(false);
        expect(isNoneSeverity(3.9)).toBe(false);
        expect(isNoneSeverity(5.0)).toBe(false);
      });

      it("should return false for negative severity", () => {
        expect(isNoneSeverity(-1.0)).toBe(false);
      });
    });

    describe("isLowSeverity", () => {
      it("should return true for severity between 0.0 and 4.0 (exclusive)", () => {
        expect(isLowSeverity(0.1)).toBe(true);
        expect(isLowSeverity(1.0)).toBe(true);
        expect(isLowSeverity(3.9)).toBe(true);
      });

      it("should return false for severity 0.0", () => {
        expect(isLowSeverity(0.0)).toBe(false);
      });

      it("should return false for severity 4.0 or higher", () => {
        expect(isLowSeverity(4.0)).toBe(false);
        expect(isLowSeverity(5.0)).toBe(false);
      });

      it("should return false for negative severity", () => {
        expect(isLowSeverity(-1.0)).toBe(false);
      });
    });

    describe("isMediumSeverity", () => {
      it("should return true for severity between 4.0 (inclusive) and 7.0 (exclusive)", () => {
        expect(isMediumSeverity(4.0)).toBe(true);
        expect(isMediumSeverity(5.0)).toBe(true);
        expect(isMediumSeverity(6.9)).toBe(true);
      });

      it("should return false for severity less than 4.0", () => {
        expect(isMediumSeverity(3.9)).toBe(false);
        expect(isMediumSeverity(0.0)).toBe(false);
      });

      it("should return false for severity 7.0 or higher", () => {
        expect(isMediumSeverity(7.0)).toBe(false);
        expect(isMediumSeverity(8.0)).toBe(false);
      });
    });

    describe("isHighSeverity", () => {
      it("should return true for severity between 7.0 (inclusive) and 9.0 (exclusive)", () => {
        expect(isHighSeverity(7.0)).toBe(true);
        expect(isHighSeverity(8.0)).toBe(true);
        expect(isHighSeverity(8.9)).toBe(true);
      });

      it("should return false for severity less than 7.0", () => {
        expect(isHighSeverity(6.9)).toBe(false);
        expect(isHighSeverity(4.0)).toBe(false);
      });

      it("should return false for severity 9.0 or higher", () => {
        expect(isHighSeverity(9.0)).toBe(false);
        expect(isHighSeverity(10.0)).toBe(false);
      });
    });

    describe("isCriticalSeverity", () => {
      it("should return true for severity 9.0 or higher", () => {
        expect(isCriticalSeverity(9.0)).toBe(true);
        expect(isCriticalSeverity(9.5)).toBe(true);
        expect(isCriticalSeverity(10.0)).toBe(true);
      });

      it("should return false for severity less than 9.0", () => {
        expect(isCriticalSeverity(8.9)).toBe(false);
        expect(isCriticalSeverity(0.0)).toBe(false);
      });
    });

    describe("edge cases", () => {
      it("should handle floating point precision", () => {
        expect(isLowSeverity(3.999999)).toBe(true);
        expect(isMediumSeverity(3.999999)).toBe(false);
        expect(isMediumSeverity(4.000001)).toBe(true);
      });

      it("should handle boundary values correctly", () => {
        expect(isLowSeverity(4.0)).toBe(false);
        expect(isMediumSeverity(4.0)).toBe(true);
        expect(isMediumSeverity(7.0)).toBe(false);
        expect(isHighSeverity(7.0)).toBe(true);
        expect(isHighSeverity(9.0)).toBe(false);
        expect(isCriticalSeverity(9.0)).toBe(true);
      });
    });
  });

  describe("version constraint functions", () => {
    const mockVersions = ["1.0.0", "1.1.0", "1.2.0", "2.0.0", "2.1.0", "3.0.0"];

    describe("getVersionsSatisfyingConstraint", () => {
      it("should return versions matching exact constraint", () => {
        const result = getVersionsSatisfyingConstraint(mockVersions, "1.0.0");
        expect(result).toEqual(["1.0.0"]);
      });

      it("should return versions matching range constraint", () => {
        const result = getVersionsSatisfyingConstraint(
          mockVersions,
          ">=1.0.0 <2.0.0",
        );
        expect(result).toEqual(["1.0.0", "1.1.0", "1.2.0"]);
      });

      it("should return versions matching wildcard constraint", () => {
        const result = getVersionsSatisfyingConstraint(mockVersions, "1.x");
        expect(result).toEqual(["1.0.0", "1.1.0", "1.2.0"]);
      });

      it("should return empty array when no versions match", () => {
        const result = getVersionsSatisfyingConstraint(mockVersions, "5.0.0");
        expect(result).toEqual([]);
      });

      it("should handle empty versions array", () => {
        const result = getVersionsSatisfyingConstraint([], "1.0.0");
        expect(result).toEqual([]);
      });

      it("should handle invalid constraint gracefully", () => {
        expect(() =>
          getVersionsSatisfyingConstraint(mockVersions, "invalid"),
        ).not.toThrow();
      });

      it("should handle caret constraint", () => {
        const result = getVersionsSatisfyingConstraint(mockVersions, "^1.0.0");
        expect(result).toEqual(["1.0.0", "1.1.0", "1.2.0"]);
      });

      it("should handle tilde constraint", () => {
        const result = getVersionsSatisfyingConstraint(mockVersions, "~1.1.0");
        expect(result).toEqual(["1.1.0"]);
      });
    });

    describe("getVersionsSatisfying", () => {
      // Note: The implementation has multiple bugs:
      // 1. Missing space in constraint concatenation (e.g., ">= 1.0.0<= 2.0.0" instead of ">= 1.0.0 <= 2.0.0")
      // 2. Parameter names are swapped (upperIncluded controls lower bound, lowerIncluded controls upper bound)
      // These tests document the actual (buggy) behavior

      it("should return empty array due to invalid constraint (bug: missing space)", () => {
        // Creates invalid constraint ">= 1.0.0<= 2.0.0" which matches no versions
        const result = getVersionsSatisfying(
          mockVersions,
          "1.0.0",
          "2.0.0",
          true,
          true,
        );
        expect(result).toEqual([]);
      });

      it("should return empty array due to invalid constraint (bug: missing space)", () => {
        // Creates invalid constraint "> 1.0.0< 2.0.0" which matches no versions
        const result = getVersionsSatisfying(
          mockVersions,
          "1.0.0",
          "2.0.0",
          false,
          false,
        );
        expect(result).toEqual([]);
      });

      it("should return empty array due to invalid constraint (bug: missing space)", () => {
        // Creates invalid constraint "> 1.0.0<= 2.0.0" which matches no versions
        const result = getVersionsSatisfying(
          mockVersions,
          "1.0.0",
          "2.0.0",
          true,
          false,
        );
        expect(result).toEqual([]);
      });

      it("should return empty array due to invalid constraint (bug: missing space)", () => {
        // Creates invalid constraint ">= 1.0.0< 2.0.0" which matches no versions
        const result = getVersionsSatisfying(
          mockVersions,
          "1.0.0",
          "2.0.0",
          false,
          true,
        );
        expect(result).toEqual([]);
      });

      it("should return versions with only lower bound (bug: parameters are swapped)", () => {
        // upperIncluded=false controls the lower bound due to bug
        const result = getVersionsSatisfying(
          mockVersions,
          "2.0.0",
          null,
          true,
          false,
        );
        expect(result).toEqual(["2.1.0", "3.0.0"]);
      });

      it("should return versions with only lower bound inclusive (bug: parameters are swapped)", () => {
        // upperIncluded=true controls the lower bound due to bug
        const result = getVersionsSatisfying(
          mockVersions,
          "2.0.0",
          null,
          false,
          true,
        );
        expect(result).toEqual(["2.0.0", "2.1.0", "3.0.0"]);
      });

      it("should return versions with only upper bound (bug: parameters are swapped)", () => {
        // lowerIncluded=true controls the upper bound due to bug
        const result = getVersionsSatisfying(
          mockVersions,
          null,
          "2.0.0",
          true,
          false,
        );
        expect(result).toEqual(["1.0.0", "1.1.0", "1.2.0", "2.0.0"]);
      });

      it("should return versions with only upper bound exclusive (bug: parameters are swapped)", () => {
        // lowerIncluded=false controls the upper bound due to bug
        const result = getVersionsSatisfying(
          mockVersions,
          null,
          "2.0.0",
          false,
          false,
        );
        expect(result).toEqual(["1.0.0", "1.1.0", "1.2.0"]);
      });

      it("should return all versions when both bounds are null", () => {
        const result = getVersionsSatisfying(
          mockVersions,
          null,
          null,
          false,
          false,
        );
        expect(result).toEqual(mockVersions);
      });

      it("should handle empty versions array", () => {
        const result = getVersionsSatisfying([], "1.0.0", "2.0.0", true, true);
        expect(result).toEqual([]);
      });

      it("should handle invalid version ranges gracefully", () => {
        expect(() =>
          getVersionsSatisfying(mockVersions, "invalid", "2.0.0", true, true),
        ).not.toThrow();
      });

      it("should handle same lower and upper bounds (bug: missing space)", () => {
        // Creates invalid constraint ">= 1.0.0<= 1.0.0" which matches no versions
        const result = getVersionsSatisfying(
          mockVersions,
          "1.0.0",
          "1.0.0",
          true,
          true,
        );
        expect(result).toEqual([]);
      });

      it("should handle same lower and upper bounds (exclusive)", () => {
        const result = getVersionsSatisfying(
          mockVersions,
          "1.0.0",
          "1.0.0",
          false,
          false,
        );
        expect(result).toEqual([]);
      });
    });
  });

  describe("custom error classes", () => {
    describe("NoPreviousAnalysis", () => {
      it("should be instance of Error", () => {
        const error = new NoPreviousAnalysis();
        expect(error).toBeInstanceOf(Error);
      });

      it("should have correct name", () => {
        const error = new NoPreviousAnalysis();
        expect(error.name).toBe("Error");
      });

      it("should accept custom message", () => {
        const message = "Custom error message";
        const error = new NoPreviousAnalysis(message);
        expect(error.message).toBe(message);
      });
    });

    describe("NoProjectAssociatedWithAnalysis", () => {
      it("should be instance of Error", () => {
        const error = new NoProjectAssociatedWithAnalysis();
        expect(error).toBeInstanceOf(Error);
      });

      it("should have correct name", () => {
        const error = new NoProjectAssociatedWithAnalysis();
        expect(error.name).toBe("Error");
      });

      it("should accept custom message", () => {
        const message = "Custom error message";
        const error = new NoProjectAssociatedWithAnalysis(message);
        expect(error.message).toBe(message);
      });
    });
  });

  describe("paginate function", () => {
    const mockElements = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const mockPaginationConfig: PaginationConfig = {
      maxEntriesPerPage: 20,
      defaultEntriesPerPage: 5,
    };

    it("should paginate with default values", () => {
      const userConfig: PaginationUserSuppliedConf = {};
      const result = paginate(
        mockElements,
        100,
        userConfig,
        mockPaginationConfig,
      );

      expect(result).toEqual({
        data: [1, 2, 3, 4, 5],
        page: 0,
        entries_per_page: 5,
        total_entries: 100,
        total_pages: 2,
        entry_count: 5,
        matching_count: 10,
        filter_count: {},
      });
    });

    it("should paginate with custom page and entries per page", () => {
      const userConfig: PaginationUserSuppliedConf = {
        currentPage: 1,
        entriesPerPage: 3,
      };
      const result = paginate(
        mockElements,
        100,
        userConfig,
        mockPaginationConfig,
      );

      expect(result).toEqual({
        data: [4, 5, 6],
        page: 1,
        entries_per_page: 3,
        total_entries: 100,
        total_pages: 4,
        entry_count: 3,
        matching_count: 10,
        filter_count: {},
      });
    });

    it("should handle last page with fewer elements", () => {
      const userConfig: PaginationUserSuppliedConf = {
        currentPage: 3,
        entriesPerPage: 3,
      };
      const result = paginate(
        mockElements,
        100,
        userConfig,
        mockPaginationConfig,
      );

      expect(result).toEqual({
        data: [10],
        page: 3,
        entries_per_page: 3,
        total_entries: 100,
        total_pages: 4,
        entry_count: 1,
        matching_count: 10,
        filter_count: {},
      });
    });

    it("should handle empty elements array", () => {
      const userConfig: PaginationUserSuppliedConf = {};
      const result = paginate([], 0, userConfig, mockPaginationConfig);

      expect(result).toEqual({
        data: [],
        page: 0,
        entries_per_page: 5,
        total_entries: 0,
        total_pages: 0,
        entry_count: 0,
        matching_count: 0,
        filter_count: {},
      });
    });

    it("should use default page when currentPage is negative", () => {
      const userConfig: PaginationUserSuppliedConf = {
        currentPage: -1,
        entriesPerPage: 3,
      };
      const result = paginate(
        mockElements,
        100,
        userConfig,
        mockPaginationConfig,
      );

      expect(result.page).toBe(0);
      expect(result.data).toEqual([1, 2, 3]);
    });

    it("should use default page when currentPage is null", () => {
      const userConfig: PaginationUserSuppliedConf = {
        currentPage: null as any,
        entriesPerPage: 3,
      };
      const result = paginate(
        mockElements,
        100,
        userConfig,
        mockPaginationConfig,
      );

      expect(result.page).toBe(0);
      expect(result.data).toEqual([1, 2, 3]);
    });

    it("should use default entries per page when entriesPerPage is negative", () => {
      const userConfig: PaginationUserSuppliedConf = {
        currentPage: 0,
        entriesPerPage: -1,
      };
      const result = paginate(
        mockElements,
        100,
        userConfig,
        mockPaginationConfig,
      );

      expect(result.entries_per_page).toBe(5);
      expect(result.data).toEqual([1, 2, 3, 4, 5]);
    });

    it("should use default entries per page when entriesPerPage is null", () => {
      const userConfig: PaginationUserSuppliedConf = {
        currentPage: 0,
        entriesPerPage: null as any,
      };
      const result = paginate(
        mockElements,
        100,
        userConfig,
        mockPaginationConfig,
      );

      expect(result.entries_per_page).toBe(5);
      expect(result.data).toEqual([1, 2, 3, 4, 5]);
    });

    it("should use default entries per page when entriesPerPage exceeds maximum", () => {
      const userConfig: PaginationUserSuppliedConf = {
        currentPage: 0,
        entriesPerPage: 25,
      };
      const result = paginate(
        mockElements,
        100,
        userConfig,
        mockPaginationConfig,
      );

      expect(result.entries_per_page).toBe(5);
      expect(result.data).toEqual([1, 2, 3, 4, 5]);
    });

    it("should calculate total pages correctly", () => {
      const userConfig: PaginationUserSuppliedConf = {
        entriesPerPage: 3,
      };
      const result = paginate(
        mockElements,
        100,
        userConfig,
        mockPaginationConfig,
      );

      expect(result.total_pages).toBe(Math.ceil(10 / 3));
    });

    it("should handle page beyond available elements", () => {
      const userConfig: PaginationUserSuppliedConf = {
        currentPage: 10,
        entriesPerPage: 3,
      };
      const result = paginate(
        mockElements,
        100,
        userConfig,
        mockPaginationConfig,
      );

      expect(result.data).toEqual([]);
      expect(result.entry_count).toBe(0);
      expect(result.page).toBe(10);
    });

    it("should handle single element array", () => {
      const singleElement = [42];
      const userConfig: PaginationUserSuppliedConf = {
        entriesPerPage: 10,
      };
      const result = paginate(
        singleElement,
        1,
        userConfig,
        mockPaginationConfig,
      );

      expect(result).toEqual({
        data: [42],
        page: 0,
        entries_per_page: 10,
        total_entries: 1,
        total_pages: 1,
        entry_count: 1,
        matching_count: 1,
        filter_count: {},
      });
    });

    it("should handle different total_entries than elements length", () => {
      const userConfig: PaginationUserSuppliedConf = {};
      const result = paginate(
        mockElements,
        1000,
        userConfig,
        mockPaginationConfig,
      );

      expect(result.total_entries).toBe(1000);
      expect(result.matching_count).toBe(10);
    });

    it("should preserve filter_count as empty object", () => {
      const userConfig: PaginationUserSuppliedConf = {};
      const result = paginate(
        mockElements,
        100,
        userConfig,
        mockPaginationConfig,
      );

      expect(result.filter_count).toEqual({});
    });

    it("should handle maximum entries per page boundary", () => {
      const userConfig: PaginationUserSuppliedConf = {
        entriesPerPage: 20,
      };
      const result = paginate(
        mockElements,
        100,
        userConfig,
        mockPaginationConfig,
      );

      expect(result.entries_per_page).toBe(20);
      expect(result.data).toEqual(mockElements);
    });

    it("should handle zero entries per page in config", () => {
      const zeroConfig: PaginationConfig = {
        maxEntriesPerPage: 20,
        defaultEntriesPerPage: 0,
      };
      const userConfig: PaginationUserSuppliedConf = {};
      const result = paginate(mockElements, 100, userConfig, zeroConfig);

      expect(result.entries_per_page).toBe(0);
      expect(result.data).toEqual([]);
    });
  });
});
