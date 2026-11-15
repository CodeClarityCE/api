import type { SbomDependency } from "src/codeclarity_modules/results/sbom/sbom.types";

function filter(
  dependencies: SbomDependency[],
  searchKey: string | undefined,
  activeFilters: string[] | undefined,
): [SbomDependency[], Record<string, number>] {
  // Validation of input
  let searchkeySafe: string;
  let activeFiltersSafe: string[];
  const possibleFilters: string[] = [
    "user_installed",
    "not_user_installed",
    "deprecated",
    "outdated",
    "unlicensed",
  ];

  if (searchKey === null || searchKey === undefined) {
    searchkeySafe = "";
  } else {
    searchkeySafe = searchKey.trim();
  }

  if (activeFilters === null || activeFilters === undefined) {
    activeFiltersSafe = [];
  } else {
    activeFiltersSafe = activeFilters;
  }

  function filterBySearchKey(dependencies: SbomDependency[]): SbomDependency[] {
    if (searchkeySafe === "") {
      return dependencies;
    }

    const toReturn = [];
    searchKey = searchkeySafe.toLocaleLowerCase();

    for (const dependency of dependencies) {
      if (dependency.name?.toLocaleLowerCase().includes(searchKey)) {
        toReturn.push(dependency);
        continue;
      }
      if (dependency.version?.toLocaleLowerCase().includes(searchKey)) {
        toReturn.push(dependency);
        continue;
      }
      // if (dependency.licenses !== null) {
      //     for (const license of dependency.licenses) {
      //         if (license.toLocaleLowerCase().includes(searchKey)) {
      //             toReturn.push(dependency);
      //             break;
      //         }
      //     }
      // }
    }

    return toReturn;
  }

  function filterByOptions(
    dependencies: SbomDependency[],
    filters: string[],
  ): SbomDependency[] {
    return dependencies.filter(
      (dependency) =>
        (!filters.includes("user_installed") ||
          dependency.is_direct_count > 0) &&
        (!filters.includes("not_user_installed") ||
          dependency.is_direct_count === 0) &&
        (!filters.includes("deprecated") || dependency.deprecated === true) &&
        (!filters.includes("outdated") ||
          (!!dependency.newest_release &&
            dependency.newest_release !== dependency.version)) &&
        (!filters.includes("unlicensed") || !dependency.license),
    );
  }

  const filteredBySearchKey = filterBySearchKey(dependencies);

  const counts: Record<string, number> = {};
  for (const filter of possibleFilters) {
    counts[filter] = filterByOptions(filteredBySearchKey, [
      filter,
      ...activeFiltersSafe,
    ]).length;
  }

  const filteredByOptions = filterByOptions(
    filteredBySearchKey,
    activeFiltersSafe,
  );

  return [filteredByOptions, counts];
}

export { filter };
