import type { MigrationInterface, QueryRunner } from 'typeorm';

import { LAW_ARTICLE_SEED } from '../seeds/law-articles.seed.js';
import articles from './data/uae-worker-law-2026-10-31.json' with { type: 'json' };

/**
 * Loads the official texts from the UAE Worker Law Repository (snapshot 2026-10-31, made
 * with `pnpm laws:export`) into the knowledge base, one row per article, all unverified
 * until a person checks them. Articles an admin already verified are left exactly as they
 * are, and the hand-written starter summaries of Decree-Law 33/2021 that the official text
 * replaces are removed. Plain SQL, so later entity changes can't alter what this did.
 */
export class ImportUaeWorkerLaw1793491200000 implements MigrationInterface {
  name = 'ImportUaeWorkerLaw1793491200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const data = JSON.stringify(articles);
    const rows = `jsonb_to_recordset($1::jsonb)
      AS d("reference" text, "title" text, "body" text, "topic" text, "sourceUrl" text)`;

    await queryRunner.query(
      `UPDATE "law_articles" AS a
       SET "title" = d."title", "body" = d."body", "topic" = d."topic"::"law_topic",
           "source_url" = d."sourceUrl", "updated_at" = now()
       FROM ${rows}
       WHERE a."reference" = d."reference" AND a."verified" = false`,
      [data],
    );
    await queryRunner.query(
      `INSERT INTO "law_articles" ("reference", "title", "body", "topic", "source_url", "verified")
       SELECT d."reference", d."title", d."body", d."topic"::"law_topic", d."sourceUrl", false
       FROM ${rows}
       WHERE NOT EXISTS (SELECT 1 FROM "law_articles" AS a WHERE a."reference" = d."reference")`,
      [data],
    );

    // Only while a starter still holds its own text: official text under the same reference stays.
    const imported = new Set(articles.map((article) => article.reference));
    const starters = LAW_ARTICLE_SEED.filter(
      ({ reference }) => reference.startsWith('Decree-Law 33/2021, Art.') && !imported.has(reference),
    );
    for (const { reference, body } of starters) {
      await queryRunner.query(
        `DELETE FROM "law_articles" WHERE "reference" = $1 AND "body" = $2 AND "verified" = false`,
        [reference, body],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "law_articles" WHERE "reference" = ANY($1) AND "verified" = false`, [
      articles.map((article) => article.reference),
    ]);
  }
}
