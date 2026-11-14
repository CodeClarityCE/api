import type { StageBase } from "./analyzer.types";
import { isSbomProducer } from "./workflow-rules";

export type LanguageConfig = Record<string, { plugins: string[] } | undefined>;

// SBOM producers whose prefix is not the language name.
const sbomLanguages: Record<string, string> = { "js-sbom": "javascript" };

/** The language an SBOM producer reads, e.g. "php" for "php-sbom". */
function sbomLanguage(name: string): string {
  return sbomLanguages[name] ?? name.slice(0, -"-sbom".length);
}

/** Languages and per-language plugins of the steps, one language per SBOM
 *  producer; without one the previous languages are kept. */
export function deriveLanguages(
  steps: StageBase[][],
  previous: string[],
): { supported_languages: string[]; language_config: LanguageConfig } {
  const names = [...new Set(steps.flat().map((step) => step.name))];
  const shared = names.filter((name) => !isSbomProducer(name));
  const producers = names.filter(isSbomProducer);

  const config: LanguageConfig = {};
  if (producers.length === 0) {
    for (const language of previous) config[language] = { plugins: shared };
  }
  for (const producer of producers) {
    const language = sbomLanguage(producer);
    const own = config[language]?.plugins.filter(isSbomProducer) ?? [];
    config[language] = { plugins: [...own, producer, ...shared] };
  }
  return { supported_languages: Object.keys(config), language_config: config };
}

/** Whether an analyzer chooses its plugins by language, as templates do. */
export function hasLanguageConfig(config?: LanguageConfig | null): boolean {
  return !!config && Object.keys(config).length > 0;
}
