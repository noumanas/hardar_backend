import { testConfig } from '../../../test/support/test-config.js';
import { CryptoService } from './crypto.service.js';

describe('CryptoService', () => {
  const crypto = new CryptoService(testConfig());

  describe('hash', () => {
    it('is a stable 64-character hex HMAC', () => {
      expect(crypto.hash('971500000001')).toMatch(/^[0-9a-f]{64}$/);
      expect(crypto.hash('971500000001')).toBe(crypto.hash('971500000001'));
    });

    it('depends on the secret, so stored hashes are useless without it', () => {
      const other = new CryptoService(testConfig({ HASH_SECRET: 'another-secret-that-is-32-chars-long!!' }));
      expect(other.hash('971500000001')).not.toBe(crypto.hash('971500000001'));
    });
  });

  describe('encrypt / decrypt', () => {
    it('round-trips Unicode text', () => {
      expect(crypto.decrypt(crypto.encrypt('+971 50 000 0001 · حقدار'))).toBe('+971 50 000 0001 · حقدار');
    });

    it('uses a fresh IV, so equal inputs give different ciphertexts', () => {
      expect(crypto.encrypt('same')).not.toBe(crypto.encrypt('same'));
    });

    it('rejects tampered ciphertext', () => {
      const [iv, tag, data] = crypto.encrypt('secret').split('.');
      const tampered = Buffer.from(data, 'base64url');
      tampered[0] = (tampered[0] ?? 0) ^ 0xff;

      expect(() => crypto.decrypt([iv, tag, tampered.toString('base64url')].join('.'))).toThrow();
    });

    it('rejects a malformed payload', () => {
      expect(() => crypto.decrypt('not-encrypted')).toThrow('Malformed encrypted payload');
    });
  });

  it('compares secrets safely, including different lengths', () => {
    expect(crypto.safeEqual('abc', 'abc')).toBe(true);
    expect(crypto.safeEqual('abc', 'abd')).toBe(false);
    expect(crypto.safeEqual('abc', 'abcd')).toBe(false);
  });
});
