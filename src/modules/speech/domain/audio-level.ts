/**
 * Below this loudness (RMS of 16-bit samples, about -50 dBFS) a recording is treated as
 * silence. Speech models can invent words for silent audio, so silence never reaches them.
 */
export const SILENCE_RMS = 100;

/**
 * Whether a 16-bit PCM WAV file is silent. Returns null for anything it can't read
 * (another format or encoding), so the caller falls back to the model's own judgement.
 */
export function isSilentWav(data: Buffer): boolean | null {
  if (data.length < 12 || data.toString('ascii', 0, 4) !== 'RIFF' || data.toString('ascii', 8, 12) !== 'WAVE') {
    return null;
  }

  let offset = 12;
  let pcm16 = false;
  while (offset + 8 <= data.length) {
    const id = data.toString('ascii', offset, offset + 4);
    const size = data.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ' && body + 16 <= data.length) {
      pcm16 = data.readUInt16LE(body) === 1 && data.readUInt16LE(body + 14) === 16;
    } else if (id === 'data') {
      if (!pcm16) return null;
      const end = Math.min(body + size, data.length);
      const samples = Math.floor((end - body) / 2);
      if (samples === 0) return true;
      let sum = 0;
      for (let index = 0; index < samples; index += 1) {
        const sample = data.readInt16LE(body + index * 2);
        sum += sample * sample;
      }
      return Math.sqrt(sum / samples) < SILENCE_RMS;
    }
    offset = body + size + (size % 2);
  }
  return null;
}
