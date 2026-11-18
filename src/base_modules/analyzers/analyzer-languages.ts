import type { StageBase } from "./analyzer.types";
import { isSbomProducer, type PluginDependencies } from "./workflow-rules";

export type LanguageConfig = Record<string, { plugins: string[] } | undefined>;

// SBOM producers whose prefix is not the language name.
const sbomLanguages: Record<string, string> = { "js-sbom": "javascript" };

/** The language an SBOM producer reads, e.g. "php" for "php-sbom". */
function sbomLanguage(name: string): string {
  return sbomLanguages[name] ?? name.slice(0, -"-sbom".length);
}

// The languages a plugin can run for, or null for any. Its own SBOM
// dependencies are alternatives; each other dependency narrows them.
function languagesOf(
  name: string,
  plugins: PluginDependencies[],
  seen = new Set<string>(),
): Set<string> | null {
  if (seen.has(name)) return null;
  const path = new Set(seen).add(name);
  const dependsOn = plugins.find((p) => p.name === name)?.depends_on ?? [];
  const own = dependsOn.filter(isSbomProducer).map(sbomLanguage);
  let languages: Set<string> | null = own.length > 0 ? new Set(own) : null;
  for (const dependency of dependsOn.filter((d) => !isSbomProducer(d))) {
    const theirs = languagesOf(dependency, plugins, path);
    if (theirs === null) continue;
    languages =
      languages === null
        ? theirs
        : new Set([...languages].filter((l) => theirs.has(l)));
  }
  return languages;
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
    shared.map((name) => [name, [...(languagesOf(name, plugins) ?? [])]]),
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

interface LanguageFields {
  steps: StageBase[][];
  supported_languages: string[];
  language_config?: LanguageConfig | null | undefined;
}

// Languages and their plugins, sorted, so order does not count as a change.
function normalized(languages: string[], config: LanguageConfig): string {
  return JSON.stringify([
    [...languages].sort(),
    Object.keys(config)
      .sort()
      .map((language) => [
        language,
        [...(config[language]?.plugins ?? [])].sort(),
      ]),
  ]);
}

/** The languages a template-based analyzer should have saved for its steps and
 *  the plugins' dependencies, or null when it is not template-based or they match. */
export function languagesToSync(
  analyzer: LanguageFields,
  plugins: PluginDependencies[],
): { supported_languages: string[]; language_config: LanguageConfig } | null {
  if (!hasLanguageConfig(analyzer.language_config)) return null;
  const derived = deriveLanguages(
    analyzer.steps,
    analyzer.supported_languages,
    plugins,
  );
  const same =
    normalized(derived.supported_languages, derived.language_config) ===
    normalized(analyzer.supported_languages, analyzer.language_config ?? {});
  return same ? null : derived;
}
