import { join } from "path";
import { MigrationInterface, QueryRunner } from "typeorm";

import { applyBetaBaseline, refuseRevert } from "../beta-baseline";

// The plugins migrations of every alpha release, squashed into the last alpha's schema (ADR 0018).
export class CreatePluginsBetaBaseline1796200000000 implements MigrationInterface {
  name = "CreatePluginsBetaBaseline1796200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await applyBetaBaseline(queryRunner, {
      database: "plugins",
      schema: join(__dirname, "1796200000000-CreatePluginsBetaBaseline.sql"),
      lastAlphaMigration: "UniquePluginName1795132800000",
    });
  }

  public async down(): Promise<void> {
    refuseRevert("plugins");
  }
}
