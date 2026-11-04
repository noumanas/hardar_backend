import { spawn } from 'node:child_process';

/** Long enough for a two-minute reply on a slow machine; a stuck process never holds a worker's queue. */
const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * Converts audio (Gemini's WAV) to Ogg/Opus with ffmpeg: the only format WhatsApp plays as
 * a voice note. Mono, 48 kHz, 24 kbit/s speech settings keep a one-minute note under 200 KB.
 */
export class OggOpusEncoder {
  constructor(
    private readonly ffmpegPath: string,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {}

  encode(audio: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn(
        this.ffmpegPath,
        [
          ['-hide_banner', '-loglevel', 'error'],
          ['-i', 'pipe:0'],
          ['-ac', '1', '-ar', '48000'],
          ['-c:a', 'libopus', '-b:a', '24k', '-application', 'voip'],
          ['-f', 'ogg', 'pipe:1'],
        ].flat(),
        { stdio: ['pipe', 'pipe', 'pipe'] },
      );

      const output: Buffer[] = [];
      const errors: Buffer[] = [];
      const timer = setTimeout(() => {
        ffmpeg.kill('SIGKILL');
        reject(new Error(`ffmpeg took longer than ${this.timeoutMs} ms`));
      }, this.timeoutMs);

      ffmpeg.stdout.on('data', (chunk: Buffer) => output.push(chunk));
      ffmpeg.stderr.on('data', (chunk: Buffer) => errors.push(chunk));
      ffmpeg.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      ffmpeg.on('close', (code) => {
        clearTimeout(timer);
        const ogg = Buffer.concat(output);
        if (code === 0 && ogg.length > 0) resolve(ogg);
        else reject(new Error(`ffmpeg exited with ${code}: ${Buffer.concat(errors).toString().slice(0, 300)}`));
      });
      // ffmpeg may exit before reading all its input (bad audio); that is reported on close.
      ffmpeg.stdin.on('error', () => undefined);
      ffmpeg.stdin.end(audio);
    });
  }
}
