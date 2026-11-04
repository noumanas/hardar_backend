import type { Audio, TextToSpeech } from '../domain/speech.ports.js';

export interface AudioEncoder {
  encode(audio: Buffer): Promise<Buffer>;
}

export const VOICE_NOTE_MIME_TYPE = 'audio/ogg';

/**
 * FR-3 for WhatsApp: speaks the reply with the website's voice (Gemini, WAV) and converts it
 * to Ogg/Opus so WhatsApp shows it as a voice note.
 */
export class VoiceNoteTextToSpeech implements TextToSpeech {
  constructor(
    private readonly speech: TextToSpeech,
    private readonly encoder: AudioEncoder,
  ) {}

  async synthesize(text: string): Promise<Audio | null> {
    const audio = await this.speech.synthesize(text);
    if (!audio) return null;
    return { data: await this.encoder.encode(audio.data), mimeType: VOICE_NOTE_MIME_TYPE };
  }
}
