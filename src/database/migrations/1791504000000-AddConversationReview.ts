import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Admin review state for the conversations queue. */
export class AddConversationReview1791504000000 implements MigrationInterface {
  name = 'AddConversationReview1791504000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "conversations"
            ADD "reviewed_at" TIMESTAMP WITH TIME ZONE
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "conversations" DROP COLUMN "reviewed_at"
        `);
  }
}
