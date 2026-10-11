import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { PageMetaDto, PaginationQueryDto } from '../../../../common/dto/pagination.dto.js';
import { IssueType } from '../../../complaints/domain/issue-type.enum.js';
import { ConversationStatus } from '../../../conversations/domain/conversation-status.js';
import { MessageDirection, MessageKind } from '../../../conversations/domain/message.entity.js';

export class OverviewQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 365, default: 7, description: 'Window for "recent" counts' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days = 7;
}

class WorkerCountsDto {
  @ApiProperty() total: number;
  @ApiProperty() pending: number;
  @ApiProperty() granted: number;
  @ApiProperty() declined: number;
}

class IssueCountDto {
  @ApiProperty({ enum: IssueType, enumName: 'IssueType' }) issueType: IssueType;
  @ApiProperty() count: number;
}

class ConversationStatsDto {
  @ApiProperty() conversations: number;
  @ApiProperty({ description: 'Conversations started within the window' }) conversationsSince: number;
  @ApiProperty() inboundMessages: number;
  @ApiProperty() outboundMessages: number;
  @ApiProperty() urgentMessages: number;
  @ApiProperty({ description: 'Answers flagged as wrong during review' }) flaggedMessages: number;
  @ApiProperty({ description: 'Answers citing at least one law reference' }) citedAnswers: number;
  @ApiProperty({ nullable: true, type: Number }) averageReplyLatencyMs: number | null;
  @ApiProperty({ description: 'Urgent or flagged conversations not yet reviewed' }) needsReview: number;
  @ApiProperty({ description: 'Conversations tagged with an issue type' }) withIssue: number;
  @ApiProperty({ description: 'Conversations where the complaint guide was sent' }) guidedToMohre: number;
  @ApiProperty({ type: [IssueCountDto] }) issueTypes: IssueCountDto[];
}

class KnowledgeStatusDto {
  @ApiProperty() articles: number;
  @ApiProperty() verified: number;
}

export class AdminOverviewDto {
  @ApiProperty() periodDays: number;
  @ApiProperty({ type: WorkerCountsDto }) workers: WorkerCountsDto;
  @ApiProperty({ type: ConversationStatsDto }) conversations: ConversationStatsDto;
  @ApiProperty({ description: 'Contract photos read' }) contractsRead: number;
  @ApiProperty({ description: 'Complaint follow-ups workers agreed to' }) followUpsScheduled: number;
  @ApiProperty({ type: KnowledgeStatusDto }) knowledgeBase: KnowledgeStatusDto;
}

export class ListConversationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ConversationStatus, enumName: 'ConversationStatus' })
  @IsOptional()
  @IsEnum(ConversationStatus)
  status?: ConversationStatus;
}

export class ConversationSummaryDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid', description: 'Anonymous worker id; no phone numbers are exposed' }) workerId: string;
  @ApiProperty({ enum: IssueType, enumName: 'IssueType', nullable: true }) issueType: IssueType | null;
  @ApiProperty({ enum: ConversationStatus, enumName: 'ConversationStatus' }) status: ConversationStatus;
  @ApiProperty({ nullable: true, type: String, description: "The worker's first message" }) preview: string | null;
  @ApiProperty({ enum: MessageKind, enumName: 'MessageKind', nullable: true }) channel: MessageKind | null;
  @ApiProperty() messageCount: number;
  @ApiProperty() flaggedCount: number;
  @ApiProperty() urgentCount: number;
  @ApiProperty() guidedToMohre: boolean;
  @ApiProperty({ nullable: true, type: Date }) reviewedAt: Date | null;
  @ApiProperty() lastMessageAt: Date;
}

export class ConversationPageDto {
  @ApiProperty({ type: [ConversationSummaryDto] }) items: ConversationSummaryDto[];
  @ApiProperty({ type: PageMetaDto }) meta: PageMetaDto;
}

class ToolCallDto {
  @ApiProperty() name: string;
  @ApiProperty({ type: Object }) input: unknown;
  @ApiProperty() ok: boolean;
}

export class MessageDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: MessageDirection, enumName: 'MessageDirection' }) direction: MessageDirection;
  @ApiProperty({ enum: MessageKind, enumName: 'MessageKind' }) kind: MessageKind;
  @ApiProperty() body: string;
  @ApiProperty({ type: [ToolCallDto] }) toolCalls: ToolCallDto[];
  @ApiProperty({ type: [String] }) citations: string[];
  @ApiProperty() urgent: boolean;
  @ApiProperty() flagged: boolean;
  @ApiProperty({ nullable: true, type: String }) flagReason: string | null;
  @ApiProperty({ nullable: true, type: Number }) latencyMs: number | null;
  @ApiProperty() createdAt: Date;
}

export class ReviewConversationDto {
  @ApiProperty({ description: 'True to mark as reviewed, false to reopen' })
  @IsBoolean()
  reviewed: boolean;
}

export class ConversationDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: IssueType, enumName: 'IssueType', nullable: true }) issueType: IssueType | null;
  @ApiProperty({ nullable: true, type: Date }) reviewedAt: Date | null;
  @ApiProperty() lastMessageAt: Date;
}

class FlaggedMessageDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) conversationId: string;
  @ApiProperty() body: string;
  @ApiProperty({ nullable: true, type: String }) flagReason: string | null;
  @ApiProperty({ type: [String] }) citations: string[];
  @ApiProperty() createdAt: Date;
}

export class FlaggedMessagePageDto {
  @ApiProperty({ type: [FlaggedMessageDto] }) items: FlaggedMessageDto[];
  @ApiProperty({ type: PageMetaDto }) meta: PageMetaDto;
}

export class FlagMessageDto {
  @ApiProperty({ description: 'True to mark the answer as wrong, false to clear the flag' })
  @IsBoolean()
  flagged: boolean;

  @ApiPropertyOptional({ example: 'Cited the wrong overtime rate' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
