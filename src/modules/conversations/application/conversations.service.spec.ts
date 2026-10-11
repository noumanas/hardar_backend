import { NotFoundException } from '@nestjs/common';

import { aConversation, aMessage } from '../../../../test/support/builders.js';
import { IssueType } from '../../complaints/domain/issue-type.enum.js';
import type { Conversation } from '../domain/conversation.entity.js';
import type { ConversationRepository } from '../domain/conversation.repository.js';
import { MessageDirection, MessageKind, type Message } from '../domain/message.entity.js';
import { ConversationStatus } from '../domain/conversation-status.js';
import { ConversationsService, SESSION_WINDOW_MS } from './conversations.service.js';

function setup() {
  const repository = {
    findLatestForWorker: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(async (workerId: string) => aConversation({ id: 'new', workerId })),
    save: vi.fn(async (conversation: Conversation) => conversation),
    addMessage: vi.fn(async (message: Partial<Message>) =>
      aMessage({ ...message, createdAt: new Date('2026-10-02T00:00:00Z') }),
    ),
    messageExists: vi.fn(),
    recentMessages: vi.fn(),
    findMessage: vi.fn(),
    saveMessage: vi.fn(async (message: Message) => message),
    listMessages: vi.fn(),
    listSummaries: vi.fn(),
    listFlaggedMessages: vi.fn(),
    stats: vi.fn(),
  } satisfies ConversationRepository;
  return { repository, service: new ConversationsService(repository) };
}

describe('ConversationsService', () => {
  describe('openFor', () => {
    const now = new Date('2026-10-02T12:00:00Z');

    it('continues a conversation active within the last 24 hours', async () => {
      const { repository, service } = setup();
      const recent = aConversation({ lastMessageAt: new Date(now.getTime() - SESSION_WINDOW_MS + 1000) });
      repository.findLatestForWorker.mockResolvedValue(recent);

      await expect(service.openFor('worker-1', now)).resolves.toBe(recent);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('opens a new conversation after 24 hours of silence', async () => {
      const { repository, service } = setup();
      repository.findLatestForWorker.mockResolvedValue(
        aConversation({ lastMessageAt: new Date(now.getTime() - SESSION_WINDOW_MS) }),
      );

      await expect(service.openFor('worker-1', now)).resolves.toMatchObject({ id: 'new' });
    });

    it('opens the first conversation for a new worker', async () => {
      const { repository, service } = setup();
      repository.findLatestForWorker.mockResolvedValue(null);

      await expect(service.openFor('worker-1')).resolves.toMatchObject({ id: 'new', workerId: 'worker-1' });
    });
  });

  it('records inbound and outbound messages and moves the conversation forward', async () => {
    const { repository, service } = setup();
    const conversation = aConversation();

    await service.recordInbound(conversation, { kind: MessageKind.Voice, body: 'transcript', externalId: 'wamid.1' });
    await service.recordOutbound(conversation, { body: 'reply', citations: ['Art. 19'], latencyMs: 900 });

    expect(repository.addMessage).toHaveBeenNthCalledWith(1, {
      conversationId: 'conversation-1',
      direction: MessageDirection.Inbound,
      kind: MessageKind.Voice,
      body: 'transcript',
      externalId: 'wamid.1',
    });
    expect(repository.addMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        direction: MessageDirection.Outbound,
        kind: MessageKind.Text,
        citations: ['Art. 19'],
      }),
    );
    expect(conversation.lastMessageAt).toEqual(new Date('2026-10-02T00:00:00Z'));
  });

  it('tags the issue type only when it changes', async () => {
    const { repository, service } = setup();
    const conversation = aConversation({ issueType: IssueType.UnpaidSalary });

    await service.tagIssue(conversation, IssueType.UnpaidSalary);
    expect(repository.save).not.toHaveBeenCalled();

    await service.tagIssue(conversation, IssueType.PassportHeld);
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({ issueType: IssueType.PassportHeld }));
  });

  it('pages conversation summaries', async () => {
    const { repository, service } = setup();
    repository.listSummaries.mockResolvedValue({ items: [], total: 45 });

    const page = await service.list(3, 20, ConversationStatus.NeedsReview);

    expect(repository.listSummaries).toHaveBeenCalledWith(40, 20, ConversationStatus.NeedsReview);
    expect(page.meta).toMatchObject({ page: 3, limit: 20, total: 45, totalPages: 3 });
  });

  it('lists messages of an existing conversation and 404s otherwise', async () => {
    const { repository, service } = setup();
    repository.findById.mockResolvedValueOnce(aConversation()).mockResolvedValueOnce(null);
    repository.listMessages.mockResolvedValue([aMessage()]);

    await expect(service.messagesOf('conversation-1')).resolves.toHaveLength(1);
    await expect(service.messagesOf('missing')).rejects.toThrow(NotFoundException);
  });

  describe('setReviewed', () => {
    it('stamps the review time, and clears it when reopened', async () => {
      const { repository, service } = setup();
      const conversation = aConversation({ reviewedAt: null });
      repository.findById.mockResolvedValue(conversation);
      const now = new Date('2026-10-08T12:00:00Z');

      await expect(service.setReviewed('conversation-1', true, now)).resolves.toMatchObject({ reviewedAt: now });
      await expect(service.setReviewed('conversation-1', false)).resolves.toMatchObject({ reviewedAt: null });
    });

    it('404s for an unknown conversation', async () => {
      const { repository, service } = setup();
      repository.findById.mockResolvedValue(null);

      await expect(service.setReviewed('missing', true)).rejects.toThrow(NotFoundException);
    });
  });

  it('pages flagged answers', async () => {
    const { repository, service } = setup();
    repository.listFlaggedMessages.mockResolvedValue({ items: [], total: 3 });

    const page = await service.flaggedMessages(1, 2);

    expect(repository.listFlaggedMessages).toHaveBeenCalledWith(0, 2);
    expect(page.meta).toMatchObject({ total: 3, totalPages: 2 });
  });

  describe('flagMessage', () => {
    it('flags an answer with a reason, and clearing the flag clears the reason', async () => {
      const { repository, service } = setup();
      const message = aMessage();
      repository.findMessage.mockResolvedValue(message);

      await expect(service.flagMessage('message-1', true, 'wrong rate')).resolves.toMatchObject({
        flagged: true,
        flagReason: 'wrong rate',
      });
      await expect(service.flagMessage('message-1', false, 'ignored')).resolves.toMatchObject({
        flagged: false,
        flagReason: null,
      });
    });

    it('stores no reason when none is given', async () => {
      const { repository, service } = setup();
      repository.findMessage.mockResolvedValue(aMessage());

      await expect(service.flagMessage('message-1', true)).resolves.toMatchObject({ flagReason: null });
    });

    it('404s for an unknown message', async () => {
      const { repository, service } = setup();
      repository.findMessage.mockResolvedValue(null);

      await expect(service.flagMessage('missing', true)).rejects.toThrow(NotFoundException);
    });
  });

  it('delegates duplicate checks, history and stats to the repository', async () => {
    const { repository, service } = setup();
    repository.messageExists.mockResolvedValue(true);
    repository.recentMessages.mockResolvedValue([]);
    repository.stats.mockResolvedValue({ conversations: 1 });

    await expect(service.hasProcessed('wamid.1')).resolves.toBe(true);
    await service.history('conversation-1', 12);
    await service.stats(new Date(0));

    expect(repository.recentMessages).toHaveBeenCalledWith('conversation-1', 12);
    expect(repository.stats).toHaveBeenCalledWith(new Date(0));
  });
});
