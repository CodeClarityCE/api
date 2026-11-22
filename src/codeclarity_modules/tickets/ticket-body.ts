import type { ManifestEdit } from "src/codeclarity_modules/remediations/package-manager-commands";
import { RemediationKind } from "src/codeclarity_modules/remediations/remediation.types";
import type { InstanceDiffLinks } from "src/codeclarity_modules/vulnerability_instances/organization-vulnerabilities.types";
import type { TopLevelDependency } from "src/codeclarity_modules/vulnerability_instances/top-level-paths";

import type { Ticket } from "./ticket.entity";

/** The remediation fields the ticket body names. */
export interface BodyRemediation {
  kind: RemediationKind;
  workspace: string;
  package: string;
  target_version: string;
  installed_versions: string[];
  potentially_breaking: boolean;
  command: string | null;
  manifest_edit: ManifestEdit | null;
}

/** One resolved vulnerability instance as the ticket body lists it. */
export interface BodyInstance {
  vulnerability_id: string;
  severity_class: string;
  severity_score: number | null;
  package: string;
  installed_version: string;
  fixed_version: string | null;
  top_level_dependencies: TopLevelDependency[];
  /** False once the current analysis no longer has it */
  is_active?: boolean;
  diff_links?: InstanceDiffLinks;
}

const VERB: Record<RemediationKind, string> = {
  [RemediationKind.UpgradeDirect]: "Upgrade",
  [RemediationKind.UpgradeTopLevel]: "Upgrade",
  [RemediationKind.ForceVersion]: "Force",
};

/** The ticket title naming a remediation, such as "Upgrade lodash to 4.17.21". */
export function remediationTitle(
  remediation: Pick<
    BodyRemediation,
    "kind" | "workspace" | "package" | "target_version"
  >,
): string {
  const where =
    remediation.workspace === "." ? "" : ` in ${remediation.workspace}`;
  return `${VERB[remediation.kind]} ${remediation.package} to ${remediation.target_version}${where}`.slice(
    0,
    200,
  );
}

/** A top-level path written as "express@4.17.0 > qs@6.5.0". */
function pathText(dependency: TopLevelDependency): string {
  return dependency.path.map((p) => `${p.name}@${p.version}`).join(" > ");
}

// The link lines of one instance, indented under it.
function linkLines(links: InstanceDiffLinks | undefined): string[] {
  if (!links) return [];
  const lines = links.fix_commits.map((c) => `  - Fix commit: ${c.url}`);
  if (links.compare) {
    lines.push(`  - Compare (guessed tags): ${links.compare.url}`);
  }
  if (links.registry_diff) {
    lines.push(`  - Registry diff: \`${links.registry_diff.command}\``);
  }
  return lines;
}

/**
 * The remediation in Markdown (change, resolved vulnerabilities, manifest edit, command),
 * shared by the ticket description and the external issue.
 */
export function remediationMarkdown(
  remediation: BodyRemediation,
  instances: BodyInstance[],
): string {
  const lines = [`**${remediationTitle(remediation)}**`, ""];
  if (remediation.installed_versions.length > 0) {
    lines.push(`Installed: ${remediation.installed_versions.join(", ")}`, "");
  }
  if (remediation.potentially_breaking) {
    lines.push(
      "This is potentially breaking: it leaves the current major.",
      "",
    );
  }
  lines.push("**Resolves**", "");
  for (const instance of instances) {
    const score =
      instance.severity_score === null
        ? ""
        : ` ${instance.severity_score.toFixed(1)}`;
    const fixed = instance.fixed_version
      ? `, fixed in ${instance.fixed_version}`
      : "";
    const resolved = instance.is_active === false ? " (resolved)" : "";
    lines.push(
      `- **${instance.vulnerability_id}** (${instance.severity_class}${score}): ${instance.package} ${instance.installed_version}${fixed}${resolved}`,
    );
    for (const dependency of instance.top_level_dependencies) {
      lines.push(`  - via ${pathText(dependency)}`);
    }
    lines.push(...linkLines(instance.diff_links));
  }
  if (remediation.manifest_edit) {
    lines.push(
      "",
      `**Add to ${remediation.manifest_edit.file}**`,
      "",
      "```",
      remediation.manifest_edit.text.trimEnd(),
      "```",
    );
  }
  if (remediation.command) {
    lines.push("", "**Run**", "", "```", remediation.command, "```");
  }
  return lines.join("\n");
}

// The details of a ticket that tracks one vulnerability.
function vulnerabilityLines(ticket: Ticket): string[] {
  const lines = [
    ticket.description,
    "",
    "---",
    "",
    "**Vulnerability Details**",
  ];
  if (ticket.vulnerability_id) {
    lines.push(`- **CVE/ID**: ${ticket.vulnerability_id}`);
  }
  if (ticket.affected_package) {
    lines.push(`- **Package**: ${ticket.affected_package}`);
  }
  if (ticket.affected_version) {
    lines.push(`- **Version**: ${ticket.affected_version}`);
  }
  if (typeof ticket.severity_score === "number") {
    lines.push(`- **CVSS Score**: ${ticket.severity_score.toFixed(1)}`);
  }
  if (ticket.severity_class) {
    lines.push(`- **Severity**: ${ticket.severity_class}`);
  }
  if (ticket.recommended_version) {
    lines.push(`- **Recommended Version**: ${ticket.recommended_version}`);
  }
  return lines;
}

/**
 * The body of a ticket's external issue. A remediation ticket renders its
 * remediation and instances; a one-vulnerability ticket its description and details.
 */
export function ticketBody(
  ticket: Ticket,
  remediation: BodyRemediation | null,
  instances: BodyInstance[],
): string {
  const lines = remediation
    ? [remediationMarkdown(remediation, instances)]
    : vulnerabilityLines(ticket);
  if (ticket.remediation_notes) {
    lines.push("", "**Remediation Notes**", ticket.remediation_notes);
  }
  lines.push("", "---", "*Created by [CodeClarity](https://codeclarity.io)*");
  return lines.join("\n");
}
