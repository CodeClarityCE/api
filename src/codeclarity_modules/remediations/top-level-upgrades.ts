import { Injectable } from "@nestjs/common";

import type { PatchInfo } from "src/codeclarity_modules/results/patching/patching.types";
import {
  isSemver,
  semverString,
} from "src/codeclarity_modules/results/patching/semver";
import { PatchingUtilsService } from "src/codeclarity_modules/results/patching/utils/utils";

/** One upgrade of a top-level dependency that a patcher found, with the occurrences it removes. */
export interface TopLevelUpgrade {
  workspace: string;
  /** The top-level dependency as installed */
  name: string;
  version: string;
  /** True when it is one of the workspace's dev dependencies */
  dev: boolean;
  upgrade_to: string;
  potentially_breaking: boolean;
  /** Occurrences the upgrade removes, by the analysis's vulnerability id */
  resolves: { package: string; version: string; vulnerability_id: string }[];
}

/**
 * Where top-level upgrades come from. A patcher fills it per analysis; an
 * analysis it did not patch has none, and its transitive instances get a
 * forced version instead.
 */
export abstract class TopLevelUpgradeSource {
  abstract upgradesOf(analysisId: string): Promise<TopLevelUpgrade[]>;
}

// Splits a `name@version` key on its last "@", as scoped npm names start with one.
const splitKey = (key: string): [string, string] => {
  const at = key.lastIndexOf("@");
  return [key.slice(0, at), key.slice(at + 1)];
};

/** Top-level upgrades from the analysis's js-patching result, when it has one. */
@Injectable()
export class JsPatchingUpgradeSource extends TopLevelUpgradeSource {
  constructor(private readonly patching: PatchingUtilsService) {
    super();
  }

  async upgradesOf(analysisId: string): Promise<TopLevelUpgrade[]> {
    const output = await this.patching
      .getPatchingResult(analysisId)
      .catch(() => null);
    if (!output) return [];
    const upgrades: TopLevelUpgrade[] = [];
    for (const [workspace, data] of Object.entries(output.workspaces ?? {})) {
      const add = (
        patches: Record<string, PatchInfo> | undefined,
        dev: boolean,
      ): void => {
        for (const [key, info] of Object.entries(patches ?? {})) {
          if (info.IsPatchable === "NONE" || !isSemver(info.Update)) continue;
          const [name, version] = splitKey(key);
          upgrades.push({
            workspace,
            name,
            version,
            dev,
            upgrade_to: semverString(info.Update),
            potentially_breaking: info.PotentiallyBreaking ?? false,
            resolves: (info.Patchable ?? []).map((occurrence) => ({
              package: occurrence.DependencyName,
              version: occurrence.DependencyVersion,
              vulnerability_id: occurrence.Vulnerability.VulnerabilityId,
            })),
          });
        }
      };
      add(data.patches, false);
      add(data.dev_patches, true);
    }
    return upgrades;
  }
}
