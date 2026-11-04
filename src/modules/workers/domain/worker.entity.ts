import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '../../../database/base.entity.js';
import type { Language } from './language.js';

export enum ConsentStatus {
  /** Greeting and consent request sent; no answer yet. */
  Pending = 'pending',
  Granted = 'granted',
  Declined = 'declined',
}

/**
 * A worker who has messaged Haqdar. No name is stored (PRD: "no names required");
 * the phone number is kept only as an HMAC for lookup and an encrypted copy for follow-ups.
 */
@Entity('workers')
export class Worker extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  phoneHash: string;

  @Column({ type: 'text' })
  phoneEncrypted: string;

  /** Chosen from the language menu on first contact; `null` until the worker picks one. */
  @Column({ type: 'varchar', length: 8, nullable: true })
  language: Language | null;

  @Column({ type: 'enum', enum: ConsentStatus, enumName: 'consent_status', default: ConsentStatus.Pending })
  consentStatus: ConsentStatus;

  @Column({ type: 'timestamptz', nullable: true })
  consentAt: Date | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  lastActiveAt: Date;

  get hasConsented(): boolean {
    return this.consentStatus === ConsentStatus.Granted;
  }
}
