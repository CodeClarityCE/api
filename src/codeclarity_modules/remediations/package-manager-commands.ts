/** The package managers commands are built for. */
const PACKAGE_MANAGERS = ["npm", "yarn", "pnpm", "bun", "composer"] as const;

export type PackageManager = (typeof PACKAGE_MANAGERS)[number];

/** A manifest edit to make before running a command. */
export interface ManifestEdit {
  file: string;
  /** The lines to merge into the file */
  text: string;
}

/** What to run for one remediation, in the project's root. */
export interface RemediationCommand {
  command: string;
  manifest_edit: ManifestEdit | null;
}

/** One package to upgrade to a version range. */
export interface UpgradeSpec {
  workspace: string;
  name: string;
  version: string;
  dev: boolean;
}

/** One package every dependent is forced to install at one version. */
export interface ForceSpec {
  workspace: string;
  name: string;
  version: string;
}

interface ManagerInfo {
  add: string;
  addDev: string;
  // Joins a package name and version range, such as "express@^5.0.1".
  spec: (name: string, range: string) => string;
  // Runs a command for a workspace other than the root.
  inWorkspace: (command: string, workspace: string) => string;
  force: (spec: ForceSpec) => RemediationCommand;
}

// Quotes a value for a POSIX shell unless it is plainly safe.
const shellArg = (value: string): string =>
  /^[\w@%+=:,./^~-]+$/.test(value)
    ? value
    : `'${value.replace(/'/g, `'\\''`)}'`;

const npmSpec = (name: string, range: string): string =>
  shellArg(`${name}@${range}`);
const cdInto = (command: string, workspace: string): string =>
  `cd ${shellArg(workspace)} && ${command}`;

// Sets a field of the root package.json with npm, which every Node install has.
const npmPkgSet =
  (field: string, install: string) =>
  ({ name, version }: ForceSpec): RemediationCommand => ({
    command: `npm pkg set ${shellArg(`${field}[${name}]=${version}`)} && ${install}`,
    manifest_edit: null,
  });

const MANAGERS: Record<PackageManager, ManagerInfo> = {
  npm: {
    add: "npm install",
    addDev: "npm install --save-dev",
    spec: npmSpec,
    inWorkspace: (command, workspace) =>
      `${command} --workspace ${shellArg(workspace)}`,
    force: npmPkgSet("overrides", "npm install"),
  },
  yarn: {
    add: "yarn add",
    addDev: "yarn add --dev",
    spec: npmSpec,
    inWorkspace: cdInto,
    force: npmPkgSet("resolutions", "yarn install"),
  },
  pnpm: {
    add: "pnpm add",
    addDev: "pnpm add --save-dev",
    spec: npmSpec,
    inWorkspace: (command, workspace) =>
      `${command} --filter ${shellArg(`./${workspace}`)}`,
    // pnpm reads overrides from pnpm-workspace.yaml.
    force: ({ name, version }) => ({
      command: "pnpm install",
      manifest_edit: {
        file: "pnpm-workspace.yaml",
        text: `overrides:\n  ${JSON.stringify(name)}: ${JSON.stringify(version)}\n`,
      },
    }),
  },
  bun: {
    add: "bun add",
    addDev: "bun add --dev",
    spec: npmSpec,
    inWorkspace: cdInto,
    force: npmPkgSet("overrides", "bun install"),
  },
  composer: {
    add: "composer require",
    addDev: "composer require --dev",
    spec: (name, range) => shellArg(`${name}:${range}`),
    inWorkspace: cdInto,
    force: ({ workspace, name }) => ({
      command: inWorkspace(
        "composer",
        `composer update ${shellArg(name)} --with-dependencies`,
        workspace,
      ),
      manifest_edit: null,
    }),
  },
};

function inWorkspace(
  manager: PackageManager,
  command: string,
  workspace: string,
): string {
  return workspace === "." || workspace === ""
    ? command
    : MANAGERS[manager].inWorkspace(command, workspace);
}

/** The package manager an SBOM names, in any case; null when it is not one we know. */
export function toPackageManager(value: unknown): PackageManager | null {
  const name = typeof value === "string" ? value.toLowerCase() : "";
  return (PACKAGE_MANAGERS as readonly string[]).includes(name)
    ? (name as PackageManager)
    : null;
}

/** The command that upgrades one dependency to at least `version`, keeping later releases of its major. */
export function upgradeCommand(
  manager: PackageManager,
  upgrade: UpgradeSpec,
): RemediationCommand {
  const info = MANAGERS[manager];
  const add = upgrade.dev ? info.addDev : info.add;
  return {
    command: inWorkspace(
      manager,
      `${add} ${info.spec(upgrade.name, `^${upgrade.version}`)}`,
      upgrade.workspace,
    ),
    manifest_edit: null,
  };
}

/** The command that pins every dependent to one version: overrides, resolutions or composer's --with-dependencies. */
export function forceCommand(
  manager: PackageManager,
  force: ForceSpec,
): RemediationCommand {
  return MANAGERS[manager].force(force);
}
