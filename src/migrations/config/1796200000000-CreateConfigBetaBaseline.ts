import { join } from "path";
import { MigrationInterface, QueryRunner } from "typeorm";

import { applyBetaBaseline, refuseRevert } from "../beta-baseline";

// The config migrations of every alpha release, squashed into the last alpha's schema (ADR 0018).
export class CreateConfigBetaBaseline1796200000000 implements MigrationInterface {
  name = "CreateConfigBetaBaseline1796200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await applyBetaBaseline(queryRunner, {
      database: "config",
      schema: join(__dirname, "1796200000000-CreateConfigBetaBaseline.sql"),
      lastAlphaMigration: "AddKevLastToConfig1795651200000",
    });
  }

  public async down(): Promise<void> {
    refuseRevert("config");
  }
}
