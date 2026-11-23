import { MigrationInterface, QueryRunner } from "typeorm";

/** Removes the js-patching registry row, as the plugin is gone. */
export class RemoveJsPatchingPlugin1796256000000 implements MigrationInterface {
  name = "RemoveJsPatchingPlugin1796256000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "plugin" WHERE "name" = 'js-patching'`,
    );
  }

  public async down(): Promise<void> {
    // A running plugin registers itself again; there is none to restore.
  }
}
