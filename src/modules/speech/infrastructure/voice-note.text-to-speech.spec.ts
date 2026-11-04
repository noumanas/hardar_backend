import { Logger } from '@nestjs/common';

import { testConfig } from '../../../../test/support/test-config.js';
import { LlmSettings } from '../../llm/llm-settings.js';
import { createVoiceNotes } from '../speech.module.js';
import { BUNDLED_FFMPEG_PATH as ffmpegPath } from './bundled-ffmpeg.js';
import { wavFromPcm } from './gemini-text-to-speech.js';
import { OggOpusEncoder } from './ogg-opus.encoder.js';
import { UnconfiguredTextToSpeech } from './unconfigured-speech.adapters.js';
import { VoiceNoteTextToSpeech } from './voice-note.text-to-speech.js';

/** Half a second of a 440 Hz tone, as Gemini's 24 kHz mono WAV. */
const toneWav = () => {
  const rate = 24_000;
  const pcm = Buffer.alloc(rate);
  for (let i = 0; i < rate / 2; i += 1)
    pcm.writeInt16LE(Math.round(8000 * Math.sin((2 * Math.PI * 440 * i) / rate)), i * 2);
  return wavFromPcm(pcm, rate);
};

describe('VoiceNoteTextToSpeech', () => {
  it('speaks the text and converts the audio to an Ogg voice note', async () => {
    const speech = { synthesize: vi.fn().mockResolvedValue({ data: Buffer.from('wav'), mimeType: 'audio/wav' }) };
    const encoder = { encode: vi.fn().mockResolvedValue(Buffer.from('OggS')) };

    await expect(new VoiceNoteTextToSpeech(speech, encoder).synthesize('جواب')).resolves.toEqual({
      data: Buffer.from('OggS'),
      mimeType: 'audio/ogg',
    });
    expect(speech.synthesize).toHaveBeenCalledWith('جواب');
    expect(encoder.encode).toHaveBeenCalledWith(Buffer.from('wav'));
  });

  it('returns nothing when there is no speech to convert', async () => {
    const encoder = { encode: vi.fn() };
    const tts = new VoiceNoteTextToSpeech({ synthesize: vi.fn().mockResolvedValue(null) }, encoder);

    await expect(tts.synthesize('')).resolves.toBeNull();
    expect(encoder.encode).not.toHaveBeenCalled();
  });
});

describe('createVoiceNotes', () => {
  const gemini = { synthesize: vi.fn() };

  it('speaks WhatsApp replies when Gemini and ffmpeg are available', () => {
    expect(createVoiceNotes(gemini, new LlmSettings(testConfig()), '/bin/ffmpeg')).toBeInstanceOf(
      VoiceNoteTextToSpeech,
    );
  });

  it('stays text only without Gemini or without ffmpeg', () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const noGemini = new LlmSettings(testConfig({ AGENT_LLM_PROVIDER: 'none' }));
    expect(createVoiceNotes(gemini, noGemini, '/bin/ffmpeg')).toBeInstanceOf(UnconfiguredTextToSpeech);
    expect(createVoiceNotes(gemini, new LlmSettings(testConfig()), null)).toBeInstanceOf(UnconfiguredTextToSpeech);
  });
});

describe('OggOpusEncoder (real ffmpeg)', () => {
  it.runIf(ffmpegPath)('turns a WAV into Ogg/Opus', async () => {
    const ogg = await new OggOpusEncoder(ffmpegPath!).encode(toneWav());

    expect(ogg.toString('ascii', 0, 4)).toBe('OggS');
    expect(ogg.includes(Buffer.from('OpusHead'))).toBe(true);
  });

  it.runIf(ffmpegPath)('fails clearly on audio it cannot read', async () => {
    await expect(new OggOpusEncoder(ffmpegPath!).encode(Buffer.from('not audio'))).rejects.toThrow(/ffmpeg exited/);
  });

  it('fails when ffmpeg cannot be started', async () => {
    await expect(new OggOpusEncoder('/no/such/ffmpeg').encode(toneWav())).rejects.toThrow();
  });
});
