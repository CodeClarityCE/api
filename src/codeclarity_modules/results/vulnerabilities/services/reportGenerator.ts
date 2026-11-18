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
  ReferenceInfo,
  SeverityInfo,
  Vulnerability,
  VulnerabilityDetailsReport,
  VulnerabilityInfoReport,
  VulnerableVersionInfoReport,
  VulnSourceInfo,
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
  sources?: {
    criteriaDict?: {
      product?: string;
      vendor?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  }[];
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
// Per-report inputs
// ---------------------------------------------------------------------------

/** Everything one report is built from; never kept between reports. */
interface ReportContext {
  readonly vuln: Vulnerability;
  readonly packageManager: string;
  readonly dependency?: Dependency | undefined;
  readonly osv?: OSV | undefined;
  readonly nvd?: NVD | undefined;
  readonly gcve?: GCVE | undefined;
  readonly friendsOfPhp?: FriendsOfPhp | undefined;
}

// ---------------------------------------------------------------------------
// Base report generator
// ---------------------------------------------------------------------------

abstract class BaseReportGenerator {
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

  // Source the affected versions string prefers.
  protected abstract readonly primarySource: "OSV" | "NVD";

  // -------------------------------------------------------------------------
  // Abstract hooks – subclasses implement source-specific logic
  // -------------------------------------------------------------------------

  protected abstract getVulnerabilityId(ctx: ReportContext): string;
  protected abstract getDescription(ctx: ReportContext): string;
  protected abstract getPublishedDate(ctx: ReportContext): string;
  protected abstract getLastModifiedDate(ctx: ReportContext): string;
  protected abstract buildSources(ctx: ReportContext): VulnSourceInfo[];
  protected abstract buildAliases(ctx: ReportContext): string[];
  protected abstract getReferences(ctx: ReportContext): ReferenceInfo[];
  protected abstract getPrimarySeverity(
    ctx: ReportContext,
  ): Promise<SeverityInfo>;
  protected abstract getFallbackSeverity(
    ctx: ReportContext,
  ): Promise<SeverityInfo>;

  // -------------------------------------------------------------------------
  // Affected versions (delegates to range extractor)
  // -------------------------------------------------------------------------

  private getVulnerableVersionsString(
    ctx: ReportContext,
    source: string,
  ): { versions: string; source: string } {
    // Try to build affected string from knowledge-DB data
    const result = this.getDirectAffectedVersions(ctx, source);
    if (result) return result;

    // Fallback to AffectedInfo from vuln-finder analysis results
    const affectedData = this.getAffectedDataBySource(ctx.vuln, source);
    const affectedStringParts = this.buildAffectedStringParts(affectedData);

    // Final fallback for framework vulnerabilities
    const isFramework = ctx.vuln.AffectedDependency?.startsWith("framework-");
    if (
      affectedStringParts.length === 0 &&
      isFramework &&
      ctx.vuln.AffectedVersion
    ) {
      return {
        versions: `${ctx.vuln.AffectedVersion} (check advisory for details)`,
        source,
      };
    }

    return { versions: affectedStringParts.join(" || "), source };
  }

  private getDirectAffectedVersions(
    ctx: ReportContext,
    preferredSource: string,
  ): { versions: string; source: string } | null {
    const sourceOrders: Record<string, readonly string[]> = {
      NVD: ["NVD", "OSV", "GCVE"],
      GCVE: ["GCVE", "OSV", "NVD"],
    };
    const order = sourceOrders[preferredSource] ?? ["OSV", "NVD", "GCVE"];

    const packageName = ctx.vuln.AffectedDependency || "";

    for (const src of order) {
      let entries: SourceRangeData[] = [];
      if (src === "NVD" && ctx.nvd) {
        entries = extractNVDRanges(ctx.nvd);
        entries = filterNVDByPackage(entries, packageName);
      } else if (src === "OSV" && ctx.osv) {
        entries = extractOSVRanges(ctx.osv);
      } else if (src === "GCVE" && ctx.gcve) {
        entries = extractGCVERanges(ctx.gcve);
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

  private getAffectedDataBySource(
    vuln: Vulnerability,
    source: string,
  ): AffectedInfo {
    if (source === "NVD") {
      if (vuln.NVDMatch?.AffectedInfo?.length > 0) {
        return vuln.NVDMatch.AffectedInfo[0]!;
      }
    } else if (source === "GCVE") {
      const gcveMatch = vuln.GCVEMatch;
      if (gcveMatch?.AffectedInfo && gcveMatch.AffectedInfo.length > 0) {
        return gcveMatch.AffectedInfo[0]!;
      }
    } else {
      if (vuln.OSVMatch?.AffectedInfo?.length > 0) {
        return vuln.OSVMatch.AffectedInfo[0]!;
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
  // Version status array
  // -------------------------------------------------------------------------

  private getVersionsStatusArray(
    affectedVersionsString: string,
  ): VulnerableVersionInfoReport[] {
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
  // Weaknesses / CWE
  // -------------------------------------------------------------------------

  private async getWeaknessData(
    vuln: Vulnerability,
  ): Promise<[WeaknessInfoReport[], Record<string, CommonConsequencesInfo[]>]> {
    const consequences: Record<string, CommonConsequencesInfo[]> = {};
    const weaknesses: WeaknessInfoReport[] = [];

    if (!vuln.Weaknesses) return [weaknesses, consequences];

    for (const weakness of vuln.Weaknesses) {
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
        if (
          cweInfo.common_consequences &&
          Array.isArray(cweInfo.common_consequences)
        ) {
          const arr: CommonConsequencesInfo[] = [];
          for (const cc of cweInfo.common_consequences as {
            Scope?: string[];
            Impact?: string[];
            Note?: string;
          }[]) {
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

  private getDependencyData(ctx: ReportContext): DependencyInfoReport {
    const info: DependencyInfoReport = {
      name: "",
      published: "",
      description: "",
      keywords: [],
      version: "",
      package_manager_links: [],
    };

    if (!ctx.dependency) {
      console.warn("No dependency data available for vulnerability report");
    }

    return info;
  }

  // -------------------------------------------------------------------------
  // OWASP Top 10
  // -------------------------------------------------------------------------

  private getOwaspTop10Info(vuln: Vulnerability): OwaspTop10Info | null {
    if (!vuln.Weaknesses) return null;

    for (const weakness of vuln.Weaknesses) {
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
  // Framework package name extraction
  // -------------------------------------------------------------------------

  private extractFrameworkPackageName(
    ctx: ReportContext,
    fallbackName: string,
  ): string {
    if (ctx.osv?.affected) {
      const entries = ctx.osv.affected as OSVAffectedEntry[];
      for (const entry of entries) {
        if (entry.package?.name) return entry.package.name;
      }
    }
    if (ctx.nvd?.affected) {
      const entries = ctx.nvd.affected as NVDAffectedEntry[];
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
    ctx: ReportContext,
  ): Promise<VulnerabilityDetailsReport> {
    const { vuln } = ctx;

    // Vulnerability info
    const vulnInfo: VulnerabilityInfoReport = {
      vulnerability_id: this.getVulnerabilityId(ctx),
      description: this.getDescription(ctx),
      version_info: {
        affected_versions_string: "",
        patched_versions_string: "",
        versions: [],
      },
      published: this.getPublishedDate(ctx),
      last_modified: this.getLastModifiedDate(ctx),
      sources: this.buildSources(ctx),
      aliases: this.buildAliases(ctx),
    };

    const affectedResult = this.getVulnerableVersionsString(
      ctx,
      this.primarySource,
    );
    vulnInfo.version_info.affected_versions_string = affectedResult.versions;
    vulnInfo.version_info.affected_versions_source = affectedResult.source;
    vulnInfo.version_info.versions = this.getVersionsStatusArray(
      affectedResult.versions,
    );
    vulnInfo.version_info.source_comparison = buildSourceComparison(
      vuln.AffectedVersion || "",
      vuln.AffectedDependency || "",
      ctx.nvd,
      ctx.osv,
      ctx.gcve,
    );

    // Dependency info
    const dependencyInfo = this.getDependencyData(ctx);
    let displayName = vuln.AffectedDependency || "";
    if (displayName.startsWith("framework-")) {
      displayName = this.extractFrameworkPackageName(ctx, displayName);
    }
    dependencyInfo.name = displayName;
    dependencyInfo.version = vuln.AffectedVersion || "";
    if (!vuln.AffectedDependency || !vuln.AffectedVersion) {
      console.warn("Missing dependency info in vulnerability data:", {
        vulnId: vuln.VulnerabilityId,
        affectedDep: vuln.AffectedDependency,
        affectedVersion: vuln.AffectedVersion,
      });
    }

    // Weaknesses and consequences
    const [weaknesses, consequences] = await this.getWeaknessData(vuln);

    // Severity (primary then fallback)
    let severityInfo = await this.getPrimarySeverity(ctx);
    if (!severityInfo.cvss_2 && !severityInfo.cvss_31 && !severityInfo.cvss_3) {
      severityInfo = await this.getFallbackSeverity(ctx);
    }

    return {
      vulnerability_info: vulnInfo,
      dependency_info: dependencyInfo,
      weaknesses,
      severities: severityInfo,
      common_consequences: consequences,
      // Patch data is not loaded for reports yet.
      patch: undefined as unknown as PatchInfo,
      references: this.getReferences(ctx),
      owasp_top_10: this.getOwaspTop10Info(vuln),
      location: [],
      other: { package_manager: ctx.packageManager },
    };
  }
}

// ---------------------------------------------------------------------------
// OSV report generator
// ---------------------------------------------------------------------------

@Injectable()
export class OSVReportGenerator extends BaseReportGenerator {
  protected readonly primarySource = "OSV";

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
    if (!osvItem) {
      throw new Error("Failed to generate report from undefined nvd entry");
    }

    return this.assembleReport({
      vuln: vulnsData,
      packageManager,
      dependency: dependencyData,
      osv: osvItem,
      nvd: nvdItem,
      gcve: gcveItem,
      friendsOfPhp: friendsOfPhpItem,
    });
  }

  // -- Source-specific hooks ------------------------------------------------

  protected getVulnerabilityId(ctx: ReportContext): string {
    return ctx.osv!.cve ?? ctx.osv!.osv_id;
  }

  protected getDescription(ctx: ReportContext): string {
    return cleanOsvDescription(ctx.osv!.details);
  }

  protected getPublishedDate(ctx: ReportContext): string {
    return ctx.osv!.published;
  }

  protected getLastModifiedDate(ctx: ReportContext): string {
    return ctx.osv!.modified;
  }

  protected buildSources(ctx: ReportContext): VulnSourceInfo[] {
    const sources: VulnSourceInfo[] = [
      {
        name: "OSV",
        vuln_url: `https://osv.dev/vulnerability/${ctx.osv!.osv_id}`,
      },
    ];
    if (ctx.nvd) {
      sources.push({
        name: "NVD",
        vuln_url: `https://nvd.nist.gov/vuln/detail/${ctx.nvd.nvd_id}`,
      });
    }
    if (ctx.friendsOfPhp) {
      sources.push({ name: "FriendsOfPHP", vuln_url: ctx.friendsOfPhp.link });
    }
    if (ctx.gcve) {
      sources.push({
        name: "GCVE",
        vuln_url: `https://vulnerability.circl.lu/vuln/${ctx.gcve.cve_id || ctx.gcve.gcve_id}`,
      });
    }
    return sources;
  }

  protected buildAliases(ctx: ReportContext): string[] {
    const aliases = [ctx.osv!.osv_id];
    if (ctx.osv!.cve) aliases.push(ctx.osv!.cve);
    return aliases;
  }

  protected getReferences(ctx: ReportContext): ReferenceInfo[] {
    if (!ctx.osv?.references) return [];
    const refs = ctx.osv.references as OSVReference[];
    return uniqueReferences(refs.map((r) => ({ url: r.url, tags: [r.type] })));
  }

  protected async getPrimarySeverity(
    ctx: ReportContext,
  ): Promise<SeverityInfo> {
    return getCVSSOSVInfo(ctx.osv!);
  }

  protected async getFallbackSeverity(
    ctx: ReportContext,
  ): Promise<SeverityInfo> {
    return ctx.nvd ? getCVSSNVDInfo(ctx.nvd) : {};
  }
}

// ---------------------------------------------------------------------------
// NVD report generator
// ---------------------------------------------------------------------------

@Injectable()
export class NVDReportGenerator extends BaseReportGenerator {
  protected readonly primarySource = "NVD";

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
    if (!nvdItem) {
      throw new Error("Failed to generate report from undefined nvd entry");
    }

    return this.assembleReport({
      vuln: vulnsData,
      packageManager,
      dependency: dependencyData,
      osv: osvItem,
      nvd: nvdItem,
      gcve: gcveItem,
      friendsOfPhp: friendsOfPhpItem,
    });
  }

  // -- Source-specific hooks ------------------------------------------------

  protected getVulnerabilityId(ctx: ReportContext): string {
    return ctx.nvd!.nvd_id;
  }

  protected getDescription(ctx: ReportContext): string {
    const descriptions = ctx.nvd!.descriptions as NVDDescription[];
    for (const d of descriptions) {
      if (d.lang === "en") return d.value;
    }
    return "";
  }

  protected getPublishedDate(ctx: ReportContext): string {
    return ctx.nvd!.published;
  }

  protected getLastModifiedDate(ctx: ReportContext): string {
    return ctx.nvd!.lastModified;
  }

  protected buildSources(ctx: ReportContext): VulnSourceInfo[] {
    const sources: VulnSourceInfo[] = [
      {
        name: "NVD",
        vuln_url: `https://nvd.nist.gov/vuln/detail/${ctx.nvd!.nvd_id}`,
      },
    ];
    if (ctx.osv) {
      sources.push({
        name: "OSV",
        vuln_url: `https://osv.dev/vulnerability/${ctx.osv.osv_id}`,
      });
    }
    if (ctx.friendsOfPhp) {
      sources.push({ name: "FriendsOfPHP", vuln_url: ctx.friendsOfPhp.link });
    }
    if (ctx.gcve) {
      sources.push({
        name: "GCVE",
        vuln_url: `https://vulnerability.circl.lu/vuln/${ctx.gcve.cve_id || ctx.gcve.gcve_id}`,
      });
    }
    return sources;
  }

  protected buildAliases(ctx: ReportContext): string[] {
    const aliases: string[] = [];
    if (ctx.osv) aliases.push(ctx.osv.osv_id);
    return aliases;
  }

  protected getReferences(ctx: ReportContext): ReferenceInfo[] {
    const refs = ctx.nvd!.references as NVDReference[];
    return uniqueReferences(refs.map((r) => ({ url: r.url, tags: [] })));
  }

  protected async getPrimarySeverity(
    ctx: ReportContext,
  ): Promise<SeverityInfo> {
    return getCVSSNVDInfo(ctx.nvd!);
  }

  protected async getFallbackSeverity(
    ctx: ReportContext,
  ): Promise<SeverityInfo> {
    return ctx.osv ? getCVSSOSVInfo(ctx.osv) : {};
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** One entry per URL, in first-seen order, with the tags of every copy. */
export function uniqueReferences(refs: ReferenceInfo[]): ReferenceInfo[] {
  const byUrl = new Map<string, ReferenceInfo>();
  for (const ref of refs) {
    const seen = byUrl.get(ref.url);
    if (!seen) {
      byUrl.set(ref.url, { url: ref.url, tags: [...ref.tags] });
      continue;
    }
    for (const tag of ref.tags) {
      if (!seen.tags.includes(tag)) seen.tags.push(tag);
    }
  }
  return [...byUrl.values()];
}

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
