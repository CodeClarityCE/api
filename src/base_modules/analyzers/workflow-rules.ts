import type { StageBase } from "./analyzer.types";

/** An installed plugin as far as the workflow rules care. */
export interface PluginDependencies {
  name?: string;
  depends_on?: string[];
}

export type WorkflowProblem =
  | { kind: "no-plugins" }
  | { kind: "missing-dependency"; plugin: string; missing: string[] };

/** SBOM producers are named "<language>-sbom". */
export function isSbomProducer(name: string): boolean {
  return name.endsWith("-sbom");
}

/**
 * The first reason a workflow cannot run, or null. A plugin needs one of the
 * SBOM producers it lists plus every other dependency, in its own or an
 * earlier stage, since the dispatcher never runs a later stage first.
 */
export function findWorkflowProblem(
  steps: StageBase[][],
  plugins: PluginDependencies[],
): WorkflowProblem | null {
  if (!steps.some((stage) => stage.length > 0)) return { kind: "no-plugins" };

  const available = new Set<string>();
  for (const stage of steps) {
    for (const step of stage) available.add(step.name);
    for (const step of stage) {
      const dependsOn =
        plugins.find((p) => p.name === step.name)?.depends_on ?? [];
      const missing: string[] = [];
      const sbom = dependsOn.filter(isSbomProducer);
      if (sbom.length > 0 && !sbom.some((name) => available.has(name))) {
        missing.push(sbom.join(" or "));
      }
      for (const name of dependsOn) {
        if (!isSbomProducer(name) && !available.has(name)) missing.push(name);
      }
      if (missing.length > 0) {
        return { kind: "missing-dependency", plugin: step.name, missing };
      }
    }
  }
  return null;
}
