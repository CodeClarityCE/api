import type { QueryRunner } from "typeorm";

import { SetMultiLanguageAnalyzerSupportedLanguages1794700800000 as Migration } from "./1794700800000-SetMultiLanguageAnalyzerSupportedLanguages";

const seededAnalyzerOnly = `WHERE "name" = 'Multi-Language Analyzer' AND "language_config" ?& array['javascript','php']`;

describe("SetMultiLanguageAnalyzerSupportedLanguages", () => {
  const run = async (direction: "up" | "down"): Promise<string[]> => {
    const query = jest.fn().mockResolvedValue(undefined);
    await new Migration()[direction]({ query } as unknown as QueryRunner);
    return query.mock.calls.map(([sql]: [string]) => sql);
  };

  it("declares JavaScript and PHP on the seeded analyzer only", async () => {
    expect(await run("up")).toEqual([
      `UPDATE "analyzer" SET "supported_languages" = '{javascript,php}' ${seededAnalyzerOnly}`,
    ]);
  });

  it("restores JavaScript only on the same analyzer when reverted", async () => {
    expect(await run("down")).toEqual([
      `UPDATE "analyzer" SET "supported_languages" = '{javascript}' ${seededAnalyzerOnly}`,
    ]);
  });
});
