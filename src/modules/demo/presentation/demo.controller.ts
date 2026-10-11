import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiPayloadTooLargeResponse,
  ApiServiceUnavailableResponse,
  ApiUnsupportedMediaTypeResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOperation,
  ApiProduces,
  ApiParam,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import {
  DEMO_CONTRACT_MAX_BYTES,
  DemoContractService,
  type DemoContractReading,
  type UploadedMedia,
} from '../application/demo-contract.service.js';
import {
  DEMO_VOICE_MAX_BYTES,
  DemoChatService,
  type DemoChatReply,
  type DemoVoiceReply,
} from '../application/demo-chat.service.js';
import { DemoService, type DemoScenarioSummary, type DemoTurn } from '../application/demo.service.js';
import {
  DemoChatReplyDto,
  DemoChatRequestDto,
  DemoContractReadingDto,
  DemoFeedbackDto,
  DemoScenarioDto,
  DemoSpeechRequestDto,
  DemoStepDto,
  DemoTurnDto,
  DemoVoiceReplyDto,
  DemoVoiceRequestDto,
} from './dto/demo.dto.js';
import { DemoLimit, DemoRateLimitGuard } from './demo-rate-limit.guard.js';

/**
 * Public API behind the website's "Try the demo". No sign-in and nothing stored: the
 * visitor's position in the script travels with each request. Rate-limited per IP.
 */
@ApiTags('Demo (public)')
@ApiTooManyRequestsResponse({
  description:
    'A visitor or the demo as a whole is over its limit. `Retry-After` says when to try again; `X-Demo-Limit-Scope` is `visitor` or `everyone`.',
})
@UseGuards(DemoRateLimitGuard)
@Throttle({ default: { ttl: 60_000, limit: 60 } })
@Controller('demo')
export class DemoController {
  constructor(
    private readonly demo: DemoService,
    private readonly contracts: DemoContractService,
    private readonly chat: DemoChatService,
  ) {}

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @DemoLimit('ai')
  @ApiOperation({
    summary: 'Chat with the real Haqdar agent',
    description:
      'Runs the same agent as on WhatsApp (Gemini, labour-law search, gratuity and overtime calculators, complaint guides). Stateless: send the earlier turns as `history`; nothing is stored. Per visitor: 10 a minute, 40 an hour, 150 a day (shared with voice notes), plus an hourly ceiling for everyone. `X-Demo-Remaining` says how many are left.',
  })
  @ApiOkResponse({ type: DemoChatReplyDto })
  @ApiServiceUnavailableResponse({ description: 'The AI model is not configured or failed; use the guided demo' })
  sendMessage(@Body() body: DemoChatRequestDto): Promise<DemoChatReply> {
    return this.chat.reply(body.message, body.history);
  }

  @Post('feedback')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @ApiOperation({
    summary: '"Was this helpful?" on an answer',
    description: 'Logs the rating and the tools the answer used. No message text is sent or kept.',
  })
  @ApiNoContentResponse({ description: 'Recorded' })
  feedback(@Body() body: DemoFeedbackDto): void {
    this.chat.recordFeedback(body.helpful, body.tools);
  }

  @Post('speech')
  @HttpCode(HttpStatus.OK)
  @DemoLimit('speech')
  @ApiOperation({
    summary: 'A Haqdar reply as a voice note',
    description:
      'Speaks a reply from /demo/chat or /demo/voice in its own language with Gemini text-to-speech, as WAV (24 kHz mono). Only text that comes with its `speechToken` is accepted. Per visitor: 20 a minute, 150 an hour, plus an hourly ceiling for everyone.',
  })
  @ApiProduces('audio/wav')
  @ApiOkResponse({ description: 'The voice note', schema: { type: 'string', format: 'binary' } })
  @ApiForbiddenResponse({ description: 'The token does not match the text' })
  @ApiServiceUnavailableResponse({ description: 'Text-to-speech is unavailable; the text answer still stands' })
  async speech(@Body() body: DemoSpeechRequestDto): Promise<StreamableFile> {
    const audio = await this.chat.speak(body.text, body.token);
    return new StreamableFile(audio.data, { type: audio.mimeType, length: audio.data.length });
  }

