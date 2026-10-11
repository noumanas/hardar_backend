export interface Audio {
  data: Buffer;
  mimeType: string;
}

/**
 * FR-2: Urdu voice note to text. Returns `null` when the audio can't be understood,
 * so the worker is asked to repeat or type instead.
 */
export abstract class SpeechToText {
  abstract transcribe(audio: Audio): Promise<string | null>;
}

/**
 * FR-3: Urdu text to a voice reply. Returns `null` when speech is unavailable; the
 * reply then goes out as text only (PRD: graceful fallback to text).
 */
export abstract class TextToSpeech {
  abstract synthesize(text: string): Promise<Audio | null>;
}
