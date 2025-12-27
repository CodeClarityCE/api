import { Injectable } from "@nestjs/common";
import {
  isNoneSeverity,
  isLowSeverity,
  isMediumSeverity,
  isHighSeverity,
  isCriticalSeverity,
} from "src/codeclarity_modules/results/utils/utils";
import {
  ConflictFlag,
  VulnerabilityMerged,
} from "src/codeclarity_modules/results/vulnerabilities/vulnerabilities.types";

/** OWASP Top 10 2021 category IDs mapped to filter names */
const OWASP_FILTER_MAP: Record<string, string> = {
  owasp_top_10_2021_a1: "1345",
  owasp_top_10_2021_a2: "1346",
  owasp_top_10_2021_a3: "1347",
  owasp_top_10_2021_a4: "1348",
  owasp_top_10_2021_a5: "1349",
  owasp_top_10_2021_a6: "1352",
  owasp_top_10_2021_a7: "1353",
  owasp_top_10_2021_a8: "1354",
  owasp_top_10_2021_a9: "1355",
  owasp_top_10_2021_a10: "1356",
};

@Injectable()
export class VulnerabilitiesFilterService {
  filter(
    vulnerabilities: VulnerabilityMerged[],
    searchKey: string | undefined,
    activeFilters: string[] | undefined,
  ): [VulnerabilityMerged[], Record<string, number>] {
    // Validation of input
    let searchkeySafe: string;
    let activeFiltersSafe: string[];
    const possibleFilters: string[] = [
      "owasp_top_10_2021_a1",
      "owasp_top_10_2021_a2",
      "owasp_top_10_2021_a3",
      "owasp_top_10_2021_a4",
      "owasp_top_10_2021_a5",
      "owasp_top_10_2021_a6",
      "owasp_top_10_2021_a7",
      "owasp_top_10_2021_a8",
      "owasp_top_10_2021_a9",
      "owasp_top_10_2021_a10",
      "owasp_uncategorized",
      "patchable",
      "partially_patchable",
      "not_patchable",
      "severity_critical",
      "severity_high",
      "severity_medium",
      "severity_low",
      "severity_none",
      "availability_impact",
      "confidentiality_impact",
      "integrity_impact",
      "hide_correct_matching",
      "hide_incorrect_matching",
      "hide_possibly_incorrect_matching",
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

    function filterBySearchKey(
      vulnerabilities: VulnerabilityMerged[],
    ): VulnerabilityMerged[] {
      if (searchKey === "") {
        return vulnerabilities;
      }

      const toReturn: VulnerabilityMerged[] = [];
      const searchKeyLower = searchkeySafe.toLocaleLowerCase();

      for (const vulnerability of vulnerabilities) {
        for (const affected of vulnerability.Affected) {
          if (
            affected.AffectedDependency?.toLocaleLowerCase().includes(
              searchKeyLower,
            )
          ) {
            toReturn.push(vulnerability);
            continue;
          }
        }
        if (
          vulnerability.Vulnerability?.toLocaleLowerCase().includes(
            searchKeyLower,
          )
        ) {
          toReturn.push(vulnerability);
          continue;
        }
      }

      return toReturn;
    }

    /** Check if vulnerability has a weakness matching the given OWASP ID */
    function hasOwaspId(
      vulnerability: VulnerabilityMerged,
      owaspId: string,
    ): boolean {
      return (
        vulnerability.Weaknesses?.some((w) => w.OWASPTop10Id === owaspId) ??
        false
      );
    }

    /** Check if vulnerability has any categorized OWASP weakness */
    function hasAnyCategorizedOwasp(
      vulnerability: VulnerabilityMerged,
    ): boolean {
      return (
        vulnerability.Weaknesses?.some((w) => w.OWASPTop10Id !== "") ?? false
      );
    }

    /** Check if vulnerability passes severity filter */
    function passesSeverityFilter(
      vulnerability: VulnerabilityMerged,
      filters: string[],
    ): boolean {
      if (
        filters.includes("severity_critical") &&
        !isCriticalSeverity(vulnerability.Severity.Severity)
      )
        return false;
      if (
        filters.includes("severity_high") &&
        !isHighSeverity(vulnerability.Severity.Severity)
      )
        return false;
      if (
        filters.includes("severity_medium") &&
        !isMediumSeverity(vulnerability.Severity.Severity)
      )
        return false;
      if (
        filters.includes("severity_low") &&
        !isLowSeverity(vulnerability.Severity.Severity)
      )
        return false;
      if (
        filters.includes("severity_none") &&
        !isNoneSeverity(vulnerability.Severity.Severity)
      )
        return false;
      return true;
    }

    /** Check if vulnerability passes impact filters */
    function passesImpactFilter(
      vulnerability: VulnerabilityMerged,
      filters: string[],
    ): boolean {
      const severity = vulnerability.Severity;
      if (
        filters.includes("availability_impact") &&
        (!severity?.AvailabilityImpact ||
          severity.AvailabilityImpact === "NONE")
      )
        return false;
      if (
        filters.includes("confidentiality_impact") &&
        (!severity?.ConfidentialityImpact ||
          severity.ConfidentialityImpact === "NONE")
      )
        return false;
      if (
        filters.includes("integrity_impact") &&
        (!severity?.IntegrityImpact || severity.IntegrityImpact === "NONE")
      )
        return false;
      return true;
    }

    /** Check if vulnerability passes conflict flag filters */
    function passesConflictFilter(
      vulnerability: VulnerabilityMerged,
      filters: string[],
    ): boolean {
      const flag = vulnerability.Conflict.ConflictFlag;
      if (
        filters.includes("hide_correct_matching") &&
        flag === ConflictFlag.MATCH_CORRECT
      )
        return false;
      if (
        filters.includes("hide_incorrect_matching") &&
        flag === ConflictFlag.MATCH_INCORRECT
      )
        return false;
      if (
        filters.includes("hide_possibly_incorrect_matching") &&
        flag === ConflictFlag.MATCH_POSSIBLE_INCORRECT
      )
        return false;
      return true;
    }

    /** Check if vulnerability passes OWASP filters */
    function passesOwaspFilter(
      vulnerability: VulnerabilityMerged,
      filters: string[],
    ): boolean {
      // Skip OWASP filtering if Weaknesses is null/undefined (original behavior)
      if (
        vulnerability.Weaknesses === null ||
        vulnerability.Weaknesses === undefined
      ) {
        return true;
      }
      // Check each OWASP category filter
      for (const [filterName, owaspId] of Object.entries(OWASP_FILTER_MAP)) {
        if (
          filters.includes(filterName) &&
          !hasOwaspId(vulnerability, owaspId)
        ) {
          return false;
        }
      }
      // Check uncategorized filter (exclude if has any categorized OWASP)
      if (
        filters.includes("owasp_uncategorized") &&
        hasAnyCategorizedOwasp(vulnerability)
      ) {
        return false;
      }
      return true;
    }

    function filterByOptions(
      vulnerabilities: VulnerabilityMerged[],
      filters: string[],
    ): VulnerabilityMerged[] {
      const toReturn: VulnerabilityMerged[] = [];

      for (const vulnerability of vulnerabilities) {
        if (!passesOwaspFilter(vulnerability, filters)) continue;
        if (!passesSeverityFilter(vulnerability, filters)) continue;
        if (!passesImpactFilter(vulnerability, filters)) continue;
        if (!passesConflictFilter(vulnerability, filters)) continue;

        toReturn.push(vulnerability);
      }

      return toReturn;
    }

    const filteredBySearchKey = filterBySearchKey(vulnerabilities);

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
}
