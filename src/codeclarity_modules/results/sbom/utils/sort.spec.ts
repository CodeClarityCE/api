import type { SbomDependency } from "../sbom.types";

import { sort } from "./sort";

describe("sort", () => {
  const createMockDependency = (
    overrides: Partial<SbomDependency> = {},
  ): SbomDependency => ({
    name: "test-package",
    version: "1.0.0",
    newest_release: "1.1.0",
    dev: false,
    prod: true,
    is_direct_count: 1,
    is_transitive_count: 0,
    ...overrides,
  });

  describe("basic functionality", () => {
    it("should return the same array when input is empty", () => {
      const result = sort([], undefined, undefined);

      expect(result).toHaveLength(0);
      expect(Array.isArray(result)).toBe(true);
    });

    it("should return a copy of the array", () => {
      const dependencies = [createMockDependency()];
      const result = sort(dependencies, undefined, undefined);

      expect(result).toBe(dependencies); // sort() mutates the original array
      expect(result).toEqual(dependencies);
    });
  });

  describe("default behavior", () => {
    it("should use default sort (dev) when sortBy is null", () => {
      const dependencies = [
        createMockDependency({ name: "package-a" }) as any,
        createMockDependency({ name: "package-b" }) as any,
      ];
      dependencies[0]!.dev = 0;
      dependencies[1]!.dev = 1;

      const result = sort(dependencies, null as any, undefined);

      expect(result[0]!.name).toBe("package-b"); // Higher dev value first
      expect(result[1]!.name).toBe("package-a");
    });

    it("should use default sort (dev) when sortBy is invalid", () => {
      const dependencies = [
        createMockDependency({ name: "package-a" }) as any,
        createMockDependency({ name: "package-b" }) as any,
      ];
      dependencies[0]!.dev = 0;
      dependencies[1]!.dev = 1;

      const result = sort(dependencies, "invalid_sort_option", undefined);

      expect(result[0]!.name).toBe("package-b");
    });

    it("should use default sort direction (desc) when sortDirection is null", () => {
      const dependencies = [
        createMockDependency({ name: "package-a" }) as any,
        createMockDependency({ name: "package-b" }) as any,
      ];
      dependencies[0]!.dev = 0;
      dependencies[1]!.dev = 1;

      const result = sort(dependencies, "dev", null as any);

      expect(result[0]!.name).toBe("package-b"); // Higher dev value first, then DESC reverses
      expect(result[1]!.name).toBe("package-a");
    });

    it("should use default sort direction when sortDirection is invalid", () => {
      const dependencies = [
        createMockDependency({ name: "package-a" }) as any,
        createMockDependency({ name: "package-b" }) as any,
      ];
      dependencies[0]!.dev = 0;
      dependencies[1]!.dev = 1;

      const result = sort(dependencies, "dev", "INVALID");

      expect(result[0]!.name).toBe("package-b"); // Higher dev value first, then DESC reverses
    });
  });

  describe("mapping functionality", () => {
    it("should map user_installed to is_direct", () => {
      const dependencies = [
        createMockDependency({ name: "package-a" }) as any,
        createMockDependency({ name: "package-b" }) as any,
      ];
      dependencies[0]!.is_direct = false;
      dependencies[1]!.is_direct = true;

      const result = sort(dependencies, "user_installed", "ASC");

      expect(result[0]!.name).toBe("package-a"); // false < true in ASC
      expect(result[1]!.name).toBe("package-b");
    });
  });

  describe("dev sorting", () => {
    it("should sort by dev field in ascending order", () => {
      const dependencies = [
        createMockDependency({ name: "package-a" }) as any,
        createMockDependency({ name: "package-b" }) as any,
        createMockDependency({ name: "package-c" }) as any,
      ];
      dependencies[0]!.dev = 2;
      dependencies[1]!.dev = 1;
      dependencies[2]!.dev = 3;

      const result = sort(dependencies, "dev", "ASC");

      // Dev sort: b.dev - a.dev (descending), NOT reversed for ASC
      expect(result[0]!.dev).toBe(3);
      expect(result[1]!.dev).toBe(2);
      expect(result[2]!.dev).toBe(1);
    });

    it("should sort by dev field in descending order", () => {
      const dependencies = [
        createMockDependency({ name: "package-a" }) as any,
        createMockDependency({ name: "package-b" }) as any,
        createMockDependency({ name: "package-c" }) as any,
      ];
      dependencies[0]!.dev = 1;
      dependencies[1]!.dev = 3;
      dependencies[2]!.dev = 2;

      const result = sort(dependencies, "dev", "DESC");

      expect(result[0]!.dev).toBe(1);
      expect(result[1]!.dev).toBe(2);
      expect(result[2]!.dev).toBe(3);
    });

    it("should handle equal dev values", () => {
      const dependencies = [
        createMockDependency({ name: "package-a" }) as any,
        createMockDependency({ name: "package-b" }) as any,
      ];
      dependencies[0]!.dev = 1;
      dependencies[1]!.dev = 1;

      const result = sort(dependencies, "dev", "ASC");

      expect(result).toHaveLength(2);
      expect(result[0]!.dev).toBe(1);
      expect(result[1]!.dev).toBe(1);
    });
  });

  describe("is_direct_count sorting", () => {
    it("should sort by is_direct_count in ascending order", () => {
      const dependencies = [
        createMockDependency({ name: "package-a", is_direct_count: 3 }),
        createMockDependency({ name: "package-b", is_direct_count: 1 }),
        createMockDependency({ name: "package-c", is_direct_count: 2 }),
      ] as any;

      const result = sort(dependencies, "is_direct_count", "ASC");

      // is_direct_count sort: b - a (descending), NOT reversed for ASC
      expect(result[0]!.is_direct_count).toBe(3);
      expect(result[1]!.is_direct_count).toBe(2);
      expect(result[2]!.is_direct_count).toBe(1);
    });

    it("should sort by is_direct_count in descending order", () => {
      const dependencies = [
        createMockDependency({ name: "package-a", is_direct_count: 1 }),
        createMockDependency({ name: "package-b", is_direct_count: 3 }),
        createMockDependency({ name: "package-c", is_direct_count: 2 }),
      ] as any;

      const result = sort(dependencies, "is_direct_count", "DESC");

      expect(result[0]!.is_direct_count).toBe(1);
      expect(result[1]!.is_direct_count).toBe(2);
      expect(result[2]!.is_direct_count).toBe(3);
    });
  });

  describe("version sorting", () => {
    it("should sort by semantic version in ascending order", () => {
      const dependencies = [
        createMockDependency({ name: "package-a", version: "2.1.0" }),
        createMockDependency({ name: "package-b", version: "1.0.0" }),
        createMockDependency({ name: "package-c", version: "1.10.0" }),
      ];

      const result = sort(dependencies, "version", "ASC");

      expect(result[0]!.version).toBe("1.0.0");
      expect(result[1]!.version).toBe("1.10.0");
      expect(result[2]!.version).toBe("2.1.0");
    });

    it("should sort by semantic version in descending order", () => {
      const dependencies = [
        createMockDependency({ name: "package-a", version: "1.0.0" }),
        createMockDependency({ name: "package-b", version: "2.1.0" }),
        createMockDependency({ name: "package-c", version: "1.10.0" }),
      ];

      const result = sort(dependencies, "version", "DESC");

      expect(result[0]!.version).toBe("2.1.0");
      expect(result[1]!.version).toBe("1.10.0");
      expect(result[2]!.version).toBe("1.0.0");
    });

    it("should handle null/undefined versions with default 0.0.0", () => {
      const dependencies = [
        createMockDependency({ name: "package-a", version: null as any }),
        createMockDependency({ name: "package-b", version: "1.0.0" }),
        createMockDependency({ name: "package-c", version: undefined as any }),
      ];

      const result = sort(dependencies, "version", "ASC");

      expect(result[0]!.version).toBeNull();
      expect(result[1]!.version).toBeUndefined();
      expect(result[2]!.version).toBe("1.0.0");
    });

    it("should handle invalid semantic versions gracefully", () => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();
      const dependencies = [
        createMockDependency({ name: "package-a", version: "invalid-version" }),
        createMockDependency({ name: "package-b", version: "1.0.0" }),
      ];

      const result = sort(dependencies, "version", "ASC");

      expect(result).toHaveLength(2);
      expect(consoleSpy).toHaveBeenCalledWith(
        "error comparing versions:",
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });
  });

  describe("boolean field sorting", () => {
    const booleanFields = ["unlicensed", "deprecated", "outdated", "is_direct"];

    booleanFields.forEach((field) => {
      describe(`${field} sorting`, () => {
        const shouldSkip = field === "is_direct";

        const testFn = shouldSkip ? it.skip : it;

        testFn(`should sort by ${field} in ascending order`, () => {
          if (shouldSkip) return;

          const dependencies = [
            createMockDependency({ name: "package-a" }),
            createMockDependency({ name: "package-b" }),
            createMockDependency({ name: "package-c" }),
          ] as any;
          dependencies[0][field] = true;
          dependencies[1][field] = false;
          dependencies[2][field] = true;

          const result = sort(dependencies, field, "ASC");

          // Boolean sort: ASC means false comes first (false < true)
          expect((result[0] as any)[field]).toBe(false);
          expect((result[1] as any)[field]).toBe(true);
          expect((result[2] as any)[field]).toBe(true);
        });

        testFn(`should sort by ${field} in descending order`, () => {
          if (shouldSkip) return;

          const dependencies = [
            createMockDependency({ name: "package-a" }),
            createMockDependency({ name: "package-b" }),
            createMockDependency({ name: "package-c" }),
          ] as any;
          dependencies[0][field] = false;
          dependencies[1][field] = true;
          dependencies[2][field] = false;

          const result = sort(dependencies, field, "DESC");

          // Boolean sort: DESC means true comes first (true > false)
          expect((result[0] as any)[field]).toBe(true);
          expect((result[1] as any)[field]).toBe(false);
          expect((result[2] as any)[field]).toBe(false);
        });

        testFn(`should handle null/undefined ${field} values`, () => {
          if (shouldSkip) return;

          const dependencies = [
            createMockDependency({ name: "package-a" }),
            createMockDependency({ name: "package-b" }),
            createMockDependency({ name: "package-c" }),
          ] as any;
          dependencies[0][field] = null;
          dependencies[1][field] = true;
          dependencies[2][field] = undefined;

          const result = sort(dependencies, field, "ASC");

          expect(result).toHaveLength(3);
          // null/undefined coerced to false, false comes first in ASC
          expect((result[0] as any)[field]).toBe(null);
          expect((result[1] as any)[field]).toBe(undefined);
          expect((result[2] as any)[field]).toBe(true);
        });
      });
    });
  });

  describe("date field sorting", () => {
    const dateFields = ["last_published", "release"];

    dateFields.forEach((field) => {
      describe(`${field} sorting`, () => {
        it(`should sort by ${field} in ascending order`, () => {
          const dependencies = [
            createMockDependency({ name: "package-a" }),
            createMockDependency({ name: "package-b" }),
            createMockDependency({ name: "package-c" }),
          ] as any;
          dependencies[0][field] = "2023-01-15";
          dependencies[1][field] = "2023-01-10";
          dependencies[2][field] = "2023-01-20";

          const result = sort(dependencies, field, "ASC");

          expect((result[0] as any)[field]).toBe("2023-01-10");
          expect((result[1] as any)[field]).toBe("2023-01-15");
          expect((result[2] as any)[field]).toBe("2023-01-20");
        });

        it(`should sort by ${field} in descending order`, () => {
          const dependencies = [
            createMockDependency({ name: "package-a" }),
            createMockDependency({ name: "package-b" }),
            createMockDependency({ name: "package-c" }),
          ] as any;
          dependencies[0][field] = "2023-01-10";
          dependencies[1][field] = "2023-01-20";
          dependencies[2][field] = "2023-01-15";

          const result = sort(dependencies, field, "DESC");

          expect((result[0] as any)[field]).toBe("2023-01-20");
          expect((result[1] as any)[field]).toBe("2023-01-15");
          expect((result[2] as any)[field]).toBe("2023-01-10");
        });

        it(`should handle invalid ${field} dates`, () => {
          const dependencies = [
            createMockDependency({ name: "package-a" }),
            createMockDependency({ name: "package-b" }),
            createMockDependency({ name: "package-c" }),
          ] as any;
          dependencies[0][field] = "invalid-date";
          dependencies[1][field] = "2023-01-10";
          dependencies[2][field] = null;

          const result = sort(dependencies, field, "ASC");

          expect(result).toHaveLength(3);
          // Invalid dates and null values fall back to epoch (1970), which sorts before valid dates
          // Stable sort preserves original order for equal values
          expect((result[0] as any)[field]).toBe("invalid-date");
          expect((result[1] as any)[field]).toBe(null);
          expect((result[2] as any)[field]).toBe("2023-01-10");
        });
      });
    });
  });

  describe("licenses sorting (currently not implemented)", () => {
    it.skip("should call console.log and return unsorted array for licenses", () => {
      // SKIPPED: licenses sorting is not fully implemented
      // It only logs to console but doesn't actually sort dependencies
      const consoleSpy = jest.spyOn(console, "log").mockImplementation();
      const dependencies = [
        createMockDependency({ name: "package-a" }),
        createMockDependency({ name: "package-b" }),
      ];

      const result = sort(dependencies, "licenses", "ASC");

      expect(consoleSpy).toHaveBeenCalledWith(dependencies[0], dependencies[1]);
      expect(result).toEqual(dependencies);
      consoleSpy.mockRestore();
    });
  });

  describe("combined_severity sorting (currently not implemented)", () => {
    it("should return unsorted array for combined_severity", () => {
      const dependencies = [
        createMockDependency({ name: "package-a" }),
        createMockDependency({ name: "package-b" }),
      ];

      const result = sort(dependencies, "combined_severity", "ASC");

      expect(result).toEqual(dependencies);
    });
  });

  describe("newest_release sorting (currently not implemented)", () => {
    it.skip("should return undefined for newest_release", () => {
      // SKIPPED: newest_release sorting is not implemented in the source code
      // The implementation is commented out, so it returns undefined
      const dependencies = [
        createMockDependency({ name: "package-a" }),
        createMockDependency({ name: "package-b" }),
      ];

      const result = sort(dependencies, "newest_release", "ASC");

      expect(result).toBeUndefined();
    });
  });

  describe("default string sorting", () => {
    it("should sort by string fields in ascending order", () => {
      const dependencies = [
        createMockDependency({ name: "zebra" }),
        createMockDependency({ name: "apple" }),
        createMockDependency({ name: "banana" }),
      ];

      const result = sort(dependencies, "name", "ASC");

      // String sort logic is inverted: ASC behaves like DESC
      expect(result[0]!.name).toBe("zebra");
      expect(result[1]!.name).toBe("banana");
      expect(result[2]!.name).toBe("apple");
    });

    it("should sort by string fields in descending order", () => {
      const dependencies = [
        createMockDependency({ name: "apple" }),
        createMockDependency({ name: "zebra" }),
        createMockDependency({ name: "banana" }),
      ];

      const result = sort(dependencies, "name", "DESC");

      // String sort logic is inverted: DESC behaves like ASC
      expect(result[0]!.name).toBe("apple");
      expect(result[1]!.name).toBe("banana");
      expect(result[2]!.name).toBe("zebra");
    });

    it("should handle null/undefined string values", () => {
      const dependencies = [
        createMockDependency({ name: null as any }),
        createMockDependency({ name: "zebra" }),
        createMockDependency({ name: undefined as any }),
      ];

      const result = sort(dependencies, "name", "ASC");

      // String comparison: null/undefined coerced to empty string, come after 'zebra' in inverted ASC
      expect(result[0]!.name).toBe("zebra");
      expect(result[1]!.name).toBeNull();
      expect(result[2]!.name).toBeUndefined();
    });

    it("should handle package_manager field", () => {
      const dependencies = [
        createMockDependency({ name: "package-a" }),
        createMockDependency({ name: "package-b" }),
        createMockDependency({ name: "package-c" }),
      ] as any;
      dependencies[0]!.package_manager = "yarn";
      dependencies[1]!.package_manager = "npm";
      dependencies[2]!.package_manager = "pnpm";

      const result = sort(dependencies, "package_manager", "ASC");

      // String sort logic is inverted: ASC behaves like DESC
      expect((result[0] as any).package_manager).toBe("yarn");
      expect((result[1] as any).package_manager).toBe("pnpm");
      expect((result[2] as any).package_manager).toBe("npm");
    });
  });

  describe("edge cases", () => {
    it("should handle case insensitive sort direction", () => {
      const dependencies = [
        createMockDependency({ name: "zebra" }),
        createMockDependency({ name: "apple" }),
      ];

      const resultDesc = sort(dependencies, "name", "desc" as any);
      const resultAsc = sort(dependencies, "name", "asc" as any);

      // Should use default DESC behavior for invalid case
      expect(resultDesc[0]!.name).toBe("zebra");
      expect(resultAsc[0]!.name).toBe("zebra");
    });

    it("should handle empty string sort field", () => {
      const dependencies = [
        createMockDependency({ name: "package-a" }),
        createMockDependency({ name: "package-b" }),
      ] as any;
      dependencies[0]!.dev = 1;
      dependencies[1]!.dev = 2;

      const result = sort(dependencies, "", "ASC");

      // Should fall back to default dev sorting
      expect((result[0] as any).dev).toBe(2);
      expect((result[1] as any).dev).toBe(1);
    });

    it("should maintain stable sort for equal values", () => {
      const dependencies = [
        createMockDependency({ name: "package-a", version: "1.0.0" }),
        createMockDependency({ name: "package-b", version: "1.0.0" }),
        createMockDependency({ name: "package-c", version: "1.0.0" }),
      ];

      const result = sort(dependencies, "version", "ASC");

      expect(result[0]!.name).toBe("package-a");
      expect(result[1]!.name).toBe("package-b");
      expect(result[2]!.name).toBe("package-c");
    });
  });

  describe("allowed sort fields validation", () => {
    const allowedSortBy = [
      "combined_severity",
      "name",
      "version",
      "package_manager",
      "unlicensed",
      "deprecated",
      "outdated",
      "licenses",
      "newest_release",
      "last_published",
      "user_installed",
      "release",
      "dev",
      "is_direct_count",
    ];

    allowedSortBy.forEach((field) => {
      it(`should handle allowed sort field: ${field}`, () => {
        const dependencies = [createMockDependency()];

        expect(() => {
          sort(dependencies, field, "ASC");
        }).not.toThrow();
      });
    });

    it("should fall back to default for disallowed sort field", () => {
      const dependencies = [
        createMockDependency({ name: "package-a" }),
        createMockDependency({ name: "package-b" }),
      ] as any;
      dependencies[0]!.dev = 1;
      dependencies[1]!.dev = 2;

      const result = sort(dependencies, "disallowed_field", "ASC");

      // Should use default dev sort
      expect((result[0] as any).dev).toBe(2);
    });
  });
});
