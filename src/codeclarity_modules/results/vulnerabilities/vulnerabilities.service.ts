import { Injectable } from "@nestjs/common";

import { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import { AnalysesRepository } from "src/base_modules/shared/repositories";
import { CWERepository } from "src/codeclarity_modules/knowledge/cwe/cwe.repository";
import { EPSSRepository } from "src/codeclarity_modules/knowledge/epss/epss.repository";
import { GCVERepository } from "src/codeclarity_modules/knowledge/gcve/gcve.repository";
import { NVDRepository } from "src/codeclarity_modules/knowledge/nvd/nvd.repository";
import { OSVRepository } from "src/codeclarity_modules/knowledge/osv/osv.repository";
import { VulnerabilityPolicyService } from "src/codeclarity_modules/policies/vulnerability/vulnerability.service";
import { Dependency } from "src/codeclarity_modules/results/sbom/sbom.types";
import { StatusResponse } from "src/codeclarity_modules/results/status.types";
import { paginate } from "src/codeclarity_modules/results/utils/utils";
import {
  AffectedVuln,
  ConflictFlag,
  KnowledgeSnapshot,
  MaliciousPackageAdvisory,
  Output as VulnsOutput,
  Source,
  Vulnerability,
  VulnerabilityAnalysisStats,
  VulnerabilityMerged,
  VulnInfo,
} from "src/codeclarity_modules/results/vulnerabilities/vulnerabilities.types";
import { CodeClarityLogger } from "src/services/logger.service";
import { PaginatedResponse } from "src/types/apiResponses.types";
import { UnknownWorkspace } from "src/types/error.types";

import { AnalysisResultsService } from "../results.service";
import { SbomUtilsService } from "../sbom/utils/utils";

import { VulnerabilitiesFilterService } from "./utils/filter.service";
import { findFindingAdvisory } from "./utils/finding-advisory";
import { VulnerabilitiesSortService } from "./utils/sort.service";
import { computeVulnerabilityStats } from "./utils/stats";
import { VulnerabilitiesUtilsService } from "./utils/utils.service";

/** NVD vulnerability description entry */
interface NvdDescription {
  lang: string;
  value: string;
}

/** OSV affected entry with version/range information */
interface OsvAffected {
  ranges?: unknown[];
  versions?: unknown[];
}

/** Analysis config structure for vuln-finder */
interface VulnFinderConfig {
  vulnerabilityPolicy?: string[];
}

/** Analysis config record type */
interface AnalysisConfig {
  "vuln-finder"?: VulnFinderConfig;
}

/** Check if conflict flag indicates no conflict (including empty string from malformed data) */
function isNoConflict(flag: ConflictFlag | string): boolean {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
  return flag === ConflictFlag.NO_CONFLICT || flag === "";
}

/** The AI assessment of a match, or null when it has no score. */
function scoredVlai(
  vuln: unknown,
): { Score: string; Confidence: number } | null {
  if (!vuln || typeof vuln !== "object" || !("Vlai_score" in vuln)) {
    return null;
  }
  const { Vlai_score, Vlai_confidence } = vuln as VulnInfo;
  if (Vlai_score === null || Vlai_score === undefined) return null;
  const score = String(Vlai_score);
  if (score.trim() === "") return null;
  return { Score: score, Confidence: Number(Vlai_confidence) };
}

@Injectable()
export class VulnerabilitiesService {
  private readonly logger = CodeClarityLogger.forService("Vulnerabilities");

  constructor(
    private readonly analysisResultsService: AnalysisResultsService,
    private readonly findingsUtilsService: VulnerabilitiesUtilsService,
    private readonly findingsSortService: VulnerabilitiesSortService,
    private readonly findingsFilterService: VulnerabilitiesFilterService,
    private readonly sbomUtilsService: SbomUtilsService,
    private readonly osvRepository: OSVRepository,
    private readonly nvdRepository: NVDRepository,
    private readonly cweRepository: CWERepository,
    private readonly epssRepository: EPSSRepository,
    private readonly gcveRepository: GCVERepository,
    private readonly vulnerabilityPolicyService: VulnerabilityPolicyService,
    private readonly analysesRepository: AnalysesRepository,
  ) {}

  async getStats(
    orgId: string,
    projectId: string,
    analysisId: string,
    user: AuthenticatedUser,
    workspace: string,
    ecosystem_filter?: string,
    show_blacklisted?: boolean,
  ): Promise<VulnerabilityAnalysisStats> {
    // Check if the user is allowed to view this analysis result
    await this.analysisResultsService.checkAccess(
      orgId,
      projectId,
      analysisId,
      user,
    );

    const { mergedSbom } =
      await this.sbomUtilsService.getMergedSbomResults(analysisId);

    if (!(workspace in mergedSbom.workspaces)) {
      throw new UnknownWorkspace();
    }

    const findings: Vulnerability[] =
      await this.findingsUtilsService.getFindingsData(
        analysisId,
        workspace,
        ecosystem_filter,
      );

    const { findings: findingsPrevious, dependencies: dependencyMapPrevious } =
      await this.getPreviousScan(
        projectId,
        analysisId,
        workspace,
        ecosystem_filter,
      );

    // Both scans drop this analysis's policy exclusions, so the diffs compare like with like.
    let findingsArray = findings;
    let findingsArrayPrevious = findingsPrevious;
    if (show_blacklisted === false) {
      const { vulnerabilities: excluded } =
        await this.getBlacklistedVulnerabilities(analysisId, orgId, user);
      const kept = (finding: Vulnerability): boolean =>
        !excluded.has(finding.VulnerabilityId);
      findingsArray = findings.filter(kept);
      findingsArrayPrevious = findingsPrevious.filter(kept);
    }

    const wStats = computeVulnerabilityStats(
      findingsArray,
      mergedSbom.workspaces[workspace]!.dependencies,
    );
    const wBeforeStats = computeVulnerabilityStats(
      findingsArrayPrevious,
      dependencyMapPrevious,
    );

    wStats.number_of_vulnerabilities_diff =
      wStats.number_of_vulnerabilities - wBeforeStats.number_of_vulnerabilities;
    wStats.number_of_vulnerable_dependencies_diff =
      wStats.number_of_vulnerable_dependencies -
      wBeforeStats.number_of_vulnerable_dependencies;
    wStats.number_of_direct_vulnerabilities_diff =
      wStats.number_of_direct_vulnerabilities -
      wBeforeStats.number_of_direct_vulnerabilities;
    wStats.number_of_transitive_vulnerabilities_diff =
      wStats.number_of_transitive_vulnerabilities -
      wBeforeStats.number_of_transitive_vulnerabilities;
    wStats.mean_severity_diff =
      wStats.mean_severity - wBeforeStats.mean_severity;
    wStats.max_severity_diff = wStats.max_severity - wBeforeStats.max_severity;
    wStats.number_of_owasp_top_10_2021_a1_diff =
      wStats.number_of_owasp_top_10_2021_a1 -
      wBeforeStats.number_of_owasp_top_10_2021_a1;
    wStats.number_of_owasp_top_10_2021_a2_diff =
      wStats.number_of_owasp_top_10_2021_a2 -
      wBeforeStats.number_of_owasp_top_10_2021_a2;
    wStats.number_of_owasp_top_10_2021_a3_diff =
      wStats.number_of_owasp_top_10_2021_a3 -
      wBeforeStats.number_of_owasp_top_10_2021_a3;
    wStats.number_of_owasp_top_10_2021_a4_diff =
      wStats.number_of_owasp_top_10_2021_a4 -
      wBeforeStats.number_of_owasp_top_10_2021_a4;
    wStats.number_of_owasp_top_10_2021_a5_diff =
      wStats.number_of_owasp_top_10_2021_a5 -
      wBeforeStats.number_of_owasp_top_10_2021_a5;
    wStats.number_of_owasp_top_10_2021_a6_diff =
      wStats.number_of_owasp_top_10_2021_a6 -
      wBeforeStats.number_of_owasp_top_10_2021_a6;
    wStats.number_of_owasp_top_10_2021_a7_diff =
      wStats.number_of_owasp_top_10_2021_a7 -
      wBeforeStats.number_of_owasp_top_10_2021_a7;
    wStats.number_of_owasp_top_10_2021_a8_diff =
      wStats.number_of_owasp_top_10_2021_a8 -
      wBeforeStats.number_of_owasp_top_10_2021_a8;
    wStats.number_of_owasp_top_10_2021_a9_diff =
      wStats.number_of_owasp_top_10_2021_a9 -
      wBeforeStats.number_of_owasp_top_10_2021_a9;
    wStats.number_of_owasp_top_10_2021_a10_diff =
      wStats.number_of_owasp_top_10_2021_a10 -
      wBeforeStats.number_of_owasp_top_10_2021_a10;
    wStats.number_of_critical_diff =
      wStats.number_of_critical - wBeforeStats.number_of_critical;
    wStats.number_of_high_diff =
      wStats.number_of_high - wBeforeStats.number_of_high;
    wStats.number_of_medium_diff =
      wStats.number_of_medium - wBeforeStats.number_of_medium;
    wStats.number_of_low_diff =
      wStats.number_of_low - wBeforeStats.number_of_low;
    wStats.number_of_none_diff =
      wStats.number_of_none - wBeforeStats.number_of_none;
    wStats.mean_availability_impact_diff =
      wStats.mean_availability_impact - wBeforeStats.mean_availability_impact;
    wStats.mean_integrity_impact_diff =
      wStats.mean_integrity_impact - wBeforeStats.mean_integrity_impact;
    wStats.mean_confidentiality_impact_diff =
      wStats.mean_confidentiality_impact -
      wBeforeStats.mean_confidentiality_impact;

    return wStats;
  }

  async getMaliciousPackageAdvisories(
    orgId: string,
    projectId: string,
    analysisId: string,
    user: AuthenticatedUser,
    workspace: string,
  ): Promise<MaliciousPackageAdvisory[]> {
    await this.analysisResultsService.checkAccess(
      orgId,
      projectId,
      analysisId,
      user,
    );

    return await this.findingsUtilsService.getMaliciousPackageAdvisories(
      analysisId,
      workspace,
    );
  }

  async getKnowledgeSnapshot(
    orgId: string,
    projectId: string,
    analysisId: string,
    user: AuthenticatedUser,
  ): Promise<KnowledgeSnapshot | null> {
    await this.analysisResultsService.checkAccess(
      orgId,
      projectId,
      analysisId,
      user,
    );

    return await this.findingsUtilsService.getKnowledgeSnapshot(analysisId);
  }

  // eslint-disable-next-line max-params, complexity
  async getVulnerabilities(
    orgId: string,
    projectId: string,
    analysisId: string,
    user: AuthenticatedUser,
    workspace: string,
    page: number | undefined,
    entries_per_page: number | undefined,
    sort_by: string | undefined,
    sort_direction: string | undefined,
    active_filters_string: string | undefined,
    search_key: string | undefined,
    ecosystem_filter?: string,
    show_blacklisted?: boolean,
  ): Promise<PaginatedResponse> {
    // Check if the user is allowed to view this analysis result
    await this.analysisResultsService.checkAccess(
      orgId,
      projectId,
      analysisId,
      user,
    );

    let active_filters: string[] = [];
    if (active_filters_string !== null && active_filters_string !== undefined)
      active_filters = active_filters_string
        .replace("[", "")
        .replace("]", "")
        .split(",");

    // GET SBOM DATA
    // const dependenciesArray: Dependency[] = await getSbomData(analysisId, workspace);
    // const dependenciesMap: { [key: string]: Dependency } = {};
    // for (const dep of dependenciesArray) {
    //     dependenciesMap[dep.key] = dep;
    // }
    const findings: Vulnerability[] =
      await this.findingsUtilsService.getFindingsData(
        analysisId,
        workspace,
        ecosystem_filter,
      );

    const findingsMerged: Map<string, VulnerabilityMerged> = new Map<
      string,
      VulnerabilityMerged
    >();
    // For each finding
    for (const finding of findings) {
      const affected: AffectedVuln = {
        Sources: finding.Sources,
        AffectedDependency: finding.AffectedDependency,
        AffectedVersion: finding.AffectedVersion,
        VulnerabilityId: finding.VulnerabilityId,
        OSVMatch: finding.OSVMatch,
        NVDMatch: finding.NVDMatch,
        Severity: finding.Severity,
        Conflict: finding.Conflict,
      };
      if (finding.GCVEMatch) {
        affected.GCVEMatch = finding.GCVEMatch;
      }
      if (finding.Weaknesses) {
        affected.Weaknesses = finding.Weaknesses;
      }
      if (finding.PatchType) {
        affected.PatchType = finding.PatchType;
      }
      // if vuln already in map
      const vuln = findingsMerged.get(finding.VulnerabilityId);
      if (vuln) {
        vuln.Affected.push(affected);
        // A grouped vulnerability lists every matching source and its worst severity.
        for (const source of finding.Sources) {
          if (!vuln.Sources.includes(source)) vuln.Sources.push(source);
        }
        if (
          (finding.Severity?.Severity ?? 0) > (vuln.Severity?.Severity ?? 0)
        ) {
          vuln.Severity = finding.Severity;
        }
        findingsMerged.set(finding.VulnerabilityId, vuln);
      } else {
        const epss = await this.epssRepository.getByCVE(
          finding.VulnerabilityId,
        );
        const mergedFinding: VulnerabilityMerged = {
          Id: finding.Id,
          Sources: [...finding.Sources],
          Vulnerability: finding.VulnerabilityId,
          Severity: finding.Severity,
          Affected: [affected],
          Description: "",
          Conflict: finding.Conflict,
          VLAI: [],
          EPSS: {
            Score: epss.score,
            Percentile: epss.percentile,
          },
        };
        if (finding.Weaknesses) {
          mergedFinding.Weaknesses = finding.Weaknesses;
        }
        for (const [source, match] of [
          [Source.Nvd, finding.NVDMatch],
          [Source.Osv, finding.OSVMatch],
          [Source.Gcve, finding.GCVEMatch],
        ] as const) {
          const vlai = scoredVlai(match?.Vulnerability);
          if (vlai) mergedFinding.VLAI.push({ Source: source, ...vlai });
        }

        // Check for source disagreements
        // For PHP vulnerabilities, the OSVMatch is often missing even when OSV data exists
        // So we check if both NVD data exists and it's a CVE (which likely has OSV data)
        const isCve = finding.VulnerabilityId.includes("CVE-");

        if (
          finding.NVDMatch &&
          isCve &&
          isNoConflict(mergedFinding.Conflict.ConflictFlag)
        ) {
          // For CVEs with NVD data, assume potential source disagreement
          // This is a workaround for the OSV matching issue in PHP vulnerabilities
          mergedFinding.Conflict.ConflictFlag =
            ConflictFlag.MATCH_POSSIBLE_INCORRECT;
        }

        findingsMerged.set(finding.VulnerabilityId, mergedFinding);
      }
    }

    // Get blacklisted vulnerabilities from policies
    const { vulnerabilities: blacklistedVulns, policies: policyNames } =
      await this.getBlacklistedVulnerabilities(analysisId, orgId, user);

    // Mark blacklisted vulnerabilities and apply filtering
    const allFindings = Array.from(findingsMerged.values()).map((finding) => {
      const isBlacklisted = blacklistedVulns.has(finding.Vulnerability);
      const policyName = policyNames.get(finding.Vulnerability);
      const blacklistedByPolicies =
        isBlacklisted && policyName ? [policyName] : [];

      return {
        ...finding,
        is_blacklisted: isBlacklisted,
        blacklisted_by_policies: blacklistedByPolicies,
      };
    });

    // Filter out blacklisted vulnerabilities if show_blacklisted is false
    const findingsToProcess =
      show_blacklisted === false
        ? allFindings.filter((finding) => !finding.is_blacklisted)
        : allFindings;

    const [filtered, filterCount] = this.findingsFilterService.filter(
      findingsToProcess,
      search_key,
      active_filters,
    );

    const sorted = this.findingsSortService.sort(
      filtered,
      sort_by,
      sort_direction,
    );

    const paginated = paginate<VulnerabilityMerged>(
      sorted,
      filtered.length,
      { currentPage: page, entriesPerPage: entries_per_page },
      { maxEntriesPerPage: 100, defaultEntriesPerPage: 20 },
    );

    paginated.filter_count = filterCount;

    let paginatedVulns: VulnerabilityMerged[] = [];

    if (paginated.data) {
      paginatedVulns = paginated.data;
    }

    const packageManager = await this.getPackageManagerSafe(analysisId);

    // Attach additional info
    for (const finding of paginatedVulns) {
      // Attach vulnerability description
      const isCve = finding.Vulnerability.includes("CVE-");
      const isGhsa = finding.Vulnerability.includes("GHSA-");

      let nvdDescription = "";
      let osvDescription = "";
      let osvSummary = "";
      let nvdVuln = null;
      let osvVuln = null;

      if (isCve) {
        nvdVuln = await this.nvdRepository.getVulnWithoutFailing(
          finding.Vulnerability,
          { includeRetired: true },
        );

        if (nvdVuln) {
          const descriptions = nvdVuln.descriptions as
            NvdDescription[] | undefined;
          nvdDescription = descriptions?.[0]?.value ?? "";
        }

        // Describe the finding with the first affected package's advisory, as its report does.
        const affected = finding.Affected[0];
        osvVuln = await findFindingAdvisory(
          this.osvRepository,
          {
            vulnerabilityId: finding.Vulnerability,
            affectedDependency: affected?.AffectedDependency ?? "",
            packageManager,
            osvMatch: affected?.OSVMatch,
          },
          { includeRetired: true },
        );

        if (osvVuln) {
          osvDescription = osvVuln.details;
          osvSummary = osvVuln.summary;
        }
      }

      if (isGhsa) {
        osvVuln = await this.osvRepository.getVulnByOSVIDWithoutFailing(
          finding.Vulnerability,
          { includeRetired: true },
        );

        if (osvVuln) {
          osvDescription = osvVuln.details;
          osvSummary = osvVuln.summary;
        }
      }

      // Fetch GCVE data from knowledge DB to add VLAI
      if (isCve) {
        const gcveVuln = await this.gcveRepository.getVulnByCVEId(
          finding.Vulnerability,
          { includeRetired: true },
        );
        if (gcveVuln) {
          // Add VLAI score if available and not already present
          if (
            gcveVuln.vlai_score &&
            !finding.VLAI.some((v) => v.Source === Source.Gcve)
          ) {
            finding.VLAI.push({
              Source: Source.Gcve,
              Score: gcveVuln.vlai_score,
              Confidence: gcveVuln.vlai_confidence ?? 0,
            });
          }
        }
      }

      // Check for source disagreements when both NVD and OSV data exist
      if (nvdVuln && osvVuln && isNoConflict(finding.Conflict.ConflictFlag)) {
        // Check if OSV has specific version/range data
        const affected = osvVuln.affected as OsvAffected[] | undefined;
        const osvHasRanges = affected?.some(
          (a) => (a.ranges?.length ?? 0) > 0 || (a.versions?.length ?? 0) > 0,
        );

        // When OSV has specific version data and both sources exist,
        // mark as potential disagreement since they often have different interpretations
        if (osvHasRanges) {
          finding.Conflict.ConflictFlag = ConflictFlag.MATCH_POSSIBLE_INCORRECT;
        }
      }

      if (osvDescription === "" && nvdDescription !== "")
        finding.Description = nvdDescription;
      else {
        if (osvSummary.length > 0) {
          osvSummary = osvSummary.charAt(0).toUpperCase() + osvSummary.slice(1);
        }
        if (osvDescription.length > 0) {
          osvDescription = this.cleanOsvDescription(osvDescription);
          osvDescription =
            osvDescription.charAt(0).toUpperCase() + osvDescription.slice(1);
          if (
            !osvDescription.endsWith(".") &&
            !osvDescription.endsWith("```")
          ) {
            osvDescription += ".";
          }
        }
        finding.Description = `#### ${osvSummary}.\n\n${osvDescription}`;
      }

      // Attach weakness info
      if (finding.Weaknesses) {
        for (const weakness of finding.Weaknesses) {
          const cwe = await this.cweRepository.getCWEWithoutFailing(
            weakness.WeaknessId.replace("CWE-", ""),
          );

          if (cwe) {
            weakness.WeaknessName = cwe.name;
            weakness.WeaknessDescription = cwe.description;
            weakness.WeaknessExtendedDescription = cwe.extended_description;
          } else {
            weakness.WeaknessName = "";
            weakness.WeaknessDescription = "";
            weakness.WeaknessExtendedDescription = "";
          }
        }
      }

      // for (const affected of finding.Affected) {
      //     const parentGraph: Array<string> = await getImportPaths(
      //         dependenciesMap,
      //         affected.AffectedDependency,
      //         '',
      //         new Array<string>(),
      //         new Set<string>()
      //     );

      //     if (affected.AffectedDependencyObject) {
      //         affected.AffectedDependencyFilePath =
      //             affected.AffectedDependencyObject.file_path;
      //         affected.AffectedDependencyImportPaths = parentGraph;
      //         affected.AffectedDependencyName = affected.AffectedDependencyObject.name;
      //         affected.AffectedDependencyVersion = affected.AffectedDependencyObject.version;
      //     }
      //     // Purging data not needed by the client
      //     delete affected.AffectedDependencyObject;
      // }
    }

    paginated.data = paginatedVulns;
    return paginated;
  }

  // Package manager of the analysis's SBOMs, or undefined when they cannot be read.
  private async getPackageManagerSafe(
    analysisId: string,
  ): Promise<string | undefined> {
    try {
      const { mergedSbom } =
        await this.sbomUtilsService.getMergedSbomResults(analysisId);
      return mergedSbom.analysis_info?.package_manager;
    } catch {
      return undefined;
    }
  }

  async getStatus(
    orgId: string,
    projectId: string,
    analysisId: string,
    user: AuthenticatedUser,
  ): Promise<StatusResponse> {
    // Check if the user is allowed to view this analysis result
    await this.analysisResultsService.checkAccess(
      orgId,
      projectId,
      analysisId,
      user,
    );

    const vulnsOutput: VulnsOutput =
      await this.findingsUtilsService.getVulnsResult(analysisId);

    if (vulnsOutput.analysis_info.private_errors.length) {
      return {
        stage_start: vulnsOutput.analysis_info.analysis_start_time,
        stage_end: vulnsOutput.analysis_info.analysis_end_time,
        public_errors: vulnsOutput.analysis_info.public_errors,
        private_errors: vulnsOutput.analysis_info.private_errors,
      };
    }
    return {
      stage_start: vulnsOutput.analysis_info.analysis_start_time,
      stage_end: vulnsOutput.analysis_info.analysis_end_time,
    };
  }

  private cleanOsvDescription(description: string): string {
    const sections = [];
    let parsingHeader = false;
    let text = "";

    for (const char of description) {
      if (char === "#" && parsingHeader === false) {
        if (text !== "") sections.push(text);
        parsingHeader = true;
        text = "";
        continue;
      }

      if (char !== "#") parsingHeader = false;

      if (char !== "#") text += char;
    }

    if (text !== "") {
      sections.push(text);
    }

    const selectedSections = [];

    let index = -1;
    for (const section of sections) {
      index += 1;
      if (index === 0) {
        selectedSections.push(section);
        continue;
      }
      if (section.includes("```")) {
        selectedSections.push(section);
        continue;
      }
    }

    if (selectedSections.length > 0) {
      let newSection = "";
      const section = selectedSections[selectedSections.length - 1]!;
      let trimEndNewLines = true;
      for (let i = section.length - 1; i >= 0; i--) {
        if (section[i] !== "\n") {
          trimEndNewLines = false;
        }
        if (!trimEndNewLines) {
          newSection += section[i]!;
        }
      }
      selectedSections[selectedSections.length - 1] = newSection
        .split("")
        .reverse()
        .join("");
    }

    return selectedSections.join("\n");
  }

  /** Load the previous completed scan, or nothing if it cannot be read. */
  private async getPreviousScan(
    projectId: string,
    analysisId: string,
    workspace: string,
    ecosystem_filter?: string,
  ): Promise<{
    findings: Vulnerability[];
    dependencies: Record<string, Record<string, Dependency>>;
  }> {
    try {
      const previous =
        await this.analysesRepository.getPreviousCompletedAnalysis(
          projectId,
          analysisId,
        );
      if (previous) {
        const { mergedSbom } = await this.sbomUtilsService.getMergedSbomResults(
          previous.id,
        );
        const previousWorkspace = mergedSbom.workspaces[workspace];
        if (previousWorkspace) {
          const findings = await this.findingsUtilsService.getFindingsData(
            previous.id,
            workspace,
            ecosystem_filter,
          );
          return { findings, dependencies: previousWorkspace.dependencies };
        }
      }
    } catch (err) {
      this.logger.warn("Could not load the previous scan for comparison", {
        projectId,
        analysisId,
        error: (err as Error).message,
      });
    }
    return { findings: [], dependencies: {} };
  }

  /**
   * Get blacklisted vulnerabilities from analysis configuration
   */
  private async getBlacklistedVulnerabilities(
    analysisId: string,
    orgId: string,
    user: AuthenticatedUser,
  ): Promise<{ vulnerabilities: Set<string>; policies: Map<string, string> }> {
    try {
      // Get the analysis to access its configuration
      const analysis =
        await this.analysesRepository.getAnalysisById(analysisId);

      if (!analysis.config || typeof analysis.config !== "object") {
        return { vulnerabilities: new Set(), policies: new Map() };
      }

      // Extract vulnerability policies from vuln-finder configuration
      const config = analysis.config as AnalysisConfig;
      const vulnFinderConfig = config["vuln-finder"];
      if (
        !vulnFinderConfig?.vulnerabilityPolicy ||
        !Array.isArray(vulnFinderConfig.vulnerabilityPolicy)
      ) {
        return { vulnerabilities: new Set(), policies: new Map() };
      }

      const policyIds = vulnFinderConfig.vulnerabilityPolicy.filter(
        (id): id is string => typeof id === "string" && id.trim() !== "",
      );
      if (policyIds.length === 0) {
        return { vulnerabilities: new Set(), policies: new Map() };
      }

      // Fetch all vulnerability policies using the unified policy table
      const blacklistedVulns = new Set<string>();
      const policyNames = new Map<string, string>();

      for (const policyId of policyIds) {
        await this.fetchPolicyVulnerabilities(
          orgId,
          policyId,
          user,
          blacklistedVulns,
          policyNames,
        );
      }

      return { vulnerabilities: blacklistedVulns, policies: policyNames };
    } catch (err) {
      this.logger.warn("Could not read the analysis vulnerability policies", {
        analysisId,
        error: (err as Error).message,
      });
      return { vulnerabilities: new Set(), policies: new Map() };
    }
  }

  /**
   * Fetch vulnerabilities from a single policy and add to the sets
   */
  private async fetchPolicyVulnerabilities(
    orgId: string,
    policyId: string,
    user: AuthenticatedUser,
    blacklistedVulns: Set<string>,
    policyNames: Map<string, string>,
  ): Promise<void> {
    try {
      // Get policy directly from the unified policy table
      // The caller already has access to the analysis, so it may read the org's policies.
      const policy = await this.vulnerabilityPolicyService.get(
        orgId,
        policyId,
        user,
      );
      if (policy?.content && Array.isArray(policy.content)) {
        for (const vuln of policy.content) {
          blacklistedVulns.add(vuln);
          policyNames.set(vuln, policy.name);
        }
      }
    } catch (err) {
      // Skip invalid policy IDs
      this.logger.warn("Could not fetch a vulnerability policy", {
        policyId,
        error: (err as Error).message,
      });
    }
  }
}
