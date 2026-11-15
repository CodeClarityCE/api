import type { Repository } from "typeorm";

import type { Analyzer } from "../base_modules/analyzers/analyzer.entity";
import { AnalyzerTemplatesService } from "../base_modules/analyzers/analyzer-templates.service";
import { CodeClarityLogger } from "../services/logger.service";

import { runScript, withCodeClarity } from "./run-script";

import "reflect-metadata";

const logger = CodeClarityLogger.forService("create-default-analyzer");

export const DEFAULT_ANALYZER_NAME = "Default Analyzer";

// Saves the global default analyzer from the multi-language template, unless a
// global analyzer of that name exists. Returns whether it created one.
export async function createDefaultAnalyzer(
  analyzers: Repository<Analyzer>,
): Promise<boolean> {
  const existing = await analyzers.countBy({
    name: DEFAULT_ANALYZER_NAME,
    global: true,
  });
  if (existing > 0) return false;

  const template = new AnalyzerTemplatesService().getTemplateByLanguage(
    "multi",
  );
  await analyzers.save({
    name: DEFAULT_ANALYZER_NAME,
    description: template.description,
    global: true,
    created_on: new Date(),
    steps: template.steps,
    supported_languages: template.supported_languages,
    language_config: template.language_config,
    logo: template.logo,
  });
  return true;
}

async function main(): Promise<void> {
  const { Analyzer } =
    await import("../base_modules/analyzers/analyzer.entity");
  const created = await withCodeClarity((dataSource) =>
    createDefaultAnalyzer(dataSource.getRepository(Analyzer)),
  );
  logger.log(
    created
      ? "Created the default analyzer"
      : "Default analyzer already exists",
    { name: DEFAULT_ANALYZER_NAME },
  );
}

runScript(module, "create-default-analyzer", main);
