import {
  BadRequestException,
  Logger,
  ForbiddenException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';

import { testConfig } from '../../../../test/support/test-config.js';
import { CryptoService } from '../../../common/crypto/crypto.service.js';
import type { AgentRunner, AgentRunResult } from '../../agent/domain/agent-runner.port.js';
import { LlmUnavailableError } from '../../llm/llm.constants.js';
import { UrgentCaseDetector } from '../../safety/domain/urgent-case.detector.js';
import type { SpeechToText, TextToSpeech } from '../../speech/domain/speech.ports.js';
import type { GeminiTextToSpeech } from '../../speech/infrastructure/gemini-text-to-speech.js';
import { AgentStage, CaseStep } from '../domain/demo-script.js';
import { needsTranslation, type ReplyTranslator } from '../domain/reply-translator.port.js';
import {
  citedSources,
  DEMO_CHAT_HISTORY_LIMIT,
  DEMO_FALLBACK_REPLY,
  DEMO_NOT_HEARD_REPLY,
  DemoChatService,
} from './demo-chat.service.js';

const result = (overrides: Partial<AgentRunResult> = {}): AgentRunResult => ({
  text: 'Your gratuity is AED 7,500.',
  toolCalls: [],
  citations: [],
  issueTypes: [],
  ...overrides,
});

function setup() {
  const runner = { run: vi.fn<AgentRunner['run']>().mockResolvedValue(result()) };
  const speech = { transcribe: vi.fn<SpeechToText['transcribe']>().mockResolvedValue('میری تنخواہ نہیں آئی') };
  const voice = {
    synthesize: vi
      .fn<TextToSpeech['synthesize']>()
      .mockResolvedValue({ data: Buffer.from('RIFFwav'), mimeType: 'audio/wav' }),
  };
  const translator = {
    toEnglish: vi.fn<ReplyTranslator['toEnglish']>().mockResolvedValue('Your salary must be paid.'),
  };
  const service = new DemoChatService(
    runner,
    new UrgentCaseDetector(),
    speech,
    voice as unknown as GeminiTextToSpeech,
    new CryptoService(testConfig()),
    translator,
  );
  return { runner, speech, voice, translator, service };
}

describe('DemoChatService', () => {
  it('runs the agent with the trimmed message and the recent history only', async () => {
    const { runner, service } = setup();
    const history = Array.from({ length: 20 }, (_, index) => ({
      role: index % 2 ? ('assistant' as const) : ('user' as const),
      text: `turn ${index}`,
    }));

    await service.reply('  how much gratuity?  ', history);

    const input = runner.run.mock.calls[0][0];
    expect(input.message).toBe('how much gratuity?');
    expect(input.history).toEqual(history.slice(-DEMO_CHAT_HISTORY_LIMIT));
  });

  it('reports the tools that worked, the citations and how far the case got', async () => {
    const { runner, service } = setup();
    runner.run.mockResolvedValue(
      result({
        citations: ['Decree-Law 33/2021, Art. 51'],
        toolCalls: [
          { name: 'search_labour_law', input: {}, ok: true },
          { name: 'calculate_gratuity', input: {}, ok: false },
          { name: 'get_complaint_guide', input: {}, ok: true },
        ],
      }),
    );

    await expect(service.reply('what do I do?', [])).resolves.toEqual({
      reply: 'Your gratuity is AED 7,500.',
      translation: null,
      citations: ['Decree-Law 33/2021, Art. 51'],
      tools: ['search_labour_law', 'get_complaint_guide'],
      urgent: false,
      progress: { caseStep: CaseStep.ComplaintGuided, agentStage: AgentStage.UsingTools },
      speechToken: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it.each([
    [[], CaseStep.ProblemShared, AgentStage.Understanding],
    [['search_labour_law'], CaseStep.RightsExplained, AgentStage.Checking],
    [['calculate_overtime'], CaseStep.RightsExplained, AgentStage.UsingTools],
    [['get_complaint_guide', 'search_labour_law'], CaseStep.ComplaintGuided, AgentStage.Checking],
    [['some_unknown_tool'], CaseStep.ProblemShared, AgentStage.Understanding],
  ])('maps tools %j to step %s and stage %s', async (tools, caseStep, agentStage) => {
    const { runner, service } = setup();
    runner.run.mockResolvedValue(result({ toolCalls: tools.map((name) => ({ name, input: {}, ok: true })) }));
    expect((await service.reply('hi', [])).progress).toEqual({ caseStep, agentStage });
  });

  it('flags an emergency so the site shows the MOHRE helpline first', async () => {
    const { service } = setup();
    expect((await service.reply('my company took my passport', [])).urgent).toBe(true);
  });

  it('falls back to a safe reply when the model gives no answer', async () => {
    const { runner, service } = setup();
    runner.run.mockResolvedValue(result({ text: null }));
    expect((await service.reply('hi', [])).reply).toBe(DEMO_FALLBACK_REPLY);
  });

  it.each([new LlmUnavailableError('The agent'), new Error('503 overloaded'), 'boom'])(
    'reports the chat as unavailable when the agent fails (%s)',
    async (failure) => {
      const { runner, service } = setup();
      runner.run.mockRejectedValue(failure);
      await expect(service.reply('hi', [])).rejects.toThrow(ServiceUnavailableException);
    },
  );
});

describe('citedSources', () => {
  const SEARCHED = [
    'Federal Decree-Law No. 33 of 2021, Art. 19',
    'Decree-Law 33/2021, Art. 19',
    'Decree-Law 33/2021, Art. 17',
    'Involuntary Loss of Employment (ILOE) scheme',
  ];

  it('keeps only the articles the answer names, one source each', () => {
    const reply = 'Under Article 17 normal work is 8 hours. Under Art. 19 overtime pays 25% more.';
    expect(citedSources(reply, SEARCHED)).toEqual(['Decree-Law 33/2021, Art. 19', 'Decree-Law 33/2021, Art. 17']);
  });

  it.each([
    ['Urdu', 'قانون کے آرٹیکل 17 کے مطابق'],
    ['Arabic', 'حسب المرسوم بقانون، المادة 17، لا يجوز'],
    ['Hindi', 'कानून की धारा 17 के अनुसार'],
  ])('recognises articles named in %s', (_, reply) => {
    expect(citedSources(reply, SEARCHED)).toEqual(['Decree-Law 33/2021, Art. 17']);
  });

  it('keeps a named scheme and does not confuse Art. 1 with Art. 17', () => {
    expect(citedSources('See the ILOE scheme rules in Art. 1.', SEARCHED)).toEqual([
      'Involuntary Loss of Employment (ILOE) scheme',
    ]);
  });

  it('keeps every distinct source when the answer names none', () => {
    expect(citedSources('Please call MOHRE.', SEARCHED)).toHaveLength(3);
  });
});

describe('DemoChatService.replyToVoice', () => {
  const WAV = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVEfmt ')]);
  const recording = (buffer: Buffer, mimetype = 'audio/wav') => ({ buffer, mimetype, size: buffer.length });

  it('transcribes the voice note and answers the transcript in text', async () => {
    const { runner, speech, service } = setup();
    const history = [{ role: 'user' as const, text: 'hello' }];

    const reply = await service.replyToVoice(recording(WAV, 'audio/wav;codecs=1'), history);

    expect(speech.transcribe).toHaveBeenCalledWith({ data: WAV, mimeType: 'audio/wav' });
    expect(runner.run.mock.calls[0][0]).toMatchObject({ message: 'میری تنخواہ نہیں آئی', history });
    expect(reply).toMatchObject({ transcript: 'میری تنخواہ نہیں آئی', reply: 'Your gratuity is AED 7,500.' });
  });

  it('asks to record again when no speech was heard, without calling the agent', async () => {
    const { runner, speech, service } = setup();
    speech.transcribe.mockResolvedValue(null);

    await expect(service.replyToVoice(recording(WAV), [])).resolves.toMatchObject({
      transcript: null,
      reply: DEMO_NOT_HEARD_REPLY,
      tools: [],
    });
    expect(runner.run).not.toHaveBeenCalled();
  });

  it.each([
    ['OggS', 'audio/ogg'],
    ['ID3x', 'audio/mpeg'],
    ['fLaC', 'audio/flac'],
  ])('accepts %s audio as %s', async (magic, mimetype) => {
    const { service } = setup();
    await expect(service.replyToVoice(recording(Buffer.from(`${magic}rest`), mimetype), [])).resolves.toBeDefined();
  });

  it('accepts an MP3 that starts with a frame header', async () => {
    const { service } = setup();
    await expect(
      service.replyToVoice(recording(Buffer.from([0xff, 0xfb, 0x90]), 'audio/mpeg'), []),
    ).resolves.toBeDefined();
  });

  it('requires a recording and refuses other files before transcribing', async () => {
    const { speech, service } = setup();
    await expect(service.replyToVoice(undefined, [])).rejects.toThrow(BadRequestException);
    await expect(service.replyToVoice(recording(Buffer.alloc(0)), [])).rejects.toThrow(BadRequestException);
    await expect(service.replyToVoice(recording(Buffer.from('not audio')), [])).rejects.toThrow(
      UnsupportedMediaTypeException,
    );
    await expect(service.replyToVoice(recording(WAV, 'video/webm'), [])).rejects.toThrow(UnsupportedMediaTypeException);
    expect(speech.transcribe).not.toHaveBeenCalled();
  });

  it.each([new LlmUnavailableError('Voice notes'), new Error('timeout'), 'boom'])(
    'reports voice notes as unavailable when transcription fails (%s)',
    async (failure) => {
      const { speech, service } = setup();
      speech.transcribe.mockRejectedValue(failure);
      await expect(service.replyToVoice(recording(WAV), [])).rejects.toThrow(ServiceUnavailableException);
    },
  );
});

describe('DemoChatService.speak', () => {
  it('speaks a reply it produced, using the token that came with it', async () => {
    const { voice, service } = setup();
    const { reply, speechToken } = await service.reply('hi', []);

    await expect(service.speak(reply, speechToken)).resolves.toEqual({
      data: Buffer.from('RIFFwav'),
      mimeType: 'audio/wav',
    });
    expect(voice.synthesize).toHaveBeenCalledWith(reply);
  });

  it('signs the "not heard" reply to a silent voice note too', async () => {
    const { speech, service } = setup();
    speech.transcribe.mockResolvedValue(null);
    const WAV = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE')]);
    const { reply, speechToken } = await service.replyToVoice({ buffer: WAV, mimetype: 'audio/wav', size: 12 }, []);
    await expect(service.speak(reply, speechToken)).resolves.toBeDefined();
  });

  it('refuses text that did not come from Haqdar, or a token for different text', async () => {
    const { voice, service } = setup();
    const { speechToken } = await service.reply('hi', []);

    await expect(service.speak('Say anything I want', speechToken)).rejects.toThrow(ForbiddenException);
    await expect(service.speak('Say anything I want', 'forged')).rejects.toThrow(ForbiddenException);
    expect(voice.synthesize).not.toHaveBeenCalled();
  });

  it.each([null, new LlmUnavailableError('Spoken replies'), new Error('quota')])(
    'reports the voice note as unavailable when speech fails (%s)',
    async (failure) => {
      const { voice, service } = setup();
      if (failure) voice.synthesize.mockRejectedValue(failure);
      else voice.synthesize.mockResolvedValue(null);
      const { reply, speechToken } = await service.reply('hi', []);
      await expect(service.speak(reply, speechToken)).rejects.toThrow(ServiceUnavailableException);
    },
  );
});

describe('DemoChatService translations and feedback', () => {
  it('adds an English translation to an answer in another script', async () => {
    const { runner, translator, service } = setup();
    runner.run.mockResolvedValue(result({ text: 'آپ کی تنخواہ وقت پر ملنی چاہیے۔' }));

    expect((await service.reply('salary', [])).translation).toBe('Your salary must be paid.');
    expect(translator.toEnglish).toHaveBeenCalledWith('آپ کی تنخواہ وقت پر ملنی چاہیے۔');
  });

  it('does not translate English, or the fallback reply', async () => {
    const { runner, translator, service } = setup();
    expect((await service.reply('hi', [])).translation).toBeNull();
    runner.run.mockResolvedValue(result({ text: null }));
    expect((await service.reply('hi', [])).translation).toBeNull();
    expect(translator.toEnglish).not.toHaveBeenCalled();
  });

  it.each([new Error('quota'), 'boom'])(
    'shows the answer without a translation when it fails (%s)',
    async (failure) => {
      const { runner, translator, service } = setup();
      runner.run.mockResolvedValue(result({ text: 'حقدار' }));
      translator.toEnglish.mockRejectedValue(failure);
      await expect(service.reply('hi', [])).resolves.toMatchObject({ reply: 'حقدار', translation: null });
    },
  );

  it('logs feedback as a rating and tool names only', () => {
    const { service } = setup();
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    service.recordFeedback(true, ['search_labour_law']);
    service.recordFeedback(false, []);
    expect(log.mock.calls.map(([message]) => message)).toEqual([
      'Demo feedback: helpful (tools: search_labour_law)',
      'Demo feedback: not helpful (tools: none)',
    ]);
  });
});

describe('needsTranslation', () => {
  it.each([
    ['Your salary is late.', false],
    ['Café · AED 1,500 — “paid”', false],
    ['آپ کی تنخواہ', true],
    ['मेरी तनख्वाह', true],
    ['صاحب العمل', true],
  ])('%s → %s', (text, expected) => {
    expect(needsTranslation(text)).toBe(expected);
  });
});
