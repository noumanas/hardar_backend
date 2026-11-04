import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AdminOnly } from '../../../common/decorators/admin-only.decorator.js';
import type { Page } from '../../../common/dto/pagination.dto.js';
import {
  WhatsAppContactsService,
  type WhatsAppChat,
  type WhatsAppContact,
  type WhatsAppSummary,
} from '../application/whatsapp-contacts.service.js';
import { OverviewQueryDto } from './dto/admin.dto.js';
import {
  ListWhatsAppContactsQueryDto,
  RevealedPhoneDto,
  WhatsAppChatDto,
  WhatsAppContactPageDto,
  WhatsAppSummaryDto,
} from './dto/whatsapp.dto.js';

@ApiTags('Admin · WhatsApp')
@AdminOnly()
@Controller('admin/whatsapp')
export class AdminWhatsAppController {
  constructor(private readonly contacts: WhatsAppContactsService) {}

  @Get('summary')
  @ApiOperation({ summary: 'How many WhatsApp numbers have messaged Haqdar, their consent and languages' })
  @ApiOkResponse({ type: WhatsAppSummaryDto })
  summary(@Query() query: OverviewQueryDto): Promise<WhatsAppSummary> {
    return this.contacts.summary(query.days);
  }

  @Get('contacts')
  @ApiOperation({ summary: 'WhatsApp numbers (masked), most recently active first, or one exact number' })
  @ApiOkResponse({ type: WhatsAppContactPageDto })
  list(@Query() query: ListWhatsAppContactsQueryDto): Promise<Page<WhatsAppContact>> {
    return this.contacts.list(query.page, query.limit, query.phone);
  }

  @Get('contacts/:workerId')
  @ApiOperation({ summary: "One number's chat: every stored message across its conversations" })
  @ApiOkResponse({ type: WhatsAppChatDto })
  @ApiNotFoundResponse()
  chat(@Param('workerId', ParseUUIDPipe) workerId: string): Promise<WhatsAppChat> {
    return this.contacts.chat(workerId);
  }

  @Post('contacts/:workerId/reveal')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'The full phone number. Every reveal is written to the server log.' })
  @ApiOkResponse({ type: RevealedPhoneDto })
  @ApiNotFoundResponse()
  reveal(@Param('workerId', ParseUUIDPipe) workerId: string): Promise<{ phone: string }> {
    return this.contacts.reveal(workerId);
  }
}