  @Post('voice')
  @HttpCode(HttpStatus.OK)
  @DemoLimit('ai')
  @UseInterceptors(FileInterceptor('audio', { limits: { fileSize: DEMO_VOICE_MAX_BYTES, files: 1 } }))
  @ApiOperation({
    summary: 'Send a voice note to the real Haqdar agent',
    description:
      'Gemini transcribes the recording in whatever language was spoken (Urdu, Hindi, Bengali, Nepali, Malayalam, Tagalog, Arabic, English…), then the agent answers in text, in that language. The audio is held in memory for this request only. Per visitor: shares the chat limits (10 a minute, 40 an hour, 150 a day).',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['audio'],
      properties: {
        audio: { type: 'string', format: 'binary', description: 'WAV, Ogg, MP3 or FLAC, up to 4 MB' },
        history: { type: 'string', description: 'Earlier turns as a JSON array of {role, text}' },
      },
    },
  })
  @ApiOkResponse({ type: DemoVoiceReplyDto })
  @ApiBadRequestResponse({ description: 'No recording attached, or invalid history' })
  @ApiPayloadTooLargeResponse({ description: 'Recording larger than 4 MB' })
  @ApiUnsupportedMediaTypeResponse({ description: 'Not WAV, Ogg, MP3 or FLAC audio' })
  @ApiServiceUnavailableResponse({ description: 'Transcription or the AI model is unavailable' })
  sendVoice(
    @UploadedFile() recording: UploadedMedia | undefined,
    @Body() body: DemoVoiceRequestDto,
  ): Promise<DemoVoiceReply> {
    return this.chat.replyToVoice(recording, body.history);
  }

  @Get('scenarios')
  @ApiOperation({ summary: 'Example cases a visitor can try' })
  @ApiOkResponse({ type: [DemoScenarioDto] })
  scenarios(): DemoScenarioSummary[] {
    return this.demo.list();
  }

  @Post('scenarios/:scenarioId/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Start a case: the agent's greeting and the first quick replies" })
  @ApiParam({ name: 'scenarioId', example: 'late-salary' })
  @ApiOkResponse({ type: DemoTurnDto })
  @ApiNotFoundResponse({ description: 'Unknown case' })
  start(@Param('scenarioId') scenarioId: string): Promise<DemoTurn> {
    return this.demo.start(scenarioId);
  }

  @Post('scenarios/:scenarioId/steps')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Take a quick reply and get the agent’s next turn' })
  @ApiParam({ name: 'scenarioId', example: 'late-salary' })
  @ApiOkResponse({ type: DemoTurnDto })
  @ApiBadRequestResponse({ description: 'That reply is not offered at that step' })
  @ApiNotFoundResponse({ description: 'Unknown case' })
  step(@Param('scenarioId') scenarioId: string, @Body() body: DemoStepDto): Promise<DemoTurn> {
    return this.demo.step(scenarioId, body.from, body.to);
  }

  @Post('contract')
  @HttpCode(HttpStatus.OK)
  @DemoLimit('contract')
  @UseInterceptors(FileInterceptor('contract', { limits: { fileSize: DEMO_CONTRACT_MAX_BYTES, files: 1 } }))
  @ApiOperation({
    summary: 'Read a contract photo or PDF',
    description:
      'Reads the key terms with the same vision model and legal checks as on WhatsApp. The photo is held in memory for this request only; nothing is saved. Per visitor: 5 a minute, 20 a day, plus an hourly ceiling for everyone.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['contract'],
      properties: {
        contract: {
          type: 'string',
          format: 'binary',
          description: 'A photo (JPG, PNG, WebP, HEIC) or a PDF, up to 10 MB',
        },
      },
    },
  })
  @ApiOkResponse({ type: DemoContractReadingDto })
  @ApiBadRequestResponse({ description: 'No photo attached' })
  @ApiPayloadTooLargeResponse({ description: 'File larger than 10 MB' })
  @ApiUnsupportedMediaTypeResponse({ description: 'Not a JPG, PNG, WebP, HEIC image or a PDF' })
  @ApiServiceUnavailableResponse({ description: 'Contract reading is not configured or the model failed' })
  readContract(@UploadedFile() photo: UploadedMedia | undefined): Promise<DemoContractReading> {
    return this.contracts.read(photo);
  }
}
