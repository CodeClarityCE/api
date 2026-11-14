import { MigrationInterface, QueryRunner } from "typeorm";

// Saved Figures of an experiment; deleted with it.
// Constraint names are the ones TypeORM's default naming strategy derives.
export class AddExperimentFigures1794787200000 implements MigrationInterface {
  name = "AddExperimentFigures1794787200000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "experiment_figure" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(100) NOT NULL, "definition" jsonb NOT NULL, "created_on" TIMESTAMP WITH TIME ZONE NOT NULL, "experimentId" uuid NOT NULL, CONSTRAINT "PK_f3256abd369e118180caf65aabd" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4af2a6e15ca021419d6efedba2" ON "experiment_figure" ("experimentId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "experiment_figure" ADD CONSTRAINT "FK_4af2a6e15ca021419d6efedba25" FOREIGN KEY ("experimentId") REFERENCES "experiment"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "experiment_figure" DROP CONSTRAINT "FK_4af2a6e15ca021419d6efedba25"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_4af2a6e15ca021419d6efedba2"`,
    );
    await queryRunner.query(`DROP TABLE "experiment_figure"`);
  }
}
