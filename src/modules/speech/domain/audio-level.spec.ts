import { isSilentWav, SILENCE_RMS } from './audio-level.js';

function wav(samples: number[], { format = 1, bits = 16, extraChunk = false } = {}): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((sample, index) => data.writeInt16LE(sample, index * 2));
  const fmt = Buffer.alloc(16);
  fmt.writeUInt16LE(format, 0);
  fmt.writeUInt16LE(1, 2);
  fmt.writeUInt32LE(16_000, 4);
  fmt.writeUInt32LE(32_000, 8);
  fmt.writeUInt16LE(2, 12);
  fmt.writeUInt16LE(bits, 14);
  const chunk = (id: string, body: Buffer) => {
    const header = Buffer.alloc(8);
    header.write(id, 0, 'ascii');
    header.writeUInt32LE(body.length, 4);
    return Buffer.concat([header, body, body.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
  };
  const chunks = [chunk('fmt ', fmt), ...(extraChunk ? [chunk('LIST', Buffer.from('abc'))] : []), chunk('data', data)];
  const body = Buffer.concat([Buffer.from('WAVE'), ...chunks]);
  const header = Buffer.alloc(8);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}

describe('isSilentWav', () => {
  it('treats an all-zero recording as silent', () => {
    expect(isSilentWav(wav(new Array(1600).fill(0)))).toBe(true);
  });

  it('treats a recording with speech-level signal as not silent', () => {
    const tone = Array.from({ length: 1600 }, (_, index) => Math.round(4000 * Math.sin(index / 5)));
    expect(isSilentWav(wav(tone))).toBe(false);
  });

  it('puts the threshold just above faint hiss', () => {
    expect(isSilentWav(wav(new Array(800).fill(SILENCE_RMS - 1)))).toBe(true);
    expect(isSilentWav(wav(new Array(800).fill(SILENCE_RMS + 1)))).toBe(false);
  });

  it('skips other chunks before the audio, and treats an empty data chunk as silent', () => {
    expect(isSilentWav(wav(new Array(400).fill(3000), { extraChunk: true }))).toBe(false);
    expect(isSilentWav(wav([]))).toBe(true);
  });

  it.each([
    ['not a WAV file', Buffer.from('OggS-not-wav')],
    ['a float WAV', wav([1, 2, 3], { format: 3, bits: 32 })],
    ['an 8-bit WAV', wav([1, 2, 3], { bits: 8 })],
    ['a WAV with no data chunk', wav([1]).subarray(0, 36)],
  ])('returns null for %s', (_, data) => {
    expect(isSilentWav(data)).toBeNull();
  });
});
