import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiExtraModels,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';

import { AdminOnly } from '../../../common/decorators/admin-only.decorator.js';
import { PageMetaDto, type Page } from '../../../common/dto/pagination.dto.js';
import { KnowledgeService } from '../application/knowledge.service.js';
import type { LawArticle } from '../domain/law-article.entity.js';
import type { ArticleMatch } from '../domain/law-article.repository.js';
import {
  ArticleMatchDto,
  CreateLawArticleDto,
  LawArticleResponseDto,
  ListLawArticlesQueryDto,
  SearchLawArticlesQueryDto,
  UpdateLawArticleDto,
} from './dto/law-article.dto.js';

@ApiTags('Admin · Knowledge base')
@AdminOnly()
@ApiExtraModels(LawArticleResponseDto, PageMetaDto)
@Controller('admin/knowledge')
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  @Get()
  @ApiOperation({ summary: 'List law articles, optionally by topic or verification status' })
  @ApiOkResponse({
    schema: {
      properties: {
        items: { type: 'array', items: { $ref: getSchemaPath(LawArticleResponseDto) } },
        meta: { $ref: getSchemaPath(PageMetaDto) },
      },
    },
  })
  list(@Query() query: ListLawArticlesQueryDto): Promise<Page<LawArticle>> {
    return this.knowledge.list(query.page, query.limit, { topic: query.topic, verified: query.verified });
  }

  @Get('search')
  @ApiOperation({ summary: 'Full-text search, exactly as the agent retrieves rules (FR-7)' })
  @ApiOkResponse({ type: [ArticleMatchDto] })
  search(@Query() query: SearchLawArticlesQueryDto): Promise<ArticleMatch[]> {
    return this.knowledge.search(query.q);
  }

  @Get(':id')
  @ApiOkResponse({ type: LawArticleResponseDto })
  @ApiNotFoundResponse()
  get(@Param('id', ParseUUIDPipe) id: string): Promise<LawArticle> {
    return this.knowledge.get(id);
  }

  @Post()
  @ApiCreatedResponse({ type: LawArticleResponseDto })
  create(@Body() body: CreateLawArticleDto): Promise<LawArticle> {
    return this.knowledge.create(body);
  }

  @Patch(':id')
  @ApiOkResponse({ type: LawArticleResponseDto })
  @ApiNotFoundResponse()
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateLawArticleDto): Promise<LawArticle> {
    return this.knowledge.update(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.knowledge.remove(id);
  }
}
