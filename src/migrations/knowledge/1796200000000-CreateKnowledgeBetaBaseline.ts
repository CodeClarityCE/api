import { join } from "path";
import { MigrationInterface, QueryRunner } from "typeorm";

import { applyBetaBaseline, refuseRevert } from "../beta-baseline";

// The knowledge migrations of every alpha release, squashed into the last alpha's schema (ADR 0018).
export class CreateKnowledgeBetaBaseline1796200000000 implements MigrationInterface {
  name = "CreateKnowledgeBetaBaseline1796200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await applyBetaBaseline(queryRunner, {
      database: "knowledge",
      schema: join(__dirname, "1796200000000-CreateKnowledgeBetaBaseline.sql"),
      lastAlphaMigration: "CreateKevTable1795651200000",
    });
  }

  public async down(): Promise<void> {
    refuseRevert("knowledge");
  }
}
