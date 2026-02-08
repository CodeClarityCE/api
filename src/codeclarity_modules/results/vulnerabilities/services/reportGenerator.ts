import { Injectable } from "@nestjs/common";
import { satisfies } from "semver";

import { CWERepository } from "src/codeclarity_modules/knowledge/cwe/cwe.repository";
import type { FriendsOfPhp } from "src/codeclarity_modules/knowledge/friendsofphp/friendsofphp.entity";
import type { GCVE } from "src/codeclarity_modules/knowledge/gcve/gcve.entity";
import type { NVD } from "src/codeclarity_modules/knowledge/nvd/nvd.entity";
import { NVDRepository } from "src/codeclarity_modules/knowledge/nvd/nvd.repository";
import type { OSV } from "src/codeclarity_modules/knowledge/osv/osv.entity";
import { OSVRepository } from "src/codeclarity_modules/knowledge/osv/osv.repository";
import { OWASPRepository } from "src/codeclarity_modules/knowledge/owasp/owasp.repository";
import type { OwaspTop10Info } from "src/codeclarity_modules/knowledge/owasp/owasp.types";
import type { Version } from "src/codeclarity_modules/knowledge/package/package.entity";
import { PackageRepository } from "src/codeclarity_modules/knowledge/package/package.repository";
import { VersionsRepository } from "src/codeclarity_modules/knowledge/package/packageVersions.repository";
import type { PatchInfo } from "src/codeclarity_modules/results/patching/patching.types";
import type { Dependency } from "src/codeclarity_modules/results/sbom/sbom.types";
import type {
  AffectedInfo,
  AffectedRange,
  CommonConsequencesInfo,
  DependencyInfoReport,
  OtherInfo,
  ReferenceInfo,
  SeverityInfo,
  Vulnerability,
  VulnerabilityDetailsReport,
  VulnerabilityInfoReport,
  VulnSourceInfo,
  VulnerableVersionInfoReport,
  WeaknessInfoReport,
} from "src/codeclarity_modules/results/vulnerabilities/vulnerabilities.types";

import { getCVSSNVDInfo, getCVSSOSVInfo } from "./cvssParser";
import {
  buildAffectedVersionsString,
  extractGCVERanges,
  extractNVDRanges,
  extractOSVRanges,
  filterNVDByPackage,
  mergeSourceRangeData,
} from "./rangeExtractor";
import { buildSourceComparison } from "./sourceComparison";
import type { SourceRangeData } from "./types";

// ---------------------------------------------------------------------------
// JSONB shape interfaces (lightweight, only what remains needed here)
// ---------------------------------------------------------------------------

interface OSVAffectedEntry {
  package?: { name?: string; [key: string]: unknown };
  [key: string]: unknown;
}

