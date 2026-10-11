import { Logger } from '@nestjs/common';

import { UnconfiguredSpeechToText, UnconfiguredTextToSpeech } from './unconfigured-speech.adapters.js';

describe('unconfigured speech adapters', () => {
  it('cannot transcribe, so the agent asks the worker to type instead', async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    await expect(
      new UnconfiguredSpeechToText().transcribe({ data: Buffer.from(''), mimeType: 'audio/ogg' }),
    ).resolves.toBeNull();
  });

  it('cannot synthesise, so replies go out as text only', async () => {
    await expect(new UnconfiguredTextToSpeech().synthesize()).resolves.toBeNull();
  });
});
