import { Logger, NotFoundException } from '@nestjs/common';

import { aMessage, aWorker } from '../../../../test/support/builders.js';
import type { ConversationsService } from '../../conversations/application/conversations.service.js';
import { MessageDirection, MessageKind } from '../../conversations/domain/message.entity.js';
import type { WorkersService } from '../../workers/application/workers.service.js';
import { ConsentStatus } from '../../workers/domain/worker.entity.js';
import { CHAT_MESSAGE_LIMIT, WhatsAppContactsService } from './whatsapp-contacts.service.js';

const lastMessage = {
  body: 'جواب',
  direction: MessageDirection.Outbound,
  kind: MessageKind.Text,
  createdAt: new Date('2026-11-01T10:00:00Z'),
};

function setup() {
  const worker = aWorker({ language: 'hi' });
  const workers = {
    consentCounts: vi.fn().mockResolvedValue({ pending: 1, granted: 2, declined: 1 }),
    countActiveSince: vi.fn().mockResolvedValue(3),
    languageCounts: vi.fn().mockResolvedValue({ ur: 2, hi: 1, unset: 1 }),
    list: vi.fn().mockResolvedValue({ items: [worker], meta: { page: 2, limit: 1, total: 4, totalPages: 4 } }),
    findByPhone: vi.fn().mockResolvedValue(worker),
    findById: vi.fn().mockResolvedValue(worker),
    maskedPhoneOf: vi.fn().mockReturnValue('+91 ••• 3210'),
    phoneOf: vi.fn().mockReturnValue('919876543210'),
  };
  const conversations = {
    stats: vi.fn().mockResolvedValue({ inboundMessages: 7, outboundMessages: 6 }),
    activityOf: vi
      .fn()
      .mockResolvedValue([
        { workerId: 'worker-1', conversationCount: 2, messageCount: 13, inboundCount: 7, urgentCount: 1, lastMessage },
      ]),
    messagesOfWorker: vi.fn().mockResolvedValue([aMessage()]),
  };
  const service = new WhatsAppContactsService(
    workers as unknown as WorkersService,
    conversations as unknown as ConversationsService,
  );
  return { worker, workers, conversations, service };
}

const contact = {
  workerId: 'worker-1',
  maskedPhone: '+91 ••• 3210',
  language: 'hi',
  consentStatus: ConsentStatus.Granted,
  firstContactAt: expect.any(Date),
  lastActiveAt: expect.any(Date),
  conversationCount: 2,
  messageCount: 13,
  inboundCount: 7,
  urgentCount: 1,
  lastMessage,
};

describe('WhatsAppContactsService', () => {
  it('summarises numbers, consent, languages and messages', async () => {
    const { workers, service } = setup();
    const now = new Date('2026-11-08T00:00:00Z');

    await expect(service.summary(7, now)).resolves.toEqual({
      periodDays: 7,
      numbers: 4,
      activeSince: 3,
      consent: { pending: 1, granted: 2, declined: 1 },
      languages: { ur: 2, hi: 1, unset: 1 },
      inboundMessages: 7,
      outboundMessages: 6,
    });
    expect(workers.countActiveSince).toHaveBeenCalledWith(new Date('2026-11-01T00:00:00Z'));
  });

  it('lists masked numbers with their activity', async () => {
    const { workers, service } = setup();

    await expect(service.list(2, 1)).resolves.toEqual({
      items: [contact],
      meta: { page: 2, limit: 1, total: 4, totalPages: 4 },
    });
    expect(workers.list).toHaveBeenCalledWith(2, 1);
  });

  it('shows zero activity for a number with nothing stored', async () => {
    const { conversations, service } = setup();
    conversations.activityOf.mockResolvedValue([]);

    const { items } = await service.list(1, 20);
    expect(items[0]).toMatchObject({ conversationCount: 0, messageCount: 0, urgentCount: 0, lastMessage: null });
  });

  it('finds one exact number, normalising what the admin typed', async () => {
    const { workers, service } = setup();

    await expect(service.list(1, 20, '+91 98765-43210')).resolves.toMatchObject({
      items: [contact],
      meta: { total: 1 },
    });
    expect(workers.findByPhone).toHaveBeenCalledWith('919876543210');

    workers.findByPhone.mockResolvedValue(null);
    await expect(service.list(1, 20, '+971 50 000 0000')).resolves.toMatchObject({ items: [], meta: { total: 0 } });
  });

  it("returns one number's chat", async () => {
    const { conversations, service } = setup();

    await expect(service.chat('worker-1')).resolves.toEqual({ contact, messages: [expect.any(Object)] });
    expect(conversations.messagesOfWorker).toHaveBeenCalledWith('worker-1', CHAT_MESSAGE_LIMIT);
  });

  it('reveals the full number and logs that it did', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { service } = setup();

    await expect(service.reveal('worker-1')).resolves.toEqual({ phone: '+91 9876543210' });
    expect(warn).toHaveBeenCalledWith('An admin revealed the WhatsApp number of worker worker-1');
  });

  it('answers not found for an unknown worker', async () => {
    const { workers, service } = setup();
    workers.findById.mockResolvedValue(null);

    await expect(service.chat('missing')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.reveal('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
