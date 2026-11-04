import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

import { PageMetaDto, PaginationQueryDto } from '../../../../common/dto/pagination.dto.js';
import { MessageDirection, MessageKind } from '../../../conversations/domain/message.entity.js';
import { LANGUAGES, type Language } from '../../../workers/domain/language.js';
import { ConsentStatus } from '../../../workers/domain/worker.entity.js';
import { MessageDto } from './admin.dto.js';

export class ListWhatsAppContactsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: '+971 50 123 4567', description: 'Find one exact number (matched by its hash)' })
  @IsOptional()
  @IsString()
  @Matches(/^[\d\s+()-]{6,24}$/, { message: 'phone must be a phone number' })
  phone?: string;
}

class ConsentCountsDto {
  @ApiProperty() pending: number;
  @ApiProperty() granted: number;
  @ApiProperty() declined: number;
}

export class WhatsAppSummaryDto {
  @ApiProperty() periodDays: number;
  @ApiProperty({ description: 'WhatsApp numbers that have ever messaged Haqdar' }) numbers: number;
  @ApiProperty({ description: 'Numbers active within the period' }) activeSince: number;
  @ApiProperty({ type: ConsentCountsDto }) consent: ConsentCountsDto;
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'number' },
    example: { ur: 3, hi: 1, unset: 1 },
    description: 'Numbers per chosen language; "unset" have not chosen yet',
  })
  languages: Record<string, number>;
  @ApiProperty() inboundMessages: number;
  @ApiProperty() outboundMessages: number;
}

class LastMessageDto {
  @ApiProperty() body: string;
  @ApiProperty({ enum: MessageDirection, enumName: 'MessageDirection' }) direction: MessageDirection;
  @ApiProperty({ enum: MessageKind, enumName: 'MessageKind' }) kind: MessageKind;
  @ApiProperty() createdAt: Date;
}

export class WhatsAppContactDto {
  @ApiProperty({ format: 'uuid' }) workerId: string;
  @ApiProperty({ example: '+971 ••• 4567' }) maskedPhone: string;
  @ApiProperty({ enum: LANGUAGES, nullable: true, type: String }) language: Language | null;
  @ApiProperty({ enum: ConsentStatus, enumName: 'ConsentStatus' }) consentStatus: ConsentStatus;
  @ApiProperty() firstContactAt: Date;
  @ApiProperty() lastActiveAt: Date;
  @ApiProperty() conversationCount: number;
  @ApiProperty() messageCount: number;
  @ApiProperty() inboundCount: number;
  @ApiProperty() urgentCount: number;
  @ApiProperty({ type: LastMessageDto, nullable: true }) lastMessage: LastMessageDto | null;
}

export class WhatsAppContactPageDto {
  @ApiProperty({ type: [WhatsAppContactDto] }) items: WhatsAppContactDto[];
  @ApiProperty({ type: PageMetaDto }) meta: PageMetaDto;
}

export class WhatsAppChatDto {
  @ApiProperty({ type: WhatsAppContactDto }) contact: WhatsAppContactDto;
  @ApiProperty({ type: [MessageDto], description: 'Up to the latest 200 messages, oldest first' })
  messages: MessageDto[];
}

export class RevealedPhoneDto {
  @ApiProperty({ example: '+971 501234567' }) phone: string;
}
