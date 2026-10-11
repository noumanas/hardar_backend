import { NotFoundException } from '@nestjs/common';

import { aLawArticle } from '../../../../test/support/builders.js';
import { LawTopic, type LawArticle } from '../domain/law-article.entity.js';
import type { LawArticleRepository } from '../domain/law-article.repository.js';
import { KnowledgeService, MAX_SEARCH_LIMIT } from './knowledge.service.js';

function setup() {
  const repository = {
    search: vi.fn().mockResolvedValue([]),
    findById: vi.fn(),
    list: vi.fn(),
    create: vi.fn(),
    save: vi.fn(async (article: LawArticle) => article),
    delete: vi.fn(),
    countVerification: vi.fn(),
  } satisfies LawArticleRepository;
  return { repository, service: new KnowledgeService(repository) };
}

describe('KnowledgeService', () => {
  describe('search', () => {
    it('searches with the trimmed query and the default limit', async () => {
      const { repository, service } = setup();
      await service.search('  passport kept  ');
      expect(repository.search).toHaveBeenCalledWith('passport kept', 4);
    });

    it('returns nothing for a blank query without hitting the database', async () => {
      const { repository, service } = setup();
      await expect(service.search('   ')).resolves.toEqual([]);
      expect(repository.search).not.toHaveBeenCalled();
    });

    it.each([
      [0, 1],
      [99, MAX_SEARCH_LIMIT],
    ])('clamps a limit of %i to %i', async (limit, expected) => {
      const { repository, service } = setup();
      await service.search('overtime', limit);
      expect(repository.search).toHaveBeenCalledWith('overtime', expected);
    });
  });

  it('lists a page, optionally filtered by topic', async () => {
    const { repository, service } = setup();
    repository.list.mockResolvedValue({ items: [aLawArticle()], total: 1 });

    const page = await service.list(2, 10, { topic: LawTopic.Passport, verified: false });

    expect(repository.list).toHaveBeenCalledWith(10, 10, { topic: LawTopic.Passport, verified: false });
    expect(page.meta.total).toBe(1);
  });

  it('gets, updates and removes an article, 404ing when it is missing', async () => {
    const { repository, service } = setup();
    repository.findById.mockResolvedValueOnce(aLawArticle()).mockResolvedValueOnce(null);
    repository.delete.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await expect(service.update('article-1', { verified: true })).resolves.toMatchObject({ verified: true });
    await expect(service.get('missing')).rejects.toThrow(NotFoundException);
    await expect(service.remove('article-1')).resolves.toBeUndefined();
    await expect(service.remove('missing')).rejects.toThrow(NotFoundException);
  });

  it('delegates create and verification counts', async () => {
    const { repository, service } = setup();
    repository.countVerification.mockResolvedValue({ total: 13, verified: 2 });
    const data = { reference: 'Art. 1', title: 'T', body: 'B', topic: LawTopic.Other };

    await service.create(data);

    expect(repository.create).toHaveBeenCalledWith(data);
    await expect(service.verificationStatus()).resolves.toEqual({ total: 13, verified: 2 });
  });
});
