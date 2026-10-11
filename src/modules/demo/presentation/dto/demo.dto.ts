import { ApiProperty } from '@nestjs/swagger';
import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { AgentStage, CaseStep } from '../../domain/demo-script.js';

const NODE_ID = /^[a-z0-9_-]{1,40}$/;

export class DemoStepDto {
  @ApiProperty({ example: 's1', description: 'The step the visitor is on (`nodeId` of the last turn)' })
  @IsString()
  @MaxLength(40)
  @Matches(NODE_ID)
  from: string;

  @ApiProperty({ example: 's2', description: 'The `id` of the quick reply the visitor chose' })
  @IsString()
  @MaxLength(40)
  @Matches(NODE_ID)
  to: string;
}

export class DemoScenarioDto {
  @ApiProperty({ example: 'late-salary' }) id: string;
  @ApiProperty({ example: 'Late salary' }) title: string;
  @ApiProperty({ example: '2 months unpaid' }) subtitle: string;
}

class DemoCardDto {
  @ApiProperty({ example: 'Owed for 2 months' }) label: string;
  @ApiProperty({ example: 'AED 3,000', description: 'Worked out by the real calculators' }) value: string;
  @ApiProperty({ enum: ['lime', 'peach', 'lilac'] }) tone: string;
}

class DemoMessageDto {
  @ApiProperty() text: string;
  @ApiProperty({ nullable: true, type: String, description: 'A line in Urdu script' }) urdu: string | null;
  @ApiProperty({
    nullable: true,
    type: String,
    example: 'Decree-Law 33/2021, Art. 22; Wage Protection System',
    description: 'From the real knowledge-base search',
  })
  source: string | null;
  @ApiProperty({ nullable: true, type: DemoCardDto }) card: DemoCardDto | null;
  @ApiProperty({ description: 'A follow-up the agent sends days later' }) followUp: boolean;
}

class DemoChipDto {
  @ApiProperty({ example: 's2' }) id: string;
  @ApiProperty({ example: 'My salary is 2 months late' }) label: string;
  @ApiProperty({ enum: ['reply', 'next_scenario'] }) action: string;
}

class DemoProgressDto {
  @ApiProperty({ enum: CaseStep, enumName: 'DemoCaseStep' }) caseStep: CaseStep;
  @ApiProperty({ enum: AgentStage, enumName: 'DemoAgentStage' }) agentStage: AgentStage;
  @ApiProperty({ enum: ['in_progress', 'complaint_filed', 'resolved'] }) status: string;
  @ApiProperty() resolved: boolean;
}

export class DemoTurnDto {
  @ApiProperty({ example: 'late-salary' }) scenarioId: string;
  @ApiProperty({ example: 's2' }) nodeId: string;
  @ApiProperty({ type: [DemoMessageDto] }) messages: DemoMessageDto[];
  @ApiProperty({ type: [DemoChipDto] }) chips: DemoChipDto[];
  @ApiProperty({ type: DemoProgressDto }) progress: DemoProgressDto;
  @ApiProperty({ example: 'passport-kept' }) nextScenarioId: string;
}

class DemoContractTermDto {
  @ApiProperty({ example: 'Basic salary' }) label: string;
  @ApiProperty({ example: 'AED 1,500 a month' }) value: string;
}

class DemoContractFlagDto {
  @ApiProperty({ example: 'Probation is longer than the law allows' }) title: string;
  @ApiProperty({ nullable: true, type: String, example: '9' }) found: string | null;
  @ApiProperty({ example: '6 months maximum' }) legalLimit: string;
  @ApiProperty({ example: 'Art. 9' }) articleRef: string;
}

export class DemoContractReadingDto {
  @ApiProperty({ description: 'False when the photo is too blurry or is not a contract' }) legible: boolean;
  @ApiProperty({ description: "Haqdar's reply in the chat" }) message: string;
  @ApiProperty({ type: [DemoContractTermDto], required: false, description: 'Only the terms the contract states' })
  terms?: DemoContractTermDto[];
  @ApiProperty({ type: [DemoContractFlagDto], required: false, description: 'Decided by code, not by the model' })
  flags?: DemoContractFlagDto[];
}

export class DemoChatTurnDto {
  @ApiProperty({ enum: ['user', 'assistant'] })
  @IsIn(['user', 'assistant'])
  role: 'user' | 'assistant';

  @ApiProperty({ example: 'My salary is 2 months late' })
  @IsString()
  @MaxLength(4000)
  text: string;
}

export class DemoChatRequestDto {
  @ApiProperty({ example: 'My basic salary is AED 1,500 and I worked 6 years. How much gratuity do I get?' })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  message: string;

  @ApiProperty({
    type: [DemoChatTurnDto],
    description: 'Earlier turns of this chat, oldest first. Only the last 12 are used. Nothing is stored.',
  })
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => DemoChatTurnDto)
  history: DemoChatTurnDto[];
}

class DemoChatProgressDto {
  @ApiProperty({ enum: CaseStep, enumName: 'DemoCaseStep' }) caseStep: CaseStep;
  @ApiProperty({ enum: AgentStage, enumName: 'DemoAgentStage' }) agentStage: AgentStage;
}

export class DemoSpeechRequestDto {
  @ApiProperty({ description: 'The reply text exactly as returned by /demo/chat or /demo/voice' })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  text: string;

  @ApiProperty({ description: 'The `speechToken` returned with that reply' })
  @IsString()
  @MaxLength(128)
  token: string;
}

export class DemoFeedbackDto {
  @ApiProperty({ description: 'Whether the answer helped' })
  @IsBoolean()
  helpful: boolean;

  @ApiProperty({ type: [String], example: ['search_labour_law'], description: 'The tools that answer used' })
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tools: string[];
}

export class DemoChatReplyDto {
  @ApiProperty({ description: "Haqdar's answer, in the visitor's language" }) reply: string;
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'The answer in plain English when it was written in another language',
  })
  translation: string | null;
  @ApiProperty({ type: [String], example: ['Decree-Law 33/2021, Art. 51'] }) citations: string[];
  @ApiProperty({ type: [String], example: ['search_labour_law', 'calculate_gratuity'] }) tools: string[];
  @ApiProperty({ description: 'The message describes an emergency: show the MOHRE helpline first' }) urgent: boolean;
  @ApiProperty({ type: DemoChatProgressDto }) progress: DemoChatProgressDto;
  @ApiProperty({ description: 'Send with the reply text to POST /demo/speech to get it as a voice note' })
  speechToken: string;
}

/** Multipart can only carry text fields, so the chat so far arrives as a JSON string. */
function parseTurns({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string' || value.trim() === '') return [];
  try {
    const turns: unknown = JSON.parse(value);
    return Array.isArray(turns) ? plainToInstance(DemoChatTurnDto, turns) : value;
  } catch {
    return value;
  }
}

export class DemoVoiceRequestDto {
  @ApiProperty({
    type: String,
    required: false,
    example: '[{"role":"user","text":"My salary is late"},{"role":"assistant","text":"How many months?"}]',
    description: 'Earlier turns as a JSON array of {role, text}. Only the last 12 are used. Nothing is stored.',
  })
  @Transform(parseTurns)
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  history: DemoChatTurnDto[] = [];
}

export class DemoVoiceReplyDto extends DemoChatReplyDto {
  @ApiProperty({ nullable: true, type: String, description: 'What Haqdar heard, in the language spoken' })
  transcript: string | null;
}
