import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Workers now choose their language on first contact, so a new worker starts with none.
 * Existing workers keep the language they have (Urdu).
 */
export class WorkerLanguageChoice1793750400000 implements MigrationInterface {
  name = 'WorkerLanguageChoice1793750400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "workers" ALTER COLUMN "language" DROP DEFAULT
        `);
    await queryRunner.query(`
            ALTER TABLE "workers" ALTER COLUMN "language" DROP NOT NULL
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            UPDATE "workers" SET "language" = 'ur' WHERE "language" IS NULL
        `);
    await queryRunner.query(`
            ALTER TABLE "workers" ALTER COLUMN "language" SET NOT NULL
        `);
    await queryRunner.query(`
            ALTER TABLE "workers" ALTER COLUMN "language" SET DEFAULT 'ur'
        `);
  }
}
