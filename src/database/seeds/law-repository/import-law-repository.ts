import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { DataSource } from 'typeorm';

import { LawArticle } from '../../../modules/knowledge/domain/law-article.entity.js';
import type { LawArticleData } from '../../../modules/knowledge/domain/law-article.repository.js';
import { LAW_ARTICLE_SEED } from '../law-articles.seed.js';
import { LAW_SOURCES, type LawSource } from './law-sources.js';
import { classifyTopic, parseLawText } from './parse-law-text.js';

const TITLE_MAX = 200;
const STARTER_PREFIX = 'Decree-Law 33/2021, Art.';
/** The approximate hand-written summaries from the starter seed that cite the labour law. */
const STARTERS = LAW_ARTICLE_SEED.filter(({ reference }) => reference.startsWith(STARTER_PREFIX));

/** Reads every selected instrument from the repository's `06_Extracted_Text` folder. */
export function readLawRepository(root: string, sources: LawSource[] = LAW_SOURCES): LawArticleData[] {
  const folder = join(root, '06_Extracted_Text');
  const files = readdirSync(folder);
  return sources.flatMap((source) => {
    const file = files.find((name) => name.startsWith(`${source.id}__`) && name.endsWith('.txt'));
    if (!file) throw new Error(`${source.id}: no extracted text in ${folder}`);
    return articlesFrom(source, readFileSync(join(folder, file), 'utf8'));
  });
}

function articlesFrom(source: LawSource, text: string): LawArticleData[] {
  const seen = new Map<number, number>();
  return parseLawText(text).map(({ number, heading, body }) => {
    // A few extracts print the same article number twice; keep both, cited apart.
    const copies = (seen.get(number) ?? 0) + 1;
    seen.set(number, copies);
    const reference = `${source.citation}, Art. ${number}${copies > 1 ? ` (${copies})` : ''}`;
    const title = `${heading ?? `Article ${number}`} (${source.citation})`.slice(0, TITLE_MAX);
    return { reference, title, body, topic: classifyTopic(heading, body), sourceUrl: source.url, verified: false };
  });
}

export interface ImportResult {
  created: number;
  updated: number;
  /** Already checked by an admin, so left exactly as they are. */
  keptVerified: number;
  /** Unverified starter summaries of Decree-Law 33/2021 that the official text replaces. */
  removedStarters: number;
}

/**
 * Upserts by reference in one transaction. Verified articles are never overwritten, and the
 * unverified hand-written summaries citing Decree-Law 33/2021 are removed once the official
 * text of the law is in.
 */
export function importLawArticles(dataSource: DataSource, articles: LawArticleData[]): Promise<ImportResult> {
  return dataSource.transaction(async (manager) => {
    const repository = manager.getRepository(LawArticle);
    const result: ImportResult = { created: 0, updated: 0, keptVerified: 0, removedStarters: 0 };

    for (const data of articles) {
      const existing = await repository.findOneBy({ reference: data.reference });
      if (!existing) {
        await repository.insert(repository.create(data));
        result.created += 1;
      } else if (existing.verified) {
        result.keptVerified += 1;
      } else {
        await repository.update(existing.id, data);
        result.updated += 1;
      }
    }

    const imported = new Set(articles.map((article) => article.reference));
    if (articles.some((article) => article.reference.startsWith(STARTER_PREFIX))) {
      for (const starter of STARTERS.filter(({ reference }) => !imported.has(reference))) {
        // Only while it still holds the starter text: official text under the same reference stays.
        const { affected } = await repository.delete({
          reference: starter.reference,
          body: starter.body,
          verified: false,
        });
        result.removedStarters += affected ?? 0;
      }
    }
    return result;
  });
}
