import { join } from "path";
import { MigrationInterface, QueryRunner } from "typeorm";

import { applyBetaBaseline, refuseRevert } from "../beta-baseline";

// The codeclarity migrations of every alpha release, squashed into the last alpha's schema (ADR 0018).
export class CreateCodeclarityBetaBaseline1796200000000 implements MigrationInterface {
  name = "CreateCodeclarityBetaBaseline1796200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await applyBetaBaseline(queryRunner, {
      database: "codeclarity",
      schema: join(
        __dirname,
        "1796200000000-CreateCodeclarityBetaBaseline.sql",
      ),
      lastAlphaMigration: "AddVulnerabilityInstanceFixes1796169600000",
    });
  }

  public async down(): Promise<void> {
    refuseRevert("codeclarity");
  }
}
