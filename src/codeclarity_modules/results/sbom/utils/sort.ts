import { gt, lt } from "semver";

import type { SbomDependency } from "src/codeclarity_modules/results/sbom/sbom.types";

function sort(
  dependencies: SbomDependency[],
  sortBy: string | undefined,
  sortDirection: string | undefined,
): SbomDependency[] {
  // Defaults
  const ALLOWED_SORT_BY = [
    "name",
    "version",
    "package_manager",
    "unlicensed",
    "deprecated",
    "outdated",
    "last_published",
    "user_installed",
    "release",
    "dev",
    "is_direct_count",
  ];
  const DEFAULT_SORT = "dev";
  const DEFAULT_SORT_DIRECTION = "desc";

  const mapping: Record<string, string> = {
    user_installed: "is_direct",
  };

  // Validation of input
  let sortBySafe: string;
  let sortDirectionSafe: string;

  if (
    sortBy === null ||
    sortBy === undefined ||
    !ALLOWED_SORT_BY.includes(sortBy)
  ) {
    sortBySafe = DEFAULT_SORT;
  } else {
    sortBySafe = sortBy;
  }

  const direction = sortDirection?.toUpperCase();
  if (direction !== "DESC" && direction !== "ASC") {
    sortDirectionSafe = DEFAULT_SORT_DIRECTION;
  } else {
    sortDirectionSafe = direction;
  }

  if (sortBySafe in mapping) {
    const mapped = mapping[sortBySafe];
    if (mapped !== undefined) {
      sortBySafe = mapped;
    }
  }

  // Sorting
  let sorted: SbomDependency[];

  if (
    sortBySafe === "unlicensed" ||
    sortBySafe === "deprecated" ||
    sortBySafe === "outdated" ||
    sortBySafe === "is_direct"
  ) {
    sorted = dependencies.sort((a: SbomDependency, b: SbomDependency) => {
      const aRecord = a as unknown as Record<string, unknown>;
      const bRecord = b as unknown as Record<string, unknown>;
      const aVal = (aRecord[sortBySafe] as boolean | undefined) ?? false;
      const bVal = (bRecord[sortBySafe] as boolean | undefined) ?? false;
      if (aVal > bVal) return sortDirectionSafe === "DESC" ? -1 : 1;
      if (aVal < bVal) return sortDirectionSafe === "DESC" ? 1 : -1;
      return 0;
    });
  } else if (sortBySafe === "last_published" || sortBySafe === "release") {
    sorted = dependencies.sort((a: SbomDependency, b: SbomDependency) => {
      const aRecord = a as unknown as Record<string, unknown>;
      const bRecord = b as unknown as Record<string, unknown>;
      const aDateStr = (aRecord[sortBySafe] as string | undefined) ?? "1970";
      const bDateStr = (bRecord[sortBySafe] as string | undefined) ?? "1970";
      const aDate = Date.parse(aDateStr) || Date.parse("1970");
      const bDate = Date.parse(bDateStr) || Date.parse("1970");
      if (aDate > bDate) return sortDirectionSafe === "DESC" ? -1 : 1;
      if (aDate < bDate) return sortDirectionSafe === "DESC" ? 1 : -1;
      return 0;
    });
  } else if (sortBySafe === "dev") {
    sorted = dependencies.sort((a: SbomDependency, b: SbomDependency) => {
      return Number(b.dev) - Number(a.dev);
    });

    if (sortDirectionSafe === "DESC") sorted.reverse();
  } else if (sortBySafe === "is_direct_count") {
    sorted = dependencies.sort((a: SbomDependency, b: SbomDependency) => {
      return b.is_direct_count - a.is_direct_count;
    });

    if (sortDirectionSafe === "DESC") sorted.reverse();
  } else if (sortBySafe === "version") {
    sorted = dependencies.sort((a: SbomDependency, b: SbomDependency) => {
      const versionA: string = a.version ?? "0.0.0";
      const versionB: string = b.version ?? "0.0.0";

      try {
        if (gt(versionA, versionB)) {
          return sortDirectionSafe === "DESC" ? -1 : 1;
        }
        if (lt(versionA, versionB)) {
          return sortDirectionSafe === "DESC" ? 1 : -1;
        }
        return 0;
      } catch (e) {
        console.error("error comparing versions:", e);
        return 0;
      }
    });
  } else {
    sorted = dependencies.sort((a: SbomDependency, b: SbomDependency) => {
      const aRecord = a as unknown as Record<string, unknown>;
      const bRecord = b as unknown as Record<string, unknown>;
      const aVal = (aRecord[sortBySafe] as string | undefined) ?? "";
      const bVal = (bRecord[sortBySafe] as string | undefined) ?? "";
      if (aVal > bVal) return sortDirectionSafe === "DESC" ? -1 : 1;
      if (aVal < bVal) return sortDirectionSafe === "DESC" ? 1 : -1;
      return 0;
    });
  }

  return sorted;
}

export { sort };
