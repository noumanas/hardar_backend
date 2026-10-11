import { randomUUID } from 'node:crypto';

import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

import { AdminOnly } from '../../../common/decorators/admin-only.decorator.js';
import { AgentOrchestrator } from '../application/agent-orchestrator.service.js';

class SimulateMessageDto {
  @ApiProperty({ example: '971500000001', description: 'Test phone number, digits only' })
  @Matches(/^\d{8,15}$/)
  phone: string;

  @ApiProperty({ example: 'میری تنخواہ دو مہینے سے نہیں آئی' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  text: string;
}

class SimulateReplyDto {
  @ApiPropertyOptional({ nullable: true, type: String, description: 'Null when the message was a duplicate' })
  reply: string | null;

  @ApiProperty({ description: 'Whether a voice version would be sent' })
  hasAudio: boolean;
}

/**
 * Runs the full agent pipeline from an HTTP request, without WhatsApp. Used by the
 * admin dashboard and the legal test set (PRD: 30-question accuracy check).
 */
@ApiTags('Admin · Agent playground')
@AdminOnly()
@Controller('admin/agent')
export class AgentPlaygroundController {
  constructor(private readonly orchestrator: AgentOrchestrator) {}

  @Post('simulate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a text message as a worker and get the agent reply' })
  @ApiOkResponse({ type: SimulateReplyDto })
  async simulate(@Body() body: SimulateMessageDto): Promise<SimulateReplyDto> {
    const reply = await this.orchestrator.handle({
      kind: 'text',
      from: body.phone,
      text: body.text,
      externalId: `playground-${randomUUID()}`,
    });
    return { reply: reply?.text ?? null, hasAudio: Boolean(reply?.audio) };
  }
}
