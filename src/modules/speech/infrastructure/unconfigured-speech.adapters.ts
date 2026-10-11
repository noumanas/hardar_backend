import { Injectable, Logger } from '@nestjs/common';

import { SpeechToText, TextToSpeech, type Audio } from '../domain/speech.ports.js';

/*
 * The PRD picks the Urdu speech providers only after testing 2–3 of them on real voice
 * notes. Until then these adapters keep the agent working in text: voice notes get a
 * "please type" reply and answers are sent as text. Swap in a real adapter in SpeechModule.
 */

@Injectable()
export class UnconfiguredSpeechToText implements SpeechToText {
  private readonly logger = new Logger(UnconfiguredSpeechToText.name);

  transcribe(audio: Audio): Promise<string | null> {
    this.logger.warn(`No speech-to-text provider configured; ignoring ${audio.mimeType} voice note`);
    return Promise.resolve(null);
  }
}

@Injectable()
export class UnconfiguredTextToSpeech implements TextToSpeech {
  synthesize(): Promise<Audio | null> {
    return Promise.resolve(null);
  }
}
