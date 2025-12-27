// import { getVersionsSatisfyingConstraint } from 'src/codeclarity_modules/results/utils/utils';
import { Injectable } from "@nestjs/common";
import { satisfies } from "semver";
import {
  CVSS2,
  CVSS3,
  CVSS31,
} from "src/codeclarity_modules/knowledge/cvss.types";
import { CWERepository } from "src/codeclarity_modules/knowledge/cwe/cwe.repository";
import { FriendsOfPhp } from "src/codeclarity_modules/knowledge/friendsofphp/friendsofphp.entity";
import { NVD } from "src/codeclarity_modules/knowledge/nvd/nvd.entity";
import { NVDRepository } from "src/codeclarity_modules/knowledge/nvd/nvd.repository";
import { OSV } from "src/codeclarity_modules/knowledge/osv/osv.entity";
import { OSVRepository } from "src/codeclarity_modules/knowledge/osv/osv.repository";
import { OWASPRepository } from "src/codeclarity_modules/knowledge/owasp/owasp.repository";
import { OwaspTop10Info } from "src/codeclarity_modules/knowledge/owasp/owasp.types";
import { Version } from "src/codeclarity_modules/knowledge/package/package.entity";
import { PackageRepository } from "src/codeclarity_modules/knowledge/package/package.repository";
import { VersionsRepository } from "src/codeclarity_modules/knowledge/package/packageVersions.repository";
import { PatchInfo } from "src/codeclarity_modules/results/patching/patching.types";
import { Dependency } from "src/codeclarity_modules/results/sbom/sbom.types";
import {
  Vulnerability,
  AffectedInfo,
  AffectedRange,
  VulnerabilityDetailsReport,
  VulnerabilityInfoReport,
  VulnerableVersionInfoReport,
  DependencyInfoReport,
  CommonConsequencesInfo,
  WeaknessInfoReport,
  ReferenceInfo,
  SeverityInfo,
  OtherInfo,
} from "src/codeclarity_modules/results/vulnerabilities/vulnerabilities.types";

// Type definitions for NVD affected data structure
interface NVDAffectedSource {
  versionEndExcluding?: string;
  versionStartIncluding?: string;
  versionStartExcluding?: string;
  versionEndIncluding?: string;
  criteriaDict?: {
    version?: string;
    product?: string;
    vendor?: string;
    [key: string]: unknown;
  };
}

interface NVDAffectedEntry {
  sources?: NVDAffectedSource[];
  [key: string]: unknown;
}

// Type definitions for OSV affected data structure
interface OSVEvent {
  introduced?: string;
  fixed?: string;
  last_affected?: string;
  [key: string]: unknown;
}

interface OSVRange {
  events?: OSVEvent[];
  [key: string]: unknown;
}

