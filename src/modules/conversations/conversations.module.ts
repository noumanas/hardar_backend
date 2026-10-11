import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ConversationsService } from './application/conversations.service.js';
import { Conversation } from './domain/conversation.entity.js';
import { ConversationRepository } from './domain/conversation.repository.js';
import { Message } from './domain/message.entity.js';
import { TypeOrmConversationRepository } from './infrastructure/typeorm-conversation.repository.js';

@Module({
  imports: [TypeOrmModule.forFeature([Conversation, Message])],
  providers: [ConversationsService, { provide: ConversationRepository, useClass: TypeOrmConversationRepository }],
  exports: [ConversationsService],
})
export class ConversationsModule {}
