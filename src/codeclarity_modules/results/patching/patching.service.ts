import { Injectable } from "@nestjs/common";
import { validRange } from "semver";

import { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import {
  ManifestUpgrade,
  Output as PatchesOutput,
  PatchedManifestData,
  PatchInfo,
  PatchingAnalysisStats,
  SemVer,
  Workspace,
} from "src/codeclarity_modules/results/patching/patching.types";
import {
  Output as SbomOutput,
  WorkSpaceDependency,
} from "src/codeclarity_modules/results/sbom/sbom.types";
import {
  StatusError,
  StatusResponse,
} from "src/codeclarity_modules/results/status.types";
import { UnknownWorkspace, Unsupported } from "src/types/error.types";

import { AnalysisResultsService } from "../results.service";
import { SbomUtilsService } from "../sbom/utils/utils";
import {
  computeVulnerabilityStats,
  StatsFinding,
} from "../vulnerabilities/utils/stats";
import { VulnerabilitiesUtilsService } from "../vulnerabilities/utils/utils.service";
import {
  Severity,
  VulnerabilityAnalysisStats,
} from "../vulnerabilities/vulnerabilities.types";

import { PatchingUtilsService } from "./utils/utils";

/** Query options for patching list endpoint */
export interface PatchingQueryOptions {
  workspace: string;
}

@Injectable()
export class PatchingService {
  constructor(
    private readonly analysisResultsService: AnalysisResultsService,
    private readonly patchingUtilsService: PatchingUtilsService,
    private readonly sbomUtilsService: SbomUtilsService,
    private readonly vulnerabilitiesUtilsService: VulnerabilitiesUtilsService,
  ) {}

  async getPatches(
    orgId: string,
    projectId: string,
    analysisId: string,
    user: AuthenticatedUser,
    options: PatchingQueryOptions,
  ): Promise<Workspace> {
    await this.analysisResultsService.checkAccess(
      orgId,
      projectId,
      analysisId,
      user,
    );

    const { workspace } = options;

    const patchesOutput: PatchesOutput =
      await this.patchingUtilsService.getPatchingResult(analysisId);
    if (!Object.hasOwn(patchesOutput.workspaces, workspace)) {
      throw new UnknownWorkspace();
    }

    return patchesOutput.workspaces[workspace]!;
  }

  async getPatchedManifest(
    orgId: string,
    projectId: string,
    analysisId: string,
    user: AuthenticatedUser,
    workspace: string,
  ): Promise<PatchedManifestData> {
    await this.analysisResultsService.checkAccess(
      orgId,
      projectId,
      analysisId,
      user,
    );

    const patchesOutput: PatchesOutput =
      await this.patchingUtilsService.getPatchingResult(analysisId);
    // The patches describe npm packages, so only the JavaScript dependency list applies.
    const sbomOutput: SbomOutput = await this.sbomUtilsService.getSbomResult(
      analysisId,
      ["js-sbom"],
    );

    if (
      !Object.hasOwn(patchesOutput.workspaces, workspace) ||
      !Object.hasOwn(sbomOutput.workspaces ?? {}, workspace)
    ) {
      throw new UnknownWorkspace();
    }
    const patches = patchesOutput.workspaces[workspace]!;
    const sbomWorkspace = sbomOutput.workspaces[workspace]!;

    const packageManager = sbomOutput.analysis_info.package_manager;
    if (!JS_PACKAGE_MANAGERS.has(packageManager)) {
      throw new Unsupported();
    }

    const dependencies = manifestUpgrades(
      sbomWorkspace.start.dependencies ?? [],
      patches.patches ?? {},
    );
    const devDependencies = manifestUpgrades(
      sbomWorkspace.start.dev_dependencies ?? [],
      patches.dev_patches ?? {},
    );
    return {
      patched_manifest: { dependencies, devDependencies },
      patched_manifest_raw: JSON.stringify(
        {
          dependencies: upgradedConstraints(dependencies),
          devDependencies: upgradedConstraints(devDependencies),
        },
        null,
        2,
      ),
      other_info: {
        package_manager: packageManager,
        relative_package_file:
          workspace === "." ? "package.json" : `${workspace}/package.json`,
      },
    };
  }

  async getStats(
    orgId: string,
    projectId: string,
    analysisId: string,
    user: AuthenticatedUser,
    workspace: string,
  ): Promise<PatchingAnalysisStats> {
    await this.analysisResultsService.checkAccess(
      orgId,
      projectId,
      analysisId,
      user,
    );

    const patchesOutput: PatchesOutput =
      await this.patchingUtilsService.getPatchingResult(analysisId);
    if (!Object.hasOwn(patchesOutput.workspaces, workspace)) {
      throw new UnknownWorkspace();
    }
    const patches = patchesOutput.workspaces[workspace]!;

    const before = await this.vulnerabilitiesUtilsService.getFindingsData(
      analysisId,
      workspace,
    );
    const { mergedSbom } =
      await this.sbomUtilsService.getMergedSbomResults(analysisId);
    const dependencies = Object.hasOwn(mergedSbom.workspaces, workspace)
      ? (mergedSbom.workspaces[workspace]?.dependencies ?? {})
      : {};

    return toPatchingStats(
      computeVulnerabilityStats(before, dependencies),
      computeVulnerabilityStats(afterPatching(before, patches), dependencies),
    );
  }

  async getStatus(
    orgId: string,
    projectId: string,
    analysisId: string,
    user: AuthenticatedUser,
  ): Promise<StatusResponse> {
    await this.analysisResultsService.checkAccess(
      orgId,
      projectId,
      analysisId,
      user,
    );

    const patchesOutput: PatchesOutput =
      await this.patchingUtilsService.getPatchingResult(analysisId);

    if (patchesOutput.analysis_info.private_errors.length) {
      return {
        public_errors: patchesOutput.analysis_info
          .public_errors as StatusError[],
        private_errors: patchesOutput.analysis_info
          .private_errors as StatusError[],
        stage_start: patchesOutput.analysis_info.analysis_start_time,
        stage_end: patchesOutput.analysis_info.analysis_end_time,
      };
    }
    return {
      public_errors: [],
      private_errors: [],
      stage_start: patchesOutput.analysis_info.analysis_start_time,
      stage_end: patchesOutput.analysis_info.analysis_end_time,
    };
  }
}

const JS_PACKAGE_MANAGERS = new Set(["NPM", "YARN", "PNPM"]);

/** Each direct dependency with the upgrade its patch suggests, if it has one. */
function manifestUpgrades(
  direct: WorkSpaceDependency[],
  patches: Record<string, PatchInfo>,
): Record<string, ManifestUpgrade> {
  const upgrades: Record<string, ManifestUpgrade> = {};
  for (const dependency of direct) {
    const patch = patches[`${dependency.name}@${dependency.version}`];
    const upgradable = patch !== undefined && patch.IsPatchable !== "NONE";
    upgrades[dependency.name] = {
      original_constraint: dependency.constraint,
      vulnerable: patch !== undefined,
      patch_type: patch?.IsPatchable ?? null,
      upgrade_to: upgradable ? semverString(patch.Update) : null,
      potential_breaking_changes:
        upgradable && patch.PotentiallyBreaking === true,
    };
  }
  return upgrades;
}

function semverString(version: SemVer): string {
  const base = `${version.Major}.${version.Minor}.${version.Patch}`;
  return version.PreReleaseTag ? `${base}-${version.PreReleaseTag}` : base;
}

/**
 * The manifest constraints after upgrading; a ^ or ~ range keeps its operator.
 * Only registry ranges are rewritten: git, file, workspace, url and tag specs stay as written.
 * An npm alias is left out, since the SBOM names the real package, not the declared key.
 */
function upgradedConstraints(
  upgrades: Record<string, ManifestUpgrade>,
): Record<string, string> {
  const constraints: Record<string, string> = {};
  for (const [name, upgrade] of Object.entries(upgrades)) {
    const original = upgrade.original_constraint;
    if (original.startsWith("npm:")) continue;
    if (upgrade.upgrade_to === null || validRange(original) === null) {
      constraints[name] = original;
      continue;
    }
    const operator = /^[\^~]\d/.test(original) ? original[0] : "";
    constraints[name] = `${operator}${upgrade.upgrade_to}`;
  }
  return constraints;
}

/** One vulnerability in one installed dependency version, as the vulnerabilities tab matches them. */
function instanceKey(
  vuln: Pick<
    StatsFinding,
    "VulnerabilityId" | "AffectedDependency" | "AffectedVersion"
  >,
): string {
  return `${vuln.VulnerabilityId}|${vuln.AffectedDependency}@${vuln.AffectedVersion}`;
}

/**
 * The instances left after every suggested upgrade: today's, minus those fixed in every
 * patch that lists them, plus those the upgrades introduce.
 */
function afterPatching(
  before: StatsFinding[],
  patches: Workspace,
): StatsFinding[] {
  const all = [
    ...Object.values(patches.patches ?? {}),
    ...Object.values(patches.dev_patches ?? {}),
  ];
  const patchable = new Set<string>();
  const unpatchable = new Set<string>();
  for (const patch of all) {
    for (const entry of patch.Patchable ?? [])
      patchable.add(instanceKey(entry.Vulnerability));
    for (const entry of patch.Unpatchable ?? [])
      unpatchable.add(instanceKey(entry.Vulnerability));
  }
  const fixed = (key: string): boolean =>
    patchable.has(key) && !unpatchable.has(key);

  const after = before.filter((finding) => !fixed(instanceKey(finding)));
  const present = new Set(after.map(instanceKey));
  for (const patch of all) {
    for (const entry of patch.Introduced ?? []) {
      const key = instanceKey(entry.Vulnerability);
      if (present.has(key)) continue;
      present.add(key);
      after.push(introducedFinding(entry.Vulnerability));
    }
  }
  return after;
}

/** An introduced instance as a finding; it has no severity when the plugin found none. */
function introducedFinding(
  vuln: PatchInfo["Introduced"][number]["Vulnerability"],
): StatsFinding {
  // A zero-value severity (no type, no vector) means no severity data.
  const severity = vuln.Severity as Partial<Severity> | null | undefined;
  const hasSeverity =
    (severity?.SeverityType ?? "") !== "" || (severity?.Vector ?? "") !== "";
  return {
    VulnerabilityId: vuln.VulnerabilityId,
    AffectedDependency: vuln.AffectedDependency,
    AffectedVersion: vuln.AffectedVersion,
    Severity: hasSeverity
      ? {
          Severity: severity?.Severity ?? 0,
          ConfidentialityImpact: severity?.ConfidentialityImpact ?? "",
          IntegrityImpact: severity?.IntegrityImpact ?? "",
          AvailabilityImpact: severity?.AvailabilityImpact ?? "",
        }
      : null,
  };
}

/** The before and after stats as the Patches tab reads them. */
function toPatchingStats(
  before: VulnerabilityAnalysisStats,
  after: VulnerabilityAnalysisStats,
): PatchingAnalysisStats {
  const stats = {} as PatchingAnalysisStats;
  for (const [prefix, source] of [
    ["before_patch_", before],
    ["after_patch_", after],
  ] as const) {
    Object.assign(stats, {
      [`${prefix}number_of_issues`]: source.number_of_issues,
      [`${prefix}number_of_vulnerabilities`]: source.number_of_vulnerabilities,
      [`${prefix}number_of_vulnerable_dependencies`]:
        source.number_of_vulnerable_dependencies,
      [`${prefix}number_of_direct_vulnerabilities`]:
        source.number_of_direct_vulnerabilities,
      [`${prefix}number_of_transitive_vulnerabilities`]:
        source.number_of_transitive_vulnerabilities,
      [`${prefix}mean_severity`]: source.mean_severity,
      [`${prefix}max_severity`]: source.max_severity,
      [`${prefix}number_of_critical`]: source.number_of_critical,
      [`${prefix}number_of_high`]: source.number_of_high,
      [`${prefix}number_of_medium`]: source.number_of_medium,
      [`${prefix}number_of_low`]: source.number_of_low,
      [`${prefix}number_of_none`]: source.number_of_none,
      [`${prefix}overall_confidentiality_impact`]:
        source.mean_confidentiality_impact,
      [`${prefix}overall_integrity_impact`]: source.mean_integrity_impact,
      [`${prefix}overall_availability_impact`]: source.mean_availability_impact,
    });
  }
  return stats;
}