interface OSVAffectedEntry {
  versions?: unknown[];
  ranges?: OSVRange[];
  package?: {
    name?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

// Type definitions for NVD metrics structure
interface NVDCVSSData {
  vectorString: string;
  [key: string]: unknown;
}

interface NVDCVSSMetric {
  source: string;
  cvssData: NVDCVSSData;
  userInteractionRequired?: boolean;
  [key: string]: unknown;
}

interface NVDMetrics {
  cvssMetricV2?: NVDCVSSMetric[];
  cvssMetricV30?: NVDCVSSMetric[];
  cvssMetricV31?: NVDCVSSMetric[];
  [key: string]: unknown;
}

// Type definitions for OSV severity structure
interface OSVSeverity {
  type: "CVSS_V2" | "CVSS_V3";
  score: string;
  [key: string]: unknown;
}

// Type definitions for OSV reference structure
interface OSVReference {
  url: string;
  type: string;
  [key: string]: unknown;
}

// Type definitions for NVD description structure
interface NVDDescription {
  lang: string;
  value: string;
  [key: string]: unknown;
}

// Type definitions for NVD reference structure
interface NVDReference {
  url: string;
  [key: string]: unknown;
}

abstract class BaseReportGenerator {
  patchesData!: PatchInfo;
  vulnsData!: Vulnerability;
  dependencyData?: Dependency;
  versions!: Version[];
  packageManager!: string;
  osvItem?: OSV;
  nvdItem?: NVD;

  readonly versionsRepository: VersionsRepository;
  readonly osvRepository: OSVRepository;
  readonly nvdRepository: NVDRepository;
  readonly cweRepository: CWERepository;
  readonly packageRepository: PackageRepository;
  readonly owaspRepository: OWASPRepository;

  constructor(
    versionsRepository: VersionsRepository,
    osvRepository: OSVRepository,
    nvdRepository: NVDRepository,
    cweRepository: CWERepository,
    packageRepository: PackageRepository,
    owaspRepository: OWASPRepository,
  ) {
    this.versionsRepository = versionsRepository;
    this.osvRepository = osvRepository;
    this.nvdRepository = nvdRepository;
    this.cweRepository = cweRepository;
    this.packageRepository = packageRepository;
    this.owaspRepository = owaspRepository;
  }

  async getVulnerableVersionsString(source: string): Promise<string> {
    // Debug logging to understand data structure
    console.warn("🔍 getVulnerableVersionsString debug:", {
      source,
      vulnId: this.vulnsData.VulnerabilityId,
      affectedDep: this.vulnsData.AffectedDependency,
      affectedVer: this.vulnsData.AffectedVersion,
      hasOSVMatch: !!this.vulnsData.OSVMatch,
      hasNVDMatch: !!this.vulnsData.NVDMatch,
      osvAffectedInfo: this.vulnsData.OSVMatch?.AffectedInfo?.length ?? 0,
      nvdAffectedInfo: this.vulnsData.NVDMatch?.AffectedInfo?.length ?? 0,
    });

    // First try to get affected versions from the actual vulnerability data
    const directVersions = await this.getDirectAffectedVersions(source);
    if (directVersions) {
      return directVersions;
    }

    // Fallback to using AffectedInfo from vulnerability analysis results
    const affectedData = this.getAffectedDataBySource(source);
    const affectedStringParts = this.buildAffectedStringParts(affectedData);

    // Final fallback for framework vulnerabilities without proper AffectedInfo
    const isFramework =
      this.vulnsData.AffectedDependency?.startsWith("framework-");
    if (
      affectedStringParts.length === 0 &&
      isFramework &&
      this.vulnsData.AffectedVersion
    ) {
      return `${this.vulnsData.AffectedVersion} (check advisory for details)`;
    }

    return affectedStringParts.join(" || ");
  }

  private getAffectedDataBySource(source: string): AffectedInfo {
    if (source === "NVD") {
      if (
        this.vulnsData.NVDMatch?.AffectedInfo &&
        this.vulnsData.NVDMatch.AffectedInfo.length > 0
      ) {
        return this.vulnsData.NVDMatch.AffectedInfo[0]!;
      }
    } else {
      if (
        this.vulnsData.OSVMatch?.AffectedInfo &&
        this.vulnsData.OSVMatch.AffectedInfo.length > 0
      ) {
        return this.vulnsData.OSVMatch.AffectedInfo[0]!;
      }
    }
    return { Ranges: [], Exact: [], Universal: false };
  }

  private async getDirectAffectedVersions(
    source: string,
  ): Promise<string | null> {
    if (source === "NVD" && this.nvdItem) {
      const nvdAffectedVersions = await this.extractNVDAffectedVersions();
      if (nvdAffectedVersions.length > 0) {
        return nvdAffectedVersions.join(", ");
      }
    } else if (source === "OSV" && this.osvItem) {
      const osvAffectedVersions = await this.extractOSVAffectedVersions();
      if (osvAffectedVersions.length > 0) {
        return osvAffectedVersions.join(", ");
      }
    }
    return null;
  }

  private buildAffectedStringParts(affectedData: AffectedInfo): string[] {
    const affectedStringParts: string[] = [];

    if (affectedData.Ranges && affectedData.Ranges.length > 0) {
      for (const range of affectedData.Ranges) {
        affectedStringParts.push(this.formatVersionRange(range));
      }
    } else if (affectedData.Exact && affectedData.Exact.length > 0) {
      for (const exact of affectedData.Exact) {
        affectedStringParts.push(exact.VersionString);
      }
    } else if (affectedData.Universal) {
      affectedStringParts.push("*");
    }

    return affectedStringParts;
  }

  private formatVersionRange(range: AffectedRange): string {
    let affectedStringPart = "";
    affectedStringPart += `>= ${range.IntroducedSemver.Major}.${range.IntroducedSemver.Minor}.${range.IntroducedSemver.Patch}`;
    if (range.IntroducedSemver.PreReleaseTag !== "")
      affectedStringPart += `-${range.IntroducedSemver.PreReleaseTag}`;

    affectedStringPart += ` < ${range.FixedSemver.Major}.${range.FixedSemver.Minor}.${range.FixedSemver.Patch}`;
    if (range.FixedSemver.PreReleaseTag !== "")
      affectedStringPart += `-${range.FixedSemver.PreReleaseTag}`;

    return affectedStringPart;
  }

  // Get affected versions from both sources for comparison - focus on why current version is flagged
  async getAffectedVersionsBySources(): Promise<{
    nvd: string;
    osv: string;
    agree: boolean;
    nvdReason: string;
    osvReason: string;
    nvdAllVersions: string;
    osvAllVersions: string;
  }> {
    let nvdString = "";
    let osvString = "";
    let nvdReason = "";
    let osvReason = "";
    let nvdAllVersions = "";
    let osvAllVersions = "";

    const currentVersion = this.vulnsData.AffectedVersion || "";

    // Get NVD reasoning and full details
    if (this.nvdItem) {
      const nvdVersions = await this.extractNVDAffectedVersions();
      nvdAllVersions = nvdVersions.join(", ");
      nvdReason = await this.explainWhyVersionIsVulnerable(
        "NVD",
        currentVersion,
      );
      nvdString = nvdReason;
    }

    // Get OSV reasoning and full details
    if (this.osvItem) {
      const osvVersions = await this.extractOSVAffectedVersions();
      osvAllVersions = osvVersions.join(", ");
      osvReason = await this.explainWhyVersionIsVulnerable(
        "OSV",
        currentVersion,
      );
      osvString = osvReason;
    }

    // Debug logging
    console.warn("🔍 Source comparison debug (reasoning):", {
      vulnId: this.vulnsData.VulnerabilityId,
      currentVersion,
      nvdReason,
      osvReason,
      nvdAllVersions,
      osvAllVersions,
    });

    // Sources disagree if they both have data but different reasoning
    const agree = nvdReason === osvReason || (!nvdReason && !osvReason);

    return {
      nvd: nvdString,
      osv: osvString,
      agree,
      nvdReason,
      osvReason,
      nvdAllVersions,
      osvAllVersions,
    };
  }

  // Explain why a specific version is considered vulnerable by a source
  async explainWhyVersionIsVulnerable(
    source: string,
    version: string,
  ): Promise<string> {
    const cleanVersion = version.startsWith("v") ? version.slice(1) : version;

    if (source === "NVD" && this.nvdItem?.affected) {
      const nvdExplanation = this.explainNVDVulnerability(cleanVersion);
      if (nvdExplanation) {
        return nvdExplanation;
      }
    }

    if (source === "OSV" && this.osvItem?.affected) {
      const osvExplanation = this.explainOSVVulnerability(cleanVersion);
      if (osvExplanation) {
        return osvExplanation;
      }
    }

    return "Unable to determine vulnerability reason";
  }

  private explainNVDVulnerability(cleanVersion: string): string | null {
    if (!this.nvdItem?.affected) {
      return null;
    }

    const affectedEntries = this.nvdItem.affected as NVDAffectedEntry[];
    for (const affectedEntry of affectedEntries) {
      if (!affectedEntry.sources) {
        continue;
      }

      for (const src of affectedEntry.sources) {
        const explanation = this.getNVDSourceExplanation(src, cleanVersion);
        if (explanation) {
          return explanation;
        }
      }
    }

    return null;
  }

  private getNVDSourceExplanation(
    src: NVDAffectedSource,
    cleanVersion: string,
  ): string | null {
    if (
      src.versionEndExcluding &&
      !src.versionStartIncluding &&
      !src.versionStartExcluding
    ) {
      return `All versions before ${src.versionEndExcluding} are affected (your v${cleanVersion} < ${src.versionEndExcluding})`;
    }

    if (src.versionStartIncluding && src.versionEndExcluding) {
      return `Versions ${src.versionStartIncluding} to ${src.versionEndExcluding} are affected`;
    }

    if (src.criteriaDict?.version === "*") {
      return "All versions are affected";
    }

    return null;
  }

  private explainOSVVulnerability(cleanVersion: string): string | null {
    if (!this.osvItem?.affected) {
      return null;
    }

    const specificVersions = this.collectOSVVulnerableVersions();

    if (specificVersions.length > 0) {
      // Sort versions for consistent display
      specificVersions.sort();

      if (specificVersions.includes(cleanVersion)) {
        return `Your version ${cleanVersion} is in the list of affected versions: ${specificVersions.join(", ")}`;
      } else {
        return `Only specific versions are affected: ${specificVersions.join(", ")} (your v${cleanVersion} is NOT in this list)`;
      }
    }

    return null;
  }

  private collectOSVVulnerableVersions(): string[] {
    const versions: string[] = [];

    if (!this.osvItem?.affected) {
      return versions;
    }

    const affectedEntries = this.osvItem.affected as OSVAffectedEntry[];
    for (const affectedEntry of affectedEntries) {
      if (affectedEntry.versions && Array.isArray(affectedEntry.versions)) {
        for (const version of affectedEntry.versions) {
          const versionString = String(version);
          const cleanVersion = versionString.startsWith("v")
            ? versionString.slice(1)
            : versionString;
          if (!versions.includes(cleanVersion)) {
            versions.push(cleanVersion);
          }
        }
      }
    }

    return versions;
  }

  async getVersionsStatusArray(
    affectedVersionsString: string,
    _affectedDependencyName: string,
  ): Promise<VulnerableVersionInfoReport[]> {
    // const versions = await this.#getVersions();
    const versions: Version[] = [];
    const versionsStatusArray: VulnerableVersionInfoReport[] = [];
    for (const version of versions) {
      if (satisfies(version.version, affectedVersionsString)) {
        versionsStatusArray.push({
          version: version.version,
          status: "affected",
        });
      } else {
        versionsStatusArray.push({
          version: version.version,
          status: "not_affected",
        });
      }
    }
    return versionsStatusArray;
  }

  getPatchesData(): PatchInfo {
    // if (this.patchesData.affected_deps && this.patchesData.affected_deps.length > 0) {
    //     this.patchesData.affected_dep_name = this.patchesData.affected_deps[0].slice(
    //         0,
    //         this.patchesData.affected_deps[0].lastIndexOf('@')
    //     );
    // }
    return this.patchesData;
  }

  async getWeaknessData(): Promise<
    [WeaknessInfoReport[], Record<string, CommonConsequencesInfo[]>]
  > {
    const common_consequences: Record<string, CommonConsequencesInfo[]> = {};
    const weakenessses: WeaknessInfoReport[] = [];

    if (
      this.vulnsData.Weaknesses === null ||
      this.vulnsData.Weaknesses === undefined
    )
      return [weakenessses, common_consequences];

    for (const _weakeness of this.vulnsData.Weaknesses) {
      try {
        // const cweInfo = await this.cweRepository.getCWE(
        //     _weakeness.WeaknessId.replace('CWE-', '')
        // );
        throw new Error("Method not implemented.");
        // weakenessses.push({
        //     id: weakeness.WeaknessId,
        //     name: cweInfo.Name,
        //     description: cweInfo.Description.replace(/[^\x20-\x7E]+/g, '')
        //         .replace(/\s+/g, ' ')
        //         .trim()
        // });
        // if (cweInfo.Common_Consequences) {
        //     const common_cons_array = [];
        //     for (const commonConsequence of cweInfo.Common_Consequences) {
        //         common_cons_array.push({
        //             scope: commonConsequence.Scope,
        //             impact: commonConsequence.Impact,
        //             description: commonConsequence.Note.replace(/[^\x20-\x7E]+/g, '')
        //                 .replace(/\s+/g, ' ')
        //                 .trim()
        //         });
        //     }
        //     common_consequences[weakeness.WeaknessId] = common_cons_array;
        // }
      } catch (error) {
        console.error(error);
      }
    }

    return [weakenessses, common_consequences];
  }

  async getDependencyData(): Promise<DependencyInfoReport> {
    const dependencyInfo: DependencyInfoReport = {
      name: "",
      published: "",
      description: "",
      keywords: [],
      version: "",
      package_manager_links: [],
    };

    // If no dependency data is available, return empty info
    if (!this.dependencyData) {
      console.warn("No dependency data available for vulnerability report");
      return dependencyInfo;
    }

    try {
      // const _packageInfo = await this.packageRepository.getPackageInfo('');
      // const _versionInfo = await this.versionsRepository.getVersion(
      //     'this.dependencyData.name',
      //     'this.dependencyData.version'
      // );

      // dependencyInfo.description = packageInfo.Description;
      // if (packageInfo.Keywords) dependencyInfo.keywords = packageInfo.Keywords;
      // dependencyInfo.published = versionInfo.Time;

      // if (packageInfo.Homepage && packageInfo.Homepage !== '') {
      //     dependencyInfo.homepage = packageInfo.Homepage;
      // }

      // if (this.dependencyData.git_url !== null) {
      //     if (this.dependencyData.git_url.host_type === 'GITHUB') {
      //         dependencyInfo.github_link = this.dependencyData.git_url;
      //         dependencyInfo.issues_link =
      //             this.dependencyData.git_url.repo_full_path + '/issues';
      //     }
      // }

      // if (this.packageManager === 'NPM' || this.packageManager === 'YARN') {
      //     dependencyInfo.package_manager_links.push({
      //         package_manager: 'NPM',
      //         url: `https://www.npmjs.com/package/${this.dependencyData.name}`
      //     });
      //     dependencyInfo.package_manager_links.push({
      //         package_manager: 'YARN',
      //         url: `https://yarn.pm/${this.dependencyData.name}`
      //     });
      // }

      return dependencyInfo;
    } catch (error) {
      console.error(error);
      return dependencyInfo;
    }
  }

  getOwaspTop10Info(): OwaspTop10Info | null {
    if (
      this.vulnsData.Weaknesses === null ||
      this.vulnsData.Weaknesses === undefined
    )
      return null;

    for (const weakeness of this.vulnsData.Weaknesses) {
      if (weakeness.OWASPTop10Id !== "") {
        try {
          return this.owaspRepository.getOwaspTop10CategoryInfo(
            weakeness.OWASPTop10Id,
          );
        } catch (err) {
          console.error(err);
          return null;
        }
      }
    }
    return null;
  }

  // Extract affected versions directly from NVD vulnerability data in human-readable format
  async extractNVDAffectedVersions(): Promise<string[]> {
    const ranges: string[] = [];

    if (!this.nvdItem?.affected) {
      return ranges;
    }

    // Parse the NVD affected field which contains CPE criteria
    const affectedEntries = this.nvdItem.affected as NVDAffectedEntry[];
    for (const affectedEntry of affectedEntries) {
      if (affectedEntry.sources) {
        for (const source of affectedEntry.sources) {
          let rangeDescription = "";

          // Handle version ranges in a user-friendly way
          const hasStart =
            source.versionStartIncluding ?? source.versionStartExcluding;
          const hasEnd =
            source.versionEndIncluding ?? source.versionEndExcluding;

          if (hasStart && hasEnd) {
            // Range: e.g., "5.4.0 to 5.4.3"
            const startVer =
              source.versionStartIncluding ?? source.versionStartExcluding;
            const endVer =
              source.versionEndIncluding ?? source.versionEndExcluding;
            const startSymbol = source.versionStartIncluding
              ? ""
              : " (exclusive)";
            const endSymbol = source.versionEndIncluding ? " (inclusive)" : "";
            rangeDescription = `${startVer}${startSymbol} to ${endVer}${endSymbol}`;
          } else if (hasEnd && !hasStart) {
            // Upper bound only: e.g., "before 5.3.15"
            const endVer =
              source.versionEndIncluding ?? source.versionEndExcluding;
            rangeDescription = source.versionEndExcluding
              ? `before ${endVer}`
              : `up to ${endVer} (inclusive)`;
          } else if (hasStart && !hasEnd) {
            // Lower bound only: e.g., "5.4.0 and later"
            const startVer =
              source.versionStartIncluding ?? source.versionStartExcluding;
            rangeDescription = source.versionStartIncluding
              ? `${startVer} and later`
              : `after ${startVer}`;
          } else if (
            source.criteriaDict?.version &&
            source.criteriaDict.version !== "*" &&
            source.criteriaDict.version !== ""
          ) {
            // Specific version
            rangeDescription = `exactly ${source.criteriaDict.version}`;
          } else if (source.criteriaDict?.version === "*") {
            // All versions
            rangeDescription = "all versions";
          }

          if (rangeDescription && !ranges.includes(rangeDescription)) {
            ranges.push(rangeDescription);
          }
        }
      }
    }

    return ranges;
  }

  // Extract affected versions directly from OSV vulnerability data in human-readable format
  async extractOSVAffectedVersions(): Promise<string[]> {
    const descriptions: string[] = [];
    const allSpecificVersions: string[] = [];
    const allRanges: string[] = [];

    if (!this.osvItem?.affected) {
      return descriptions;
    }

    // Parse OSV affected field - collect all data first to avoid duplicates
    const affectedEntries = this.osvItem.affected as OSVAffectedEntry[];
    for (const affectedEntry of affectedEntries) {
      this.collectOSVSpecificVersions(affectedEntry, allSpecificVersions);
      this.collectOSVRanges(affectedEntry, allRanges);
    }

    // Combine all unique versions and ranges, removing duplicates
    const uniqueDescriptions: string[] = [];

    if (allSpecificVersions.length > 0) {
      if (allSpecificVersions.length === 1) {
        uniqueDescriptions.push(`exactly ${allSpecificVersions[0]}`);
      } else {
        uniqueDescriptions.push(
          `specific versions: ${allSpecificVersions.join(", ")}`,
        );
      }
    }

    // Add unique ranges
    for (const range of allRanges) {
      if (!uniqueDescriptions.includes(range)) {
        uniqueDescriptions.push(range);
      }
    }

    return uniqueDescriptions;
  }

  private collectOSVSpecificVersions(
    affectedEntry: OSVAffectedEntry,
    allSpecificVersions: string[],
  ): void {
    if (!affectedEntry.versions || !Array.isArray(affectedEntry.versions)) {
      return;
    }

    for (const version of affectedEntry.versions) {
      const versionString = String(version);
      const cleanVersion = versionString.startsWith("v")
        ? versionString.slice(1)
        : versionString;
      if (!allSpecificVersions.includes(cleanVersion)) {
        allSpecificVersions.push(cleanVersion);
      }
    }
  }

  private collectOSVRanges(
    affectedEntry: OSVAffectedEntry,
    allRanges: string[],
  ): void {
    if (!affectedEntry.ranges || !Array.isArray(affectedEntry.ranges)) {
      return;
    }

    for (const range of affectedEntry.ranges) {
      if (!range.events || !Array.isArray(range.events)) {
        continue;
      }

      const eventDetails = this.extractOSVEventDetails(range.events);
      const rangeDesc = this.createOSVRangeDescription(eventDetails);

      if (rangeDesc && !allRanges.includes(rangeDesc)) {
        allRanges.push(rangeDesc);
      }
    }
  }

  private extractOSVEventDetails(events: OSVEvent[]): {
    introduced: string;
    fixed: string;
    lastAffected: string;
  } {
    let introduced = "";
    let fixed = "";
    let lastAffected = "";

    for (const event of events) {
      if (event.introduced && event.introduced !== "0") {
        introduced = event.introduced;
      }
      if (event.fixed) {
        fixed = event.fixed;
      }
      if (event.last_affected) {
        lastAffected = event.last_affected;
      }
    }

    return { introduced, fixed, lastAffected };
  }

  private createOSVRangeDescription(details: {
    introduced: string;
    fixed: string;
    lastAffected: string;
  }): string | null {
    const { introduced, fixed, lastAffected } = details;

    if (introduced && fixed) {
      return `${introduced} up to (but not including) ${fixed}`;
    }
    if (introduced && lastAffected) {
      return `${introduced} to ${lastAffected} (inclusive)`;
    }
    if (introduced) {
      return `${introduced} and later`;
    }
    if (fixed) {
      return `before ${fixed} (excluding ${fixed})`;
    }

    return null;
  }

  protected extractFrameworkPackageName(fallbackName: string): string {
    // Try OSV data first
    if (this.osvItem?.affected) {
      const osvAffectedEntries = this.osvItem.affected as OSVAffectedEntry[];
      for (const affected of osvAffectedEntries) {
        if (affected.package?.name) {
          return affected.package.name;
        }
      }
    }

    // If no OSV data, try to extract from NVD CPE criteria
    if (this.nvdItem?.affected) {
      const nvdAffectedEntries = this.nvdItem.affected as NVDAffectedEntry[];
      for (const affected of nvdAffectedEntries) {
        const nvdName = this.extractNVDPackageName(affected);
        if (nvdName) {
          return nvdName;
        }
      }
    }

    return fallbackName;
  }

  protected extractNVDPackageName(affected: NVDAffectedEntry): string | null {
    if (!affected.sources) {
      return null;
    }

    for (const source of affected.sources) {
      if (source.criteriaDict?.product && source.criteriaDict?.vendor) {
        return `${source.criteriaDict.vendor}/${source.criteriaDict.product}`;
      }
    }

    return null;
  }

  async parseCVSS31Vector(vector: string): Promise<CVSS3> {
    const { createCVSS31Parser, createCVSS31Calculator } =
      await import("cvss-parser");
    const cvss31Parser = createCVSS31Parser();
    const parsedVector = cvss31Parser.parse(vector);
    const cvss31Calculator = createCVSS31Calculator();
    cvss31Calculator.computeBaseScore(parsedVector);

    const baseScore = cvss31Calculator.getBaseScore(true);
    const exploitabilitySubscore =
      cvss31Calculator.getExploitabilitySubScore(true);
    const impactSubscore = cvss31Calculator.getImpactSubScore(true);

    const cvss31Data: CVSS31 = {
      base_score: baseScore,
      exploitability_score: exploitabilitySubscore,
      impact_score: impactSubscore,
      attack_vector: parsedVector.AttackVector,
      attack_complexity: parsedVector.AttackComplexity,
      confidentiality_impact: parsedVector.ConfidentialityImpact,
      availability_impact: parsedVector.AvailabilityImpact,
      integrity_impact: parsedVector.IntegrityImpact,
      user_interaction: parsedVector.UserInteraction,
      scope: parsedVector.Scope,
      privileges_required: parsedVector.PrivilegesRequired,
    };
    return cvss31Data;
  }

  async parseCVSS3Vector(vector: string): Promise<CVSS3> {
    const { createCVSS3Parser, createCVSS3Calculator } =
      await import("cvss-parser");
    const cvss3Parser = createCVSS3Parser();
    const parsedVector = cvss3Parser.parse(vector);
    const cvss3Calculator = createCVSS3Calculator();
    cvss3Calculator.computeBaseScore(parsedVector);

    const baseScore = cvss3Calculator.getBaseScore(true);
    const exploitabilitySubscore =
      cvss3Calculator.getExploitabilitySubScore(true);
    const impactSubscore = cvss3Calculator.getImpactSubScore(true);

    const cvss3Data: CVSS3 = {
      base_score: baseScore,
      exploitability_score: exploitabilitySubscore,
      impact_score: impactSubscore,
      attack_vector: parsedVector.AttackVector,
      attack_complexity: parsedVector.AttackComplexity,
      confidentiality_impact: parsedVector.ConfidentialityImpact,
      availability_impact: parsedVector.AvailabilityImpact,
      integrity_impact: parsedVector.IntegrityImpact,
      user_interaction: parsedVector.UserInteraction,
      scope: parsedVector.Scope,
      privileges_required: parsedVector.PrivilegesRequired,
    };
    return cvss3Data;
  }

  async parseCVSS2Vector(vector: string): Promise<CVSS2> {
    const { createCVSS2Parser, createCVSS2Calculator } =
      await import("cvss-parser");
    const cvss2Parser = createCVSS2Parser();
    const parsedVector = cvss2Parser.parse(vector);
    const cvss2Calculator = createCVSS2Calculator();
    cvss2Calculator.computeBaseScore(parsedVector);

    const baseScore = cvss2Calculator.getBaseScore(true);
    const exploitabilitySubscore =
      cvss2Calculator.getExploitabilitySubScore(true);
    const impactSubscore = cvss2Calculator.getImpactSubScore(true);

    const cvss2Data: CVSS2 = {
      base_score: baseScore,
      exploitability_score: exploitabilitySubscore,
      impact_score: impactSubscore,
      access_vector: parsedVector.AccessVector,
      access_complexity: parsedVector.AccessComplexity,
      confidentiality_impact: parsedVector.ConfidentialityImpact,
      availability_impact: parsedVector.AvailabilityImpact,
      integrity_impact: parsedVector.IntegrityImpact,
      authentication: parsedVector.Authentication,
    };
    return cvss2Data;
  }

  async getCVSSNVDInfo(nvdItem: NVD): Promise<SeverityInfo> {
    const severityInfo: SeverityInfo = {};

    if (!nvdItem.metrics) {
      return severityInfo;
    }

    // Cast metrics to typed structure for safe access
    const metrics = nvdItem.metrics as NVDMetrics;

    // Process CVSS v2 metrics
    if (metrics.cvssMetricV2) {
      const cvss2 = await this.extractCVSS2Metric(metrics.cvssMetricV2);
      if (cvss2) {
        severityInfo.cvss_2 = cvss2;
      }
    }

    // Process CVSS v3.0 metrics
    if (metrics.cvssMetricV30) {
      const cvss3 = await this.extractCVSS3Metric(metrics.cvssMetricV30);
      if (cvss3) {
        severityInfo.cvss_3 = cvss3;
      }
    }

    // Process CVSS v3.1 metrics
    if (metrics.cvssMetricV31) {
      const cvss31 = await this.extractCVSS31Metric(metrics.cvssMetricV31);
      if (cvss31) {
        severityInfo.cvss_31 = cvss31;
      }
    }

    // Add user interaction required flag for CVSS v2
    if (
      severityInfo.cvss_2 !== undefined &&
      metrics.cvssMetricV2?.[0]?.userInteractionRequired !== undefined
    ) {
      severityInfo.cvss_2.user_interaction_required =
        metrics.cvssMetricV2[0].userInteractionRequired;
    }

    return severityInfo;
  }

  private async extractCVSS2Metric(
    cvssMetricV2: NVDCVSSMetric[],
  ): Promise<CVSS2 | undefined> {
    if (cvssMetricV2.length > 1) {
      // Find the official NIST entry
      for (const cvss2 of cvssMetricV2) {
        if (cvss2.source === "nvd@nist.gov") {
          return await this.parseCVSS2Vector(cvss2.cvssData.vectorString);
        }
      }
    } else if (cvssMetricV2.length === 1 && cvssMetricV2[0]) {
      return await this.parseCVSS2Vector(cvssMetricV2[0].cvssData.vectorString);
    }
    return undefined;
  }

  private async extractCVSS3Metric(
    cvssMetricV3: NVDCVSSMetric[],
  ): Promise<CVSS3 | undefined> {
    if (cvssMetricV3.length > 1) {
      // Find the official NIST entry
      for (const cvss3 of cvssMetricV3) {
        if (cvss3.source === "nvd@nist.gov") {
          return await this.parseCVSS3Vector(cvss3.cvssData.vectorString);
        }
      }
    } else if (cvssMetricV3.length === 1 && cvssMetricV3[0]) {
      return await this.parseCVSS3Vector(cvssMetricV3[0].cvssData.vectorString);
    }
    return undefined;
  }

  private async extractCVSS31Metric(
    cvssMetricV31: NVDCVSSMetric[],
  ): Promise<CVSS31 | undefined> {
    if (cvssMetricV31.length > 1) {
      // Find the official NIST entry
      for (const cvss31 of cvssMetricV31) {
        if (cvss31.source === "nvd@nist.gov") {
          return await this.parseCVSS31Vector(cvss31.cvssData.vectorString);
        }
      }
    } else if (cvssMetricV31.length === 1 && cvssMetricV31[0]) {
      return await this.parseCVSS31Vector(
        cvssMetricV31[0].cvssData.vectorString,
      );
    }
    return undefined;
  }

  async getCVSSOSVInfo(osvItem: OSV): Promise<SeverityInfo> {
    const severityInfo: SeverityInfo = {};

    if (!osvItem.severity) {
      return severityInfo;
    }

    // Cast severity to typed structure for safe access
    const severities = osvItem.severity as OSVSeverity[];

    if (severities.length === 0) {
      return severityInfo;
    }

    for (const severity of severities) {
      if (severity.type === "CVSS_V3") {
        severityInfo.cvss_3 = await this.parseCVSS3Vector(severity.score);
      } else if (severity.type === "CVSS_V2") {
        severityInfo.cvss_2 = await this.parseCVSS2Vector(severity.score);
      }
    }

    return severityInfo;
  }

  getOtherInfo(): OtherInfo {
    return { package_manager: this.packageManager };
  }
}

@Injectable()
export class OSVReportGenerator extends BaseReportGenerator {
  constructor(
    readonly versionsRepository: VersionsRepository,
    readonly osvRepository: OSVRepository,
    readonly nvdRepository: NVDRepository,
    readonly cweRepository: CWERepository,
    readonly packageRepository: PackageRepository,
    readonly owaspRepository: OWASPRepository,
  ) {
    super(
      versionsRepository,
      osvRepository,
      nvdRepository,
      cweRepository,
      packageRepository,
      owaspRepository,
    );
  }

  async genReport(
    // patchesData: PatchInfo,
    vulnsData: Vulnerability,
    packageManager: string,
    dependencyData?: Dependency,
    osvItem?: OSV,
    nvdItem?: NVD,
    friendsOfPhpItem?: FriendsOfPhp,
  ): Promise<VulnerabilityDetailsReport> {
    // this.patchesData = patchesData;
    this.vulnsData = vulnsData;
    this.packageManager = packageManager;
    if (dependencyData !== undefined) {
      this.dependencyData = dependencyData;
    }
    if (osvItem !== undefined) {
      this.osvItem = osvItem;
    }
    if (nvdItem !== undefined) {
      this.nvdItem = nvdItem;
    }

    if (!this.osvItem) {
      throw new Error("Failed to generate report from undefined nvd entry");
    }

    /** Vulnerability Info */
    const vulnInfo: VulnerabilityInfoReport = {
      vulnerability_id: this.osvItem.cve ?? this.osvItem.osv_id,
      description: this.#cleanOsvDescription(this.osvItem.details),
      version_info: {
        affected_versions_string: "",
        patched_versions_string: "",
        versions: [],
      },
      published: this.osvItem.published,
      last_modified: this.osvItem.modified,
      sources: [
        {
          name: "OSV",
          vuln_url: `https://osv.dev/vulnerability/${this.osvItem.osv_id}`,
        },
      ],
      aliases: [this.osvItem.osv_id],
    };

    if (this.osvItem.cve) {
      vulnInfo.aliases.push(this.osvItem.cve);
    }

    if (this.nvdItem) {
      vulnInfo.sources.push({
        name: "NVD",
        vuln_url: `https://nvd.nist.gov/vuln/detail/${this.nvdItem.nvd_id}`,
      });
    }

    if (friendsOfPhpItem) {
      vulnInfo.sources.push({
        name: "FriendsOfPHP",
        vuln_url: friendsOfPhpItem.link,
      });
    }

    // const patchedVersionsString = await this.getPatchedVersionsString('OSV');
    const affectedVersionsString =
      await this.getVulnerableVersionsString("OSV");
    const versionsStatusArray = await this.getVersionsStatusArray(
      affectedVersionsString,
      vulnsData.AffectedDependency,
    );

    // Get source comparison for disagreements
    const sourceComparison = await this.getAffectedVersionsBySources();

    vulnInfo.version_info.affected_versions_string = affectedVersionsString;
    // vulnInfo.version_info.patched_versions_string = patchedVersionsString;
    vulnInfo.version_info.versions = versionsStatusArray;
    vulnInfo.version_info.source_comparison = sourceComparison;

    /** Dependency Info */
    let dependencyInfo: DependencyInfoReport | undefined;
    try {
      dependencyInfo = await this.getDependencyData();

      // For framework vulnerabilities, try to extract the actual package name from OSV data
      let displayName = vulnsData.AffectedDependency || "";
      if (displayName.startsWith("framework-")) {
        displayName = this.extractFrameworkPackageName(displayName);
      }

      dependencyInfo.name = displayName;
      dependencyInfo.version = vulnsData.AffectedVersion || "";

      // Warn if dependency info is missing
      if (!vulnsData.AffectedDependency || !vulnsData.AffectedVersion) {
        console.warn("Missing dependency info in OSV vulnerability data:", {
          vulnId: vulnsData.VulnerabilityId,
          affectedDep: vulnsData.AffectedDependency,
          affectedVersion: vulnsData.AffectedVersion,
        });
      }
    } catch (error) {
      console.error("Error getting dependency data (OSV):", error);
    }

    /** Common consequences and waeknesses */
    const [weakenessses, common_consequences] = await this.getWeaknessData();

    /** Patch Info */
    const patchInfo: PatchInfo = this.getPatchesData();

    /** Severities */
    let severityInfo: SeverityInfo = await this.getCVSSOSVInfo(this.osvItem);

    if (!severityInfo.cvss_2 && !severityInfo.cvss_31 && !severityInfo.cvss_3) {
      if (this.nvdItem) {
        severityInfo = await this.getCVSSNVDInfo(this.nvdItem);
      }
    }

    /** References */
    const references: ReferenceInfo[] = [];

    if (this.osvItem.references) {
      const osvReferences = this.osvItem.references as OSVReference[];
      for (const ref of osvReferences) {
        references.push({ url: ref.url, tags: [ref.type] });
      }
    }

    /** Owasp top 10 */
    const owaspTop10Info = this.getOwaspTop10Info();

    /** Vulnerability Details */
    const vulnDetails: VulnerabilityDetailsReport = {
      vulnerability_info: vulnInfo,
      weaknesses: weakenessses,
      severities: severityInfo,
      common_consequences: common_consequences,
      patch: patchInfo,
      references: references,
      owasp_top_10: owaspTop10Info,
      location: [],
      other: this.getOtherInfo(),
    };
    if (dependencyInfo) {
      vulnDetails.dependency_info = dependencyInfo;
    }

    return vulnDetails;
  }

  #cleanOsvDescription(description: string): string {
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
}

@Injectable()
export class NVDReportGenerator extends BaseReportGenerator {
  constructor(
    readonly versionsRepository: VersionsRepository,
    readonly osvRepository: OSVRepository,
    readonly nvdRepository: NVDRepository,
    readonly cweRepository: CWERepository,
    readonly packageRepository: PackageRepository,
    readonly owaspRepository: OWASPRepository,
  ) {
    super(
      versionsRepository,
      osvRepository,
      nvdRepository,
      cweRepository,
      packageRepository,
      owaspRepository,
    );
  }

  async genReport(
    // patchesData: PatchInfo,
    vulnsData: Vulnerability,
    packageManager: string,
    dependencyData?: Dependency,
    osvItem?: OSV,
    nvdItem?: NVD,
    friendsOfPhpItem?: FriendsOfPhp,
  ): Promise<VulnerabilityDetailsReport> {
    // this.patchesData = patchesData;
    this.vulnsData = vulnsData;
    this.packageManager = packageManager;
    if (dependencyData !== undefined) {
      this.dependencyData = dependencyData;
    }
    if (osvItem !== undefined) {
      this.osvItem = osvItem;
    }
    if (nvdItem !== undefined) {
      this.nvdItem = nvdItem;
    }

    if (!this.nvdItem) {
      throw new Error("Failed to generate report from undefined nvd entry");
    }

    /** Vulnerability Info */
    const vulnInfo: VulnerabilityInfoReport = {
      vulnerability_id: this.nvdItem.nvd_id,
      description: "",
      version_info: {
        affected_versions_string: "",
        patched_versions_string: "",
        versions: [],
      },
      published: this.nvdItem.published,
      last_modified: this.nvdItem.lastModified,
      sources: [
        {
          name: "NVD",
          vuln_url: `https://nvd.nist.gov/vuln/detail/${this.nvdItem.nvd_id}`,
        },
      ],
      aliases: [],
    };

    if (this.osvItem) {
      vulnInfo.aliases.push(this.osvItem.osv_id);
      vulnInfo.sources.push({
        name: "OSV",
        vuln_url: `https://osv.dev/vulnerability/${this.osvItem.osv_id}`,
      });
    }

    if (friendsOfPhpItem) {
      vulnInfo.sources.push({
        name: "FriendsOfPHP",
        vuln_url: friendsOfPhpItem.link,
      });
    }

    const descriptions = this.nvdItem.descriptions as NVDDescription[];
    for (const description of descriptions) {
      if (description.lang === "en") {
        vulnInfo.description = description.value;
        break;
      }
    }

    // const patchedVersionsString = await this.getPatchedVersionsString('NVD');
    const affectedVersionsString =
      await this.getVulnerableVersionsString("NVD");
    const versionsStatusArray = await this.getVersionsStatusArray(
      affectedVersionsString,
      vulnsData.AffectedDependency,
    );

    // Get source comparison for disagreements
    const sourceComparison = await this.getAffectedVersionsBySources();

    vulnInfo.version_info.affected_versions_string = affectedVersionsString;
    // vulnInfo.version_info.patched_versions_string = patchedVersionsString;
    vulnInfo.version_info.versions = versionsStatusArray;
    vulnInfo.version_info.source_comparison = sourceComparison;

    /** Dependency Info */
    let dependencyInfo: DependencyInfoReport | undefined;
    try {
      dependencyInfo = await this.getDependencyData();

      // For framework vulnerabilities, try to extract the actual package name from OSV or NVD data
      let displayName = vulnsData.AffectedDependency || "";
      if (displayName.startsWith("framework-")) {
        displayName = this.extractFrameworkPackageName(displayName);
      }

      dependencyInfo.name = displayName;
      dependencyInfo.version = vulnsData.AffectedVersion || "";

      // Warn if dependency info is missing
      if (!vulnsData.AffectedDependency || !vulnsData.AffectedVersion) {
        console.warn("Missing dependency info in NVD vulnerability data:", {
          vulnId: vulnsData.VulnerabilityId,
          affectedDep: vulnsData.AffectedDependency,
          affectedVersion: vulnsData.AffectedVersion,
        });
      }
    } catch (error) {
      console.error("Error getting dependency data (NVD):", error);
    }

    /** Common consequences and waeknesses */
    const [weakenessses, common_consequences] = await this.getWeaknessData();

    /** Patch Info */
    const patchInfo: PatchInfo = this.getPatchesData();

    /** Severities */
    let severityInfo: SeverityInfo = await this.getCVSSNVDInfo(this.nvdItem);

    if (!severityInfo.cvss_2 && !severityInfo.cvss_31 && !severityInfo.cvss_3) {
      if (this.osvItem) {
        severityInfo = await this.getCVSSOSVInfo(this.osvItem);
      }
    }

    /** References */
    const references: ReferenceInfo[] = [];

    // Cast references to typed structure for safe access
    const nvdReferences = this.nvdItem.references as NVDReference[];
    for (const ref of nvdReferences) {
      references.push({ url: ref.url, tags: [] });
    }

    /** Owasp top 10 */
    const owaspTop10Info = this.getOwaspTop10Info();

    /** Vulnerability Details */
    const vulnDetails: VulnerabilityDetailsReport = {
      vulnerability_info: vulnInfo,
      weaknesses: weakenessses,
      severities: severityInfo,
      common_consequences: common_consequences,
      patch: patchInfo,
      references: references,
      owasp_top_10: owaspTop10Info,
      location: [],
      other: this.getOtherInfo(),
    };
    if (dependencyInfo) {
      vulnDetails.dependency_info = dependencyInfo;
    }

    return vulnDetails;
  }
}
