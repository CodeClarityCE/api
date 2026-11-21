import type { SeverityClass } from "src/codeclarity_modules/results/utils/utils";

import type { ManifestEdit, PackageManager } from "./package-manager-commands";

/** What a remediation changes (see "Remediation" in GLOSSARY.md). */
export enum RemediationKind {
  /** Upgrade a vulnerable package the workspace declares itself */
  UpgradeDirect = "upgrade_direct",
  /** Upgrade the top-level dependency that installs a vulnerable package */
  UpgradeTopLevel = "upgrade_top_level",
  /** Make every dependent install a fixed version of a vulnerable package */
  ForceVersion = "force_version",
}

/** One vulnerability instance of a project's current analysis. */
export interface RemediationInstance {
  /** The instance row's id; it changes with each analysis */
  instance_id: string;
  vulnerability_id: string;
  /** The id the analysis's results use */
  analysis_vulnerability_id: string;
  package: string;
  installed_version: string;
  workspace: string;
  prod: boolean;
  severity_class: SeverityClass;
  severity_score: number | null;
  /** True when the KEV catalog lists the vulnerability or one of its aliases */
  known_exploited: boolean;
  /** Its other ids, such as the CVE of a GHSA advisory */
  aliases: string[];
}

/** One change to one project that resolves one or more of its vulnerability instances. */
export interface Remediation {
  kind: RemediationKind;
  workspace: string;
  /** The package the change upgrades or forces */
  package: string;
  /** Its installed versions, oldest first */
  installed_versions: string[];
  target_version: string;
  /** True when the target leaves the current major of an installed version */
  potentially_breaking: boolean;
  /** True when the change is to development dependencies only */
  dev: boolean;
  /** Null when the analysis names no package manager we have commands for */
  package_manager: PackageManager | null;
  /** What to run in the project's root; null without a package manager */
  command: string | null;
  /** An edit to make before running the command, such as pnpm overrides */
  manifest_edit: ManifestEdit | null;
  /** Worst severity first */
  instances: RemediationInstance[];
}

/** The remediations of one project's current analysis. */
export interface ProjectRemediations {
  project_id: string;
  /** The project's current analysis */
  analysis_id: string;
  /** Worst resolved severity first, then most instances */
  remediations: Remediation[];
  /** Instances no known fixed version resolves */
  unremediated: RemediationInstance[];
}
