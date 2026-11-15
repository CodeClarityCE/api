import * as dotenv from "dotenv";
import type { Repository } from "typeorm";

import type { Analyzer } from "../base_modules/analyzers/analyzer.entity";
import { AnalyzerTemplatesService } from "../base_modules/analyzers/analyzer-templates.service";
import { CodeClarityLogger } from "../services/logger.service";

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
  dotenv.config({
    path: `env/.env.${process.env["ENV"] ?? "dev"}`,
    quiet: true,
  });
  // Imported late so the datasource reads the env loaded above.
  const { CodeClarityDataSource } =
    await import("../datasources/codeclarity.datasource");
  const { Analyzer } =
    await import("../base_modules/analyzers/analyzer.entity");
  await CodeClarityDataSource.initialize();
  try {
    const created = await createDefaultAnalyzer(
      CodeClarityDataSource.getRepository(Analyzer),
    );
    logger.log(
      created
        ? "Created the default analyzer"
        : "Default analyzer already exists",
      { name: DEFAULT_ANALYZER_NAME },
    );
  } finally {
    await CodeClarityDataSource.destroy();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    logger.error(
      "Creating the default analyzer failed",
      error instanceof Error ? error : String(error),
    );
    process.exit(1);
  });
}