interface NVDAffectedEntry {
  sources?: Array<{
    criteriaDict?: { product?: string; vendor?: string; [key: string]: unknown };
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

interface NVDDescription {
  lang: string;
  value: string;
  [key: string]: unknown;
}

interface OSVReference {
  url: string;
  type: string;
  [key: string]: unknown;
}

interface NVDReference {
  url: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Base report generator
// ---------------------------------------------------------------------------

abstract class BaseReportGenerator {
  patchesData!: PatchInfo;
  vulnsData!: Vulnerability;
  dependencyData?: Dependency;
  versions!: Version[];
  packageManager!: string;
  osvItem?: OSV;
  nvdItem?: NVD;
  gcveItem?: GCVE;

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

  // -------------------------------------------------------------------------
  // Abstract hooks – subclasses implement source-specific logic
  // -------------------------------------------------------------------------

  protected abstract getVulnerabilityId(): string;
  protected abstract getDescription(): string;
  protected abstract getPublishedDate(): string;
  protected abstract getLastModifiedDate(): string;
  protected abstract buildSources(friendsOfPhpItem?: FriendsOfPhp): VulnSourceInfo[];
  protected abstract buildAliases(): string[];
  protected abstract getReferences(): ReferenceInfo[];
  protected abstract getPrimarySeverity(): Promise<SeverityInfo>;
  protected abstract getFallbackSeverity(): Promise<SeverityInfo>;

  // -------------------------------------------------------------------------
  // Affected versions (delegates to range extractor)
  // -------------------------------------------------------------------------

  async getVulnerableVersionsString(
    source: string,
  ): Promise<{ versions: string; source: string }> {
    // Try to build affected string from knowledge-DB data
    const result = this.getDirectAffectedVersions(source);
    if (result) return result;

    // Fallback to AffectedInfo from vuln-finder analysis results
    const affectedData = this.getAffectedDataBySource(source);
    const affectedStringParts = this.buildAffectedStringParts(affectedData);

    // Final fallback for framework vulnerabilities
    const isFramework = this.vulnsData.AffectedDependency?.startsWith("framework-");
    if (affectedStringParts.length === 0 && isFramework && this.vulnsData.AffectedVersion) {
      return {
        versions: `${this.vulnsData.AffectedVersion} (check advisory for details)`,
        source,
      };
    }

    return { versions: affectedStringParts.join(" || "), source };
  }

  private getDirectAffectedVersions(
    preferredSource: string,
  ): { versions: string; source: string } | null {
    const order =
      preferredSource === "NVD"
        ? (["NVD", "OSV", "GCVE"] as const)
        : preferredSource === "GCVE"
          ? (["GCVE", "OSV", "NVD"] as const)
          : (["OSV", "NVD", "GCVE"] as const);

    const packageName = this.vulnsData.AffectedDependency || "";

    for (const src of order) {
      let entries: SourceRangeData[] = [];
      if (src === "NVD" && this.nvdItem) {
        entries = extractNVDRanges(this.nvdItem);
        entries = filterNVDByPackage(entries, packageName);
      } else if (src === "OSV" && this.osvItem) {
        entries = extractOSVRanges(this.osvItem);
      } else if (src === "GCVE" && this.gcveItem) {
        entries = extractGCVERanges(this.gcveItem);
      }

      if (entries.length === 0) continue;

      // Skip NVD universal-only
      const merged = mergeSourceRangeData(entries);
      if (!merged) continue;
      if (
        merged.universal &&
        merged.ranges.length === 0 &&
        merged.exactVersions.length === 0
      ) {
        continue;
      }

      const text = buildAffectedVersionsString(entries);
      if (text) return { versions: text, source: src };
    }

    return null;
  }

  private getAffectedDataBySource(source: string): AffectedInfo {
    if (source === "NVD") {
      if (this.vulnsData.NVDMatch?.AffectedInfo?.length > 0) {
        return this.vulnsData.NVDMatch.AffectedInfo[0]!;
      }
    } else if (source === "GCVE") {
      const gcveMatch = this.vulnsData.GCVEMatch;
      if (gcveMatch && gcveMatch.AffectedInfo && gcveMatch.AffectedInfo.length > 0) {
        return gcveMatch.AffectedInfo[0]!;
      }
    } else {
      if (this.vulnsData.OSVMatch?.AffectedInfo?.length > 0) {
        return this.vulnsData.OSVMatch.AffectedInfo[0]!;
      }
    }
    return { Ranges: [], Exact: [], Universal: false };
  }

  private buildAffectedStringParts(affectedData: AffectedInfo): string[] {
    const parts: string[] = [];
    if (affectedData.Ranges && affectedData.Ranges.length > 0) {
      for (const range of affectedData.Ranges) {
        parts.push(this.formatVersionRange(range));
      }
    } else if (affectedData.Exact && affectedData.Exact.length > 0) {
      for (const exact of affectedData.Exact) {
        parts.push(exact.VersionString);
      }
    } else if (affectedData.Universal) {
      parts.push("*");
    }
    return parts;
  }

  private formatVersionRange(range: AffectedRange): string {
    let part = "";
    part += `>= ${range.IntroducedSemver.Major}.${range.IntroducedSemver.Minor}.${range.IntroducedSemver.Patch}`;
    if (range.IntroducedSemver.PreReleaseTag !== "")
      part += `-${range.IntroducedSemver.PreReleaseTag}`;
    part += ` < ${range.FixedSemver.Major}.${range.FixedSemver.Minor}.${range.FixedSemver.Patch}`;
    if (range.FixedSemver.PreReleaseTag !== "")
      part += `-${range.FixedSemver.PreReleaseTag}`;
    return part;
  }

  // -------------------------------------------------------------------------
  // Source comparison (delegates to sourceComparison module)
  // -------------------------------------------------------------------------

  async getAffectedVersionsBySources(): Promise<{
    nvd: string;
    osv: string;
    gcve: string;
    agree: boolean;
    nvdReason: string;
    osvReason: string;
    gcveReason: string;
    nvdAllVersions: string;
    osvAllVersions: string;
    gcveAllVersions: string;
  }> {
    return buildSourceComparison(
      this.vulnsData.AffectedVersion || "",
      this.vulnsData.AffectedDependency || "",
      this.nvdItem,
      this.osvItem,
      this.gcveItem,
    );
  }

  // -------------------------------------------------------------------------
  // Version status array
  // -------------------------------------------------------------------------

  async getVersionsStatusArray(
    affectedVersionsString: string,
    _affectedDependencyName: string,
  ): Promise<VulnerableVersionInfoReport[]> {
    // TODO: re-enable when VersionsRepository supports this query
    const versions: Version[] = [];
    const result: VulnerableVersionInfoReport[] = [];
    for (const version of versions) {
      if (satisfies(version.version, affectedVersionsString)) {
        result.push({ version: version.version, status: "affected" });
      } else {
        result.push({ version: version.version, status: "not_affected" });
      }
    }
    return result;
  }

  // -------------------------------------------------------------------------
  // Patches
  // -------------------------------------------------------------------------

  getPatchesData(): PatchInfo {
    return this.patchesData;
  }

  // -------------------------------------------------------------------------
  // Weaknesses / CWE
  // -------------------------------------------------------------------------

  async getWeaknessData(): Promise<
    [WeaknessInfoReport[], Record<string, CommonConsequencesInfo[]>]
  > {
    const consequences: Record<string, CommonConsequencesInfo[]> = {};
    const weaknesses: WeaknessInfoReport[] = [];

    if (!this.vulnsData.Weaknesses) return [weaknesses, consequences];

    for (const weakness of this.vulnsData.Weaknesses) {
      try {
        const cweInfo = await this.cweRepository.getCWE(
          weakness.WeaknessId.replace("CWE-", ""),
        );
        weaknesses.push({
          id: weakness.WeaknessId,
          name: cweInfo.name,
          description:
            cweInfo.description
              ?.replace(/[^\x20-\x7E]+/g, "")
              .replace(/\s+/g, " ")
              .trim() ?? "",
        });
        if (cweInfo.common_consequences && Array.isArray(cweInfo.common_consequences)) {
          const arr: CommonConsequencesInfo[] = [];
          for (const cc of cweInfo.common_consequences as Array<{
            Scope?: string[];
            Impact?: string[];
            Note?: string;
          }>) {
            arr.push({
              scope: cc.Scope ?? [],
              impact: cc.Impact ?? [],
              description: (cc.Note ?? "")
                .replace(/[^\x20-\x7E]+/g, "")
                .replace(/\s+/g, " ")
                .trim(),
            });
          }
          consequences[weakness.WeaknessId] = arr;
        }
      } catch (error) {
        console.error(error);
      }
    }

    return [weaknesses, consequences];
  }

  // -------------------------------------------------------------------------
  // Dependency info
  // -------------------------------------------------------------------------

  async getDependencyData(): Promise<DependencyInfoReport> {
    const info: DependencyInfoReport = {
      name: "",
      published: "",
      description: "",
      keywords: [],
      version: "",
      package_manager_links: [],
    };

    if (!this.dependencyData) {
      console.warn("No dependency data available for vulnerability report");
      return info;
    }

    return info;
  }

  // -------------------------------------------------------------------------
  // OWASP Top 10
  // -------------------------------------------------------------------------

  getOwaspTop10Info(): OwaspTop10Info | null {
    if (!this.vulnsData.Weaknesses) return null;

    for (const weakness of this.vulnsData.Weaknesses) {
      if (weakness.OWASPTop10Id !== "") {
        try {
          return this.owaspRepository.getOwaspTop10CategoryInfo(
            weakness.OWASPTop10Id,
          );
        } catch (err) {
          console.error(err);
          return null;
        }
      }
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Other info
  // -------------------------------------------------------------------------

  getOtherInfo(): OtherInfo {
    return { package_manager: this.packageManager };
  }

  // -------------------------------------------------------------------------
  // Framework package name extraction
  // -------------------------------------------------------------------------

  protected extractFrameworkPackageName(fallbackName: string): string {
    if (this.osvItem?.affected) {
      const entries = this.osvItem.affected as OSVAffectedEntry[];
      for (const entry of entries) {
        if (entry.package?.name) return entry.package.name;
      }
    }
    if (this.nvdItem?.affected) {
      const entries = this.nvdItem.affected as NVDAffectedEntry[];
      for (const entry of entries) {
        if (!entry.sources) continue;
        for (const src of entry.sources) {
          if (src.criteriaDict?.product && src.criteriaDict?.vendor) {
            return `${src.criteriaDict.vendor}/${src.criteriaDict.product}`;
          }
        }
      }
    }
    return fallbackName;
  }

  // -------------------------------------------------------------------------
  // Common report assembly (template method)
  // -------------------------------------------------------------------------

  protected async assembleReport(
    friendsOfPhpItem?: FriendsOfPhp,
  ): Promise<VulnerabilityDetailsReport> {
    // Vulnerability info
    const vulnInfo: VulnerabilityInfoReport = {
      vulnerability_id: this.getVulnerabilityId(),
      description: this.getDescription(),
      version_info: {
        affected_versions_string: "",
        patched_versions_string: "",
        versions: [],
      },
      published: this.getPublishedDate(),
      last_modified: this.getLastModifiedDate(),
      sources: this.buildSources(friendsOfPhpItem),
      aliases: this.buildAliases(),
    };

    // Determine the primary source for version string
    const primarySource = this instanceof OSVReportGenerator ? "OSV" : "NVD";
    const affectedResult = await this.getVulnerableVersionsString(primarySource);
    const versionsStatusArray = await this.getVersionsStatusArray(
      affectedResult.versions,
      this.vulnsData.AffectedDependency,
    );
    const sourceComparison = await this.getAffectedVersionsBySources();

    vulnInfo.version_info.affected_versions_string = affectedResult.versions;
    vulnInfo.version_info.affected_versions_source = affectedResult.source;
    vulnInfo.version_info.versions = versionsStatusArray;
    vulnInfo.version_info.source_comparison = sourceComparison;

    // Dependency info
    let dependencyInfo: DependencyInfoReport | undefined;
    try {
      dependencyInfo = await this.getDependencyData();
      let displayName = this.vulnsData.AffectedDependency || "";
      if (displayName.startsWith("framework-")) {
        displayName = this.extractFrameworkPackageName(displayName);
      }
      dependencyInfo.name = displayName;
      dependencyInfo.version = this.vulnsData.AffectedVersion || "";

      if (!this.vulnsData.AffectedDependency || !this.vulnsData.AffectedVersion) {
        console.warn("Missing dependency info in vulnerability data:", {
          vulnId: this.vulnsData.VulnerabilityId,
          affectedDep: this.vulnsData.AffectedDependency,
          affectedVersion: this.vulnsData.AffectedVersion,
        });
      }
    } catch (error) {
      console.error("Error getting dependency data:", error);
    }

    // Weaknesses and consequences
    const [weaknesses, consequences] = await this.getWeaknessData();

    // Patch info
    const patchInfo = this.getPatchesData();

    // Severity (primary then fallback)
    let severityInfo = await this.getPrimarySeverity();
    if (!severityInfo.cvss_2 && !severityInfo.cvss_31 && !severityInfo.cvss_3) {
      severityInfo = await this.getFallbackSeverity();
    }

    // References
    const references = this.getReferences();

    // OWASP Top 10
    const owaspTop10Info = this.getOwaspTop10Info();

    // Assemble
    const report: VulnerabilityDetailsReport = {
      vulnerability_info: vulnInfo,
      weaknesses,
      severities: severityInfo,
      common_consequences: consequences,
      patch: patchInfo,
      references,
      owasp_top_10: owaspTop10Info,
      location: [],
      other: this.getOtherInfo(),
    };
    if (dependencyInfo) {
      report.dependency_info = dependencyInfo;
    }
    return report;
  }
}

// ---------------------------------------------------------------------------
// OSV report generator
// ---------------------------------------------------------------------------

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
    vulnsData: Vulnerability,
    packageManager: string,
    dependencyData?: Dependency,
    osvItem?: OSV,
    nvdItem?: NVD,
    friendsOfPhpItem?: FriendsOfPhp,
    gcveItem?: GCVE,
  ): Promise<VulnerabilityDetailsReport> {
    this.vulnsData = vulnsData;
    this.packageManager = packageManager;
    if (dependencyData !== undefined) this.dependencyData = dependencyData;
    if (osvItem !== undefined) this.osvItem = osvItem;
    if (nvdItem !== undefined) this.nvdItem = nvdItem;
    if (gcveItem !== undefined) this.gcveItem = gcveItem;

    if (!this.osvItem) {
      throw new Error("Failed to generate report from undefined nvd entry");
    }

    return this.assembleReport(friendsOfPhpItem);
  }

  // -- Source-specific hooks ------------------------------------------------

  protected getVulnerabilityId(): string {
    return this.osvItem!.cve ?? this.osvItem!.osv_id;
  }

  protected getDescription(): string {
    return cleanOsvDescription(this.osvItem!.details);
  }

  protected getPublishedDate(): string {
    return this.osvItem!.published;
  }

  protected getLastModifiedDate(): string {
    return this.osvItem!.modified;
  }

  protected buildSources(friendsOfPhpItem?: FriendsOfPhp): VulnSourceInfo[] {
    const sources: VulnSourceInfo[] = [
      {
        name: "OSV",
        vuln_url: `https://osv.dev/vulnerability/${this.osvItem!.osv_id}`,
      },
    ];
    if (this.nvdItem) {
      sources.push({
        name: "NVD",
        vuln_url: `https://nvd.nist.gov/vuln/detail/${this.nvdItem.nvd_id}`,
      });
    }
    if (friendsOfPhpItem) {
      sources.push({ name: "FriendsOfPHP", vuln_url: friendsOfPhpItem.link });
    }
    if (this.gcveItem) {
      sources.push({
        name: "GCVE",
        vuln_url: `https://vulnerability.circl.lu/vuln/${this.gcveItem.cve_id || this.gcveItem.gcve_id}`,
      });
    }
    return sources;
  }

  protected buildAliases(): string[] {
    const aliases = [this.osvItem!.osv_id];
    if (this.osvItem!.cve) aliases.push(this.osvItem!.cve);
    return aliases;
  }

  protected getReferences(): ReferenceInfo[] {
    if (!this.osvItem?.references) return [];
    const refs = this.osvItem.references as OSVReference[];
    return refs.map((r) => ({ url: r.url, tags: [r.type] }));
  }

  protected async getPrimarySeverity(): Promise<SeverityInfo> {
    return getCVSSOSVInfo(this.osvItem!);
  }

  protected async getFallbackSeverity(): Promise<SeverityInfo> {
    return this.nvdItem ? getCVSSNVDInfo(this.nvdItem) : {};
  }
}

// ---------------------------------------------------------------------------
// NVD report generator
// ---------------------------------------------------------------------------

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
    vulnsData: Vulnerability,
    packageManager: string,
    dependencyData?: Dependency,
    osvItem?: OSV,
    nvdItem?: NVD,
    friendsOfPhpItem?: FriendsOfPhp,
    gcveItem?: GCVE,
  ): Promise<VulnerabilityDetailsReport> {
    this.vulnsData = vulnsData;
    this.packageManager = packageManager;
    if (dependencyData !== undefined) this.dependencyData = dependencyData;
    if (osvItem !== undefined) this.osvItem = osvItem;
    if (nvdItem !== undefined) this.nvdItem = nvdItem;
    if (gcveItem !== undefined) this.gcveItem = gcveItem;

    if (!this.nvdItem) {
      throw new Error("Failed to generate report from undefined nvd entry");
    }

    return this.assembleReport(friendsOfPhpItem);
  }

  // -- Source-specific hooks ------------------------------------------------

  protected getVulnerabilityId(): string {
    return this.nvdItem!.nvd_id;
  }

  protected getDescription(): string {
    const descriptions = this.nvdItem!.descriptions as NVDDescription[];
    for (const d of descriptions) {
      if (d.lang === "en") return d.value;
    }
    return "";
  }

  protected getPublishedDate(): string {
    return this.nvdItem!.published;
  }

  protected getLastModifiedDate(): string {
    return this.nvdItem!.lastModified;
  }

  protected buildSources(friendsOfPhpItem?: FriendsOfPhp): VulnSourceInfo[] {
    const sources: VulnSourceInfo[] = [
      {
        name: "NVD",
        vuln_url: `https://nvd.nist.gov/vuln/detail/${this.nvdItem!.nvd_id}`,
      },
    ];
    if (this.osvItem) {
      sources.push({
        name: "OSV",
        vuln_url: `https://osv.dev/vulnerability/${this.osvItem.osv_id}`,
      });
    }
    if (friendsOfPhpItem) {
      sources.push({ name: "FriendsOfPHP", vuln_url: friendsOfPhpItem.link });
    }
    if (this.gcveItem) {
      sources.push({
        name: "GCVE",
        vuln_url: `https://vulnerability.circl.lu/vuln/${this.gcveItem.cve_id || this.gcveItem.gcve_id}`,
      });
    }
    return sources;
  }

  protected buildAliases(): string[] {
    const aliases: string[] = [];
    if (this.osvItem) aliases.push(this.osvItem.osv_id);
    return aliases;
  }

  protected getReferences(): ReferenceInfo[] {
    const refs = this.nvdItem!.references as NVDReference[];
    return refs.map((r) => ({ url: r.url, tags: [] }));
  }

  protected async getPrimarySeverity(): Promise<SeverityInfo> {
    return getCVSSNVDInfo(this.nvdItem!);
  }

  protected async getFallbackSeverity(): Promise<SeverityInfo> {
    return this.osvItem ? getCVSSOSVInfo(this.osvItem) : {};
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cleanOsvDescription(description: string): string {
  const sections: string[] = [];
  let parsingHeader = false;
  let text = "";

  for (const char of description) {
    if (char === "#" && !parsingHeader) {
      if (text !== "") sections.push(text);
      parsingHeader = true;
      text = "";
      continue;
    }
    if (char !== "#") parsingHeader = false;
    if (char !== "#") text += char;
  }
  if (text !== "") sections.push(text);

  const selected: string[] = [];
  for (let i = 0; i < sections.length; i++) {
    if (i === 0) {
      selected.push(sections[i]!);
      continue;
    }
    if (sections[i]!.includes("```")) {
      selected.push(sections[i]!);
      continue;
    }
  }

  if (selected.length > 0) {
    const last = selected[selected.length - 1]!;
    let trimmed = "";
    let trimming = true;
    for (let i = last.length - 1; i >= 0; i--) {
      if (last[i] !== "\n") trimming = false;
      if (!trimming) trimmed += last[i]!;
    }
    selected[selected.length - 1] = trimmed.split("").reverse().join("");
  }

  return selected.join("\n");
}
