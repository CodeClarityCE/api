import { Injectable } from "@nestjs/common";

import { CodeClarityLogger } from "src/services/logger.service";

import { PluginsRepository } from "../plugins/plugin.repository";

import type { Analyzer } from "./analyzer.entity";
import { hasLanguageConfig, languagesToSync } from "./analyzer-languages";
import { AnalyzersRepository } from "./analyzers.repository";

/** Keeps a template-based analyzer's languages in step with its steps and the plugins' dependencies. */
@Injectable()
export class AnalyzerLanguagesService {
  private readonly logger = CodeClarityLogger.forService("AnalyzerLanguages");

  constructor(
    private readonly analyzersRepository: AnalyzersRepository,
    private readonly pluginsRepository: PluginsRepository,
  ) {}

  /** Sets the derived languages on the analyzer, without saving it. */
  async apply(analyzer: Analyzer): Promise<void> {
    if (!hasLanguageConfig(analyzer.language_config)) return;
    const synced = languagesToSync(
      analyzer,
      await this.pluginsRepository.getAll(),
    );
    if (synced) Object.assign(analyzer, synced);
  }

  /** Sets the derived languages on each stored analyzer and saves those that changed. */
  async refresh(...analyzers: Analyzer[]): Promise<void> {
    const templated = analyzers.filter((a) =>
      hasLanguageConfig(a.language_config),
    );
    if (templated.length === 0) return;
    const plugins = await this.pluginsRepository.getAll();
    for (const analyzer of templated) {
      const synced = languagesToSync(analyzer, plugins);
      if (!synced) continue;
      Object.assign(analyzer, synced);
      await this.analyzersRepository.saveLanguages(analyzer.id, synced);
      this.logger.log("Saved the derived languages of an analyzer", {
        analyzerId: analyzer.id,
        supportedLanguages: synced.supported_languages,
      });
    }
  }
}
