import { ComplaintCase } from '../modules/complaints/domain/complaint-case.entity.js';
import { ContractSummary } from '../modules/contracts/domain/contract-summary.entity.js';
import { Conversation } from '../modules/conversations/domain/conversation.entity.js';
import { Message } from '../modules/conversations/domain/message.entity.js';
import { LawArticle } from '../modules/knowledge/domain/law-article.entity.js';
import { Worker } from '../modules/workers/domain/worker.entity.js';

/** Every persisted entity, listed explicitly (no globbing) so ESM builds and tests load the same set. */
export const ENTITIES = [Worker, Conversation, Message, ContractSummary, ComplaintCase, LawArticle];
