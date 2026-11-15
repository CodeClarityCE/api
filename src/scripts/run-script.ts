import * as dotenv from "dotenv";
import type { DataSource } from "typeorm";

import { CodeClarityLogger } from "../services/logger.service";

import "reflect-metadata";

// Runs main when the calling file is executed directly: loads env/.env.<ENV>, exits 1 on failure.
export function runScript(
  caller: NodeModule,
  name: string,
  main: () => Promise<void>,
): void {
  if (require.main !== caller) return;
  dotenv.config({
    path: `env/.env.${process.env["ENV"] ?? "dev"}`,
    quiet: true,
  });
  main().catch((error: unknown) => {
    CodeClarityLogger.forService(name).error(
      `${name} failed`,
      error instanceof Error ? error : String(error),
    );
    process.exit(1);
  });
}

// Runs fn on the codeclarity datasource, connected for the call only.
export async function withCodeClarity<T>(
  fn: (dataSource: DataSource) => Promise<T>,
): Promise<T> {
  // Imported late so the datasource reads the env file runScript loaded.
  const { CodeClarityDataSource } =
    await import("../datasources/codeclarity.datasource");
  await CodeClarityDataSource.initialize();
  try {
    return await fn(CodeClarityDataSource);
  } finally {
    await CodeClarityDataSource.destroy();
  }
}
