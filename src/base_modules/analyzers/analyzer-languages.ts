import type { StageBase } from "./analyzer.types";
import { isSbomProducer, type PluginDependencies } from "./workflow-rules";

export type LanguageConfig = Record<string, { plugins: string[] } | undefined>;

// SBOM producers whose prefix is not the language name.
const sbomLanguages: Record<string, string> = { "js-sbom": "javascript" };

/** The language an SBOM producer reads, e.g. "php" for "php-sbom". */
function sbomLanguage(name: string): string {
  return sbomLanguages[name] ?? name.slice(0, -"-sbom".length);
}

// The SBOM producers a plugin needs, directly or through other plugins.
function producersNeeded(
  name: string,
  plugins: PluginDependencies[],
  seen = new Set<string>(),
): Set<string> {
  const found = new Set<string>();
  if (seen.has(name)) return found;
  seen.add(name);
  const dependsOn = plugins.find((p) => p.name === name)?.depends_on ?? [];
  for (const dependency of dependsOn) {
    if (isSbomProducer(dependency)) found.add(dependency);
    else
      producersNeeded(dependency, plugins, seen).forEach((p) => found.add(p));
  }
  return found;
}

/** Languages and per-language plugins of the steps, one language per SBOM
 *  producer; without one the previous languages are kept. A plugin that needs
 *  an SBOM goes only under the languages of the SBOMs it needs. */
export function deriveLanguages(
  steps: StageBase[][],
  previous: string[],
  plugins: PluginDependencies[] = [],
): { supported_languages: string[]; language_config: LanguageConfig } {
  const names = [...new Set(steps.flat().map((step) => step.name))];
  const shared = names.filter((name) => !isSbomProducer(name));
  const producers = names.filter(isSbomProducer);
  const needs = new Map(
    shared.map((name) => [
      name,
      [...producersNeeded(name, plugins)].map(sbomLanguage),
    ]),
  );
  const sharedFor = (language: string): string[] =>
    shared.filter((name) => {
      const languages = needs.get(name) ?? [];
      return languages.length === 0 || languages.includes(language);
    });

  const config: LanguageConfig = {};
  if (producers.length === 0) {
    for (const language of previous) {
      config[language] = { plugins: sharedFor(language) };
    }
  }
  for (const producer of producers) {
    const language = sbomLanguage(producer);
    const own = config[language]?.plugins.filter(isSbomProducer) ?? [];
    config[language] = { plugins: [...own, producer, ...sharedFor(language)] };
  }
  return { supported_languages: Object.keys(config), language_config: config };
}

/** Whether an analyzer chooses its plugins by language, as templates do. */
export function hasLanguageConfig(config?: LanguageConfig | null): boolean {
  return !!config && Object.keys(config).length > 0;
}
