import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { AppConfigService } from '../../config/app-config.service.js';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * Protects personal data at rest (PRD: privacy).
 * - `hash` gives a stable lookup key for a phone number without storing it in clear.
 * - `encrypt` / `decrypt` keep the number recoverable for follow-up messages only.
 */
@Injectable()
export class CryptoService {
  private readonly key: Buffer;
  private readonly hashSecret: string;

  constructor(config: AppConfigService) {
    this.key = Buffer.from(config.get('ENCRYPTION_KEY'), 'base64');
    this.hashSecret = config.get('HASH_SECRET');
  }

  hash(value: string): string {
    return createHmac('sha256', this.hashSecret).update(value).digest('hex');
  }

  /** Returns `iv.tag.ciphertext`, each part base64url-encoded. */
  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv, { authTagLength: TAG_BYTES });
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64url')).join('.');
  }

  decrypt(payload: string): string {
    const [iv, tag, ciphertext] = payload.split('.').map((part) => Buffer.from(part, 'base64url'));
    if (!iv || !tag || !ciphertext) throw new Error('Malformed encrypted payload');

    const decipher = createDecipheriv(ALGORITHM, this.key, iv, { authTagLength: TAG_BYTES });
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }

  /** Constant-time string comparison for secrets. */
  safeEqual(a: string, b: string): boolean {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && timingSafeEqual(left, right);
  }
}
