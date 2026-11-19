import * as dotenv from "dotenv";
import type { DataSource } from "typeorm";

import {
  CodeClarityLogger,
  isSensitiveField,
} from "../services/logger.service";

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
    const details =
      error instanceof Error ? (error.stack ?? error.message) : String(error);
    CodeClarityLogger.forService(name).error(
      `${name} failed`,
      redactSecrets(details),
    );
    process.exit(1);
  });
}

// Replaces the values of secret-looking environment variables in text.
function redactSecrets(text: string): string {
  let redacted = text;
  for (const [key, value] of Object.entries(process.env)) {
    if (value && isSensitiveField(key)) {
      redacted = redacted.replaceAll(value, "[REDACTED]");
    }
  }
  return redacted;
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
