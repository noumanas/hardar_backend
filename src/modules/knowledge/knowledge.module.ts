import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { KnowledgeService } from './application/knowledge.service.js';
import { LawArticle } from './domain/law-article.entity.js';
import { LawArticleRepository } from './domain/law-article.repository.js';
import { TypeOrmLawArticleRepository } from './infrastructure/typeorm-law-article.repository.js';
import { KnowledgeController } from './presentation/knowledge.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([LawArticle])],
  controllers: [KnowledgeController],
  providers: [KnowledgeService, { provide: LawArticleRepository, useClass: TypeOrmLawArticleRepository }],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
