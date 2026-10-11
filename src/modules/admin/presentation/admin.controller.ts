import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AdminOnly } from '../../../common/decorators/admin-only.decorator.js';
import { PaginationQueryDto, type Page } from '../../../common/dto/pagination.dto.js';
import { ConversationsService } from '../../conversations/application/conversations.service.js';
import type { Conversation } from '../../conversations/domain/conversation.entity.js';
import type { ConversationSummary, FlaggedMessage } from '../../conversations/domain/conversation.repository.js';
import type { Message } from '../../conversations/domain/message.entity.js';
import { AdminOverviewService, type AdminOverview } from '../application/admin-overview.service.js';
import {
  AdminOverviewDto,
  ConversationDto,
  ConversationPageDto,
  FlaggedMessagePageDto,
  FlagMessageDto,
  ListConversationsQueryDto,
  MessageDto,
  OverviewQueryDto,
  ReviewConversationDto,
} from './dto/admin.dto.js';

@ApiTags('Admin · Dashboard')
@AdminOnly()
@Controller('admin')
export class AdminController {
  constructor(
    private readonly overview: AdminOverviewService,
    private readonly conversations: ConversationsService,
  ) {}

  @Get('overview')
  @ApiOperation({ summary: 'Usage, issue types and accuracy flags (FR-15)' })
  @ApiOkResponse({ type: AdminOverviewDto })
  getOverview(@Query() query: OverviewQueryDto): Promise<AdminOverview> {
    return this.overview.overview(query.days);
  }

  @Get('conversations')
  @ApiOperation({ summary: 'Conversations, most recent first, optionally filtered by review status' })
  @ApiOkResponse({ type: ConversationPageDto })
  listConversations(@Query() query: ListConversationsQueryDto): Promise<Page<ConversationSummary>> {
    return this.conversations.list(query.page, query.limit, query.status);
  }

  @Patch('conversations/:id/review')
  @ApiOperation({ summary: 'Mark a conversation as reviewed, or reopen it' })
  @ApiOkResponse({ type: ConversationDto })
  @ApiNotFoundResponse()
  async reviewConversation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReviewConversationDto,
  ): Promise<ConversationDto> {
    const { issueType, reviewedAt, lastMessageAt }: Conversation = await this.conversations.setReviewed(
      id,
      body.reviewed,
    );
    return { id, issueType, reviewedAt, lastMessageAt };
  }

  @Get('conversations/:id/messages')
  @ApiOperation({ summary: 'Full message log of one conversation, with tool calls and citations' })
  @ApiOkResponse({ type: [MessageDto] })
  @ApiNotFoundResponse()
  listMessages(@Param('id', ParseUUIDPipe) id: string): Promise<Message[]> {
    return this.conversations.messagesOf(id);
  }

  @Get('messages/flagged')
  @ApiOperation({ summary: 'Answers flagged as wrong, most recently flagged first' })
  @ApiOkResponse({ type: FlaggedMessagePageDto })
  listFlaggedMessages(@Query() query: PaginationQueryDto): Promise<Page<FlaggedMessage>> {
    return this.conversations.flaggedMessages(query.page, query.limit);
  }

  @Patch('messages/:id/flag')
  @ApiOperation({ summary: 'Flag (or clear) an answer as wrong during accuracy review' })
  @ApiOkResponse({ type: MessageDto })
  @ApiNotFoundResponse()
  flagMessage(@Param('id', ParseUUIDPipe) id: string, @Body() body: FlagMessageDto): Promise<Message> {
    return this.conversations.flagMessage(id, body.flagged, body.reason);
  }
}
