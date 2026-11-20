import {
  SEVERITY_ORDER,
  type VersionRange,
} from "src/codeclarity_modules/vulnerability_instances/organization-vulnerabilities.types";
import type { TopLevelDependency } from "src/codeclarity_modules/vulnerability_instances/top-level-paths";

import {
  compareVersions,
  covered,
  fixCandidates,
  fixesAbove,
  inCurrentMajor,
  newest,
  smallestFix,
} from "./fix-versions";
import {
  forceCommand,
  type PackageManager,
  type RemediationCommand,
  upgradeCommand,
} from "./package-manager-commands";
import {
  type Remediation,
  type RemediationInstance,
  RemediationKind,
} from "./remediation.types";
import type { TopLevelUpgrade } from "./top-level-upgrades";

/** One instance as the planner reads it. */
export interface PlannedInstance extends RemediationInstance {
  ecosystem: string | null;
  package_manager: PackageManager | null;
  fixed_version: string | null;
  top_level_dependencies: TopLevelDependency[];
  /** The affected ranges the knowledge sources give its package for its vulnerability */
  ranges: VersionRange[];
}

// One remediation being built, before its target and command are settled.
interface Group {
  kind: RemediationKind;
  workspace: string;
  package: string;
  installed: Set<string>;
  dev: boolean;
  instances: PlannedInstance[];
  // Per-instance targets; the group upgrades to the newest of them.
  targets: string[];
  // Set by a patcher's top-level upgrade.
  upgrade?: TopLevelUpgrade;
}

const rank = (instance: RemediationInstance): number =>
  SEVERITY_ORDER.length - SEVERITY_ORDER.indexOf(instance.severity_class);

// Worst class first, then highest score.
const worse = (a: RemediationInstance, b: RemediationInstance): number =>
  rank(b) - rank(a) || (b.severity_score ?? -1) - (a.severity_score ?? -1);

const toInstance = (instance: PlannedInstance): RemediationInstance => ({
  instance_id: instance.instance_id,
  vulnerability_id: instance.vulnerability_id,
  analysis_vulnerability_id: instance.analysis_vulnerability_id,
  package: instance.package,
  installed_version: instance.installed_version,
  workspace: instance.workspace,
  prod: instance.prod,
  severity_class: instance.severity_class,
  severity_score: instance.severity_score,
});

// The patcher's upgrade of the only top-level dependency installing the instance, when it removes it.
function topLevelUpgradeOf(
  instance: PlannedInstance,
  upgrades: TopLevelUpgrade[],
): TopLevelUpgrade | undefined {
  const tops = instance.top_level_dependencies;
  if (tops.length > 1) return undefined;
  return upgrades.find(
    (u) =>
      u.workspace === instance.workspace &&
      (tops.length === 0 ||
        (tops[0]!.name === u.name && tops[0]!.version === u.version)) &&
      u.resolves.some(
        (r) =>
          r.package === instance.package &&
          r.version === instance.installed_version &&
          r.vulnerability_id === instance.analysis_vulnerability_id,
      ),
  );
}

// The package manager of a group's instances; composer for PHP when the SBOM named none.
function managerOf(instances: PlannedInstance[]): PackageManager | null {
  const named = instances.find((i) => i.package_manager)?.package_manager;
  if (named) return named;
  return instances.some((i) => i.ecosystem === "Packagist") ? "composer" : null;
}

// The newest instance target, or the next fix when another instance's range covers it.
function groupTarget(group: Group): string {
  const target = newest(group.targets);
  const rangeSets = group.instances.map((i) => i.ranges);
  if (!rangeSets.some((set) => covered(target, set))) return target;
  const candidates = group.instances.flatMap((i) =>
    fixCandidates(i.ranges, i.fixed_version),
  );
  return fixesAbove(target, candidates, rangeSets)[0] ?? target;
}

/**
 * The remediations of one project's current analysis: each instance gets
 * the change that resolves it, and instances one change resolves are grouped.
 * A direct dependency is upgraded to its smallest fix in its current major,
 * else its smallest fix; a transitive one by a patcher's top-level upgrade
 * when one removes it, else by forcing a fixed version.
 */
export function planRemediations(
  instances: PlannedInstance[],
  upgrades: TopLevelUpgrade[],
): { remediations: Remediation[]; unremediated: RemediationInstance[] } {
  const groups = new Map<string, Group>();
  const unremediated: RemediationInstance[] = [];
  const groupOf = (
    kind: RemediationKind,
    workspace: string,
    pkg: string,
    dev: boolean,
  ): Group => {
    const key = [kind, workspace, pkg].join("\u0000");
    let group = groups.get(key);
    if (!group) {
      group = {
        kind,
        workspace,
        package: pkg,
        installed: new Set(),
        dev,
        instances: [],
        targets: [],
      };
      groups.set(key, group);
    }
    group.dev &&= dev;
    return group;
  };

  for (const instance of instances) {
    const target = smallestFix(
      instance.installed_version,
      instance.ranges,
      instance.fixed_version,
    );
    const direct = instance.top_level_dependencies.find(
      (t) => t.path.length === 1,
    );
    if (direct && target) {
      const group = groupOf(
        RemediationKind.UpgradeDirect,
        instance.workspace,
        instance.package,
        direct.dev,
      );
      group.installed.add(instance.installed_version);
      group.instances.push(instance);
      group.targets.push(target);
      continue;
    }
    const upgrade = direct ? undefined : topLevelUpgradeOf(instance, upgrades);
    if (upgrade) {
      const group = groupOf(
        RemediationKind.UpgradeTopLevel,
        instance.workspace,
        upgrade.name,
        upgrade.dev,
      );
      group.upgrade = upgrade;
      group.installed.add(upgrade.version);
      group.instances.push(instance);
      group.targets.push(upgrade.upgrade_to);
      continue;
    }
    if (!target) {
      unremediated.push(toInstance(instance));
      continue;
    }
    const group = groupOf(
      RemediationKind.ForceVersion,
      instance.workspace,
      instance.package,
      !instance.prod,
    );
    group.installed.add(instance.installed_version);
    group.instances.push(instance);
    group.targets.push(target);
  }

  const remediations = [...groups.values()].map((group): Remediation => {
    const target = group.upgrade
      ? group.upgrade.upgrade_to
      : groupTarget(group);
    const installed = [...group.installed].sort(compareVersions);
    const manager = managerOf(group.instances);
    const spec = {
      workspace: group.workspace,
      name: group.package,
      version: target,
    };
    let command: RemediationCommand | null = null;
    if (manager && group.kind === RemediationKind.ForceVersion) {
      command = forceCommand(manager, spec);
    } else if (manager) {
      command = upgradeCommand(manager, { ...spec, dev: group.dev });
    }
    return {
      kind: group.kind,
      workspace: group.workspace,
      package: group.package,
      installed_versions: installed,
      target_version: target,
      potentially_breaking: group.upgrade
        ? group.upgrade.potentially_breaking
        : installed.some((version) => !inCurrentMajor(version, target)),
      dev: group.dev,
      package_manager: manager,
      command: command?.command ?? null,
      manifest_edit: command?.manifest_edit ?? null,
      instances: group.instances.map(toInstance).sort(worse),
    };
  });
  remediations.sort(
    (a, b) =>
      worse(a.instances[0]!, b.instances[0]!) ||
      b.instances.length - a.instances.length ||
      a.package.localeCompare(b.package) ||
      a.workspace.localeCompare(b.workspace),
  );
  return { remediations, unremediated: unremediated.sort(worse) };
}
