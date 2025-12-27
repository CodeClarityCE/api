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
    "vulnerable",
    "not_vulnerable",
    "severity_critical",
    "severity_high",
    "severity_medium",
    "severity_low",
    "severity_none",
  ];

  if (searchKey === null || searchKey === undefined) {
    searchkeySafe = "";
  } else {
    searchkeySafe = searchKey;
  }

  if (activeFilters === null || activeFilters === undefined) {
    activeFiltersSafe = [];
  } else {
    activeFiltersSafe = activeFilters;
  }

  function filterBySearchKey(dependencies: SbomDependency[]): SbomDependency[] {
    if (searchKey === "") {
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
    _filters: string[],
  ): SbomDependency[] {
    const toReturn = [];

    for (const dependency of dependencies) {
      // if (filters.includes('user_installed')) {
      //     if (!dependency.is_direct) continue;
      // }
      // if (filters.includes('not_user_installed')) {
      //     if (!(dependency.is_transitive && !dependency.is_direct)) continue;
      // }
      // if (filters.includes('deprecated')) {
      //     if (!dependency.deprecated) continue;
      // }
      // if (filters.includes('outdated')) {
      //     if (!dependency.outdated) continue;
      // }
      // if (filters.includes('unlicensed')) {
      //     if (dependency.licenses !== null && dependency.licenses.length > 0) continue;
      // }
      // if (filters.includes('vulnerable')) {
      //     if (!dependency.vulnerable) continue;
      // }
      // if (filters.includes('not_vulnerable')) {
      //     if (dependency.vulnerable) continue;
      // }
      // if (filters.includes('severity_critical')) {
      //     if (dependency.severity_dist === null || dependency.severity_dist.critical === 0)
      //         continue;
      // }
      // if (filters.includes('severity_high')) {
      //     if (dependency.severity_dist === null || dependency.severity_dist.high === 0)
      //         continue;
      // }
      // if (filters.includes('severity_medium')) {
      //     if (dependency.severity_dist === null || dependency.severity_dist.medium === 0)
      //         continue;
      // }
      // if (filters.includes('severity_low')) {
      //     if (dependency.severity_dist === null || dependency.severity_dist.low === 0) continue;
      // }
      // if (filters.includes('severity_none')) {
      //     if (dependency.severity_dist === null || dependency.severity_dist.none === 0)
      //         continue;
      // }
      toReturn.push(dependency);
    }

    return toReturn;
  }

  const filteredBySearchKey = filterBySearchKey(dependencies);

  const counts: Record<string, number> = {};
  for (const filter of possibleFilters) {
    if (filter in activeFiltersSafe) continue;
    const filters = [filter];
    for (const filter of activeFiltersSafe) {
      filters.push(filter);
    }
    counts[filter] = filterByOptions(filteredBySearchKey, filters).length;
  }

  const filteredByOptions = filterByOptions(
    filteredBySearchKey,
    activeFiltersSafe,
  );

  return [filteredByOptions, counts];
}

export { filter };
