import { Injectable } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { DataSource, type EntityManager } from 'typeorm';

import { AppError, notFound } from '../../common/errors';
import { read, write, type Operations } from '../../common/operations';
import { paginate } from '../../common/pagination';
import { idArg, validateArgs } from '../../common/validation';
import {
  ChatConversation,
  ChatMessage,
  type ChatSender,
} from '../../entities/chat.entity';
import { Faq } from '../../entities/content.entity';
import { HANDOFF_TEXTS, botReply } from './chat.bot';
import { LiveHub, type LiveEvent } from '../../common/live.hub';
import {
  ChatAccessArgs,
  ChatListArgs,
  ChatReplyArgs,
  ChatSendArgs,
  ChatStartArgs,
  ChatStatusArgs,
} from './chat.inputs';
import { chatConversationView, chatMessageView } from './chat.views';

const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

const preview = (body: string) =>
  body.replace(/\s+/g, ' ').trim().slice(0, 200);

/** FAQs change rarely; the bot reads them at most once a minute. */
const FAQ_TTL_MS = 60_000;

@Injectable()
export class ChatOperations {
  private faqCache?: { at: number; faqs: Faq[] };

  constructor(
    private readonly dataSource: DataSource,
    private readonly hub: LiveHub,
  ) {}

  readonly operations: Operations = {
    // ---------- the visitor's chat bubble ----------

    /** Opens a conversation with the visitor's first message. Returns the id and its secret. */
    chat_start: write(async (ctx, args) => {
      await ctx.rateLimit('10/hour', 'chat_start');
      const a = await validateArgs(ChatStartArgs, args);
      const token = randomBytes(24).toString('base64url');
      const conversation = await this.dataSource.manager.save(
        this.dataSource.manager.create(ChatConversation, {
          token_hash: hashToken(token),
          lang: a.lang ?? 'en',
          page: a.page?.slice(0, 300) || null,
          last_message_at: new Date(),
        }),
      );
      const messages = await this.visitorSays(conversation, a.message);
      return { id: conversation.id, token, messages };
    }),

    chat_send: write(async (ctx, args) => {
      await ctx.rateLimit('120/hour', 'chat_send');
      const a = await validateArgs(ChatSendArgs, args);
      const conversation = await this.visitorConversation(a);
      return { messages: await this.visitorSays(conversation, a.message) };
    }),

    /** Everything in the visitor's conversation, to catch up after reconnecting. */
    chat_messages: read(async (_ctx, args) => {
      const a = await validateArgs(ChatAccessArgs, args);
      const conversation = await this.visitorConversation(a);
      return {
        status: conversation.status,
        messages: (await this.messagesOf(conversation.id)).map(chatMessageView),
      };
    }),

    // ---------- the staff inbox ----------

    /** Staff only. Conversations with the newest message first. */
    chats: read(async (ctx, args) => {
      await ctx.requireStaff();
      const a = await validateArgs(ChatListArgs, args);
      const query = this.dataSource
        .createQueryBuilder(ChatConversation, 'c')
        .orderBy('c.last_message_at', 'DESC');
      if (a.status !== 'all')
        query.where('c.status = :status', { status: a.status });
      return paginate(
        query,
        a.page ?? 1,
        a.page_size ?? 50,
        chatConversationView,
      );
    }),

    /** Staff only. How many open conversations have messages nobody has read yet. */
    chat_unread: read(async (ctx) => {
      await ctx.requireStaff();
      const conversations = await this.dataSource
        .createQueryBuilder(ChatConversation, 'c')
        .where("c.status = 'open' AND c.staff_unread > 0")
        .getCount();
      return { conversations };
    }),

    /** Staff only. One conversation with its messages; opening it marks it read. */
    chat: read(async (ctx, args) => {
      await ctx.requireStaff();
      const id = idArg(args);
      const conversation = await this.find(id);
      if (conversation.staff_unread) {
        conversation.staff_unread = 0;
        await this.dataSource.manager.update(
          ChatConversation,
          { id },
          { staff_unread: 0 },
        );
        this.hub.publish({
          type: 'conversation',
          conversation: chatConversationView(conversation),
        });
      }
      return {
        conversation: chatConversationView(conversation),
        messages: (await this.messagesOf(id)).map(chatMessageView),
      };
    }),

    /** Staff only. A team member's reply, shown to the visitor at once. */
    chat_reply: write(async (ctx, args) => {
      const user = await ctx.requireStaff();
      const a = await validateArgs(ChatReplyArgs, args);
      const conversation = await this.find(a.id);
      const events: LiveEvent[] = [];
      const message = await this.dataSource.transaction((manager) =>
        this.add(
          manager,
          events,
          conversation,
          'staff',
          a.message,
          user.full_name,
        ),
      );
      events.forEach((event) => this.hub.publish(event));
      return chatMessageView(message);
    }),

    /** Staff only. Closes or reopens a conversation. */
    update_chat: write(async (ctx, args) => {
      await ctx.requireStaff();
      const a = await validateArgs(ChatStatusArgs, args);
      const conversation = await this.find(a.id);
      conversation.status = a.status;
      await this.dataSource.manager.update(
        ChatConversation,
        { id: a.id },
        { status: a.status },
      );
      const view = chatConversationView(conversation);
      this.hub.publish({ type: 'conversation', conversation: view });
      return view;
    }),
  };

  /** The visitor's conversation, if the id and secret match. */
  async visitorConversation(access: {
    id: string;
    token: string;
  }): Promise<ChatConversation> {
    const conversation = await this.dataSource.manager.findOne(
      ChatConversation,
      { where: { id: access.id } },
    );
    const given = Buffer.from(hashToken(access.token));
    if (
      !conversation ||
      !timingSafeEqual(given, Buffer.from(conversation.token_hash))
    ) {
      throw new AppError(404, 'Chat not found');
    }
    return conversation;
  }

  /** Lets RequestContext-free callers (the live stream) check a visitor's access. */
  async canWatch(id: string, token: string): Promise<boolean> {
    try {
      await this.visitorConversation({ id, token });
      return true;
    } catch {
      return false;
    }
  }

  private async find(id: string) {
    const conversation = await this.dataSource.manager.findOne(
      ChatConversation,
      { where: { id } },
    );
    if (!conversation) throw notFound('Chat');
    return conversation;
  }

  private messagesOf(conversationId: string) {
    return this.dataSource.manager.find(ChatMessage, {
      where: { conversation_id: conversationId },
      order: { created_at: 'ASC' },
      take: 500,
    });
  }

  /** Stores the visitor's message and the bot's answer (if any); returns both. */
  private async visitorSays(conversation: ChatConversation, body: string) {
    const faqs = await this.faqs();
    const recent = await this.dataSource.manager.find(ChatMessage, {
      where: { conversation_id: conversation.id },
      order: { created_at: 'DESC' },
      take: 30,
    });
    const reply = botReply(body, conversation.lang, faqs, {
      lastStaffAt: recent.find((m) => m.sender === 'staff')?.created_at ?? null,
      lastHandoffAt:
        recent.find((m) => m.sender === 'bot' && HANDOFF_TEXTS.has(m.body))
          ?.created_at ?? null,
    });
    const events: LiveEvent[] = [];
    const saved = await this.dataSource.transaction(async (manager) => {
      const rows = [
        await this.add(manager, events, conversation, 'visitor', body),
      ];
      if (reply)
        rows.push(
          await this.add(manager, events, conversation, 'bot', reply.body),
        );
      return rows;
    });
    events.forEach((event) => this.hub.publish(event));
    return saved.map(chatMessageView);
  }

  /** Saves one message and updates the conversation summary; the live stream events are added
   * to `events` for the caller to send once the transaction has committed. */
  private async add(
    manager: EntityManager,
    events: LiveEvent[],
    conversation: ChatConversation,
    sender: ChatSender,
    body: string,
    author: string | null = null,
  ): Promise<ChatMessage> {
    const message = await manager.save(
      manager.create(ChatMessage, {
        conversation_id: conversation.id,
        sender,
        author,
        body: body.trim(),
      }),
    );
    conversation.last_message = preview(message.body);
    conversation.last_message_at = message.created_at;
    // a visitor writing again reopens a closed chat; a staff reply means it has been read
    if (sender === 'visitor') {
      conversation.status = 'open';
      conversation.staff_unread += 1;
    } else if (sender === 'staff') {
      conversation.status = 'open';
      conversation.staff_unread = 0;
    }
    await manager.update(
      ChatConversation,
      { id: conversation.id },
      {
        last_message: conversation.last_message,
        last_message_at: conversation.last_message_at,
        status: conversation.status,
        staff_unread: conversation.staff_unread,
      },
    );
    events.push(
      {
        type: 'message',
        conversation_id: conversation.id,
        message: chatMessageView(message),
      },
      {
        type: 'conversation',
        conversation: chatConversationView(conversation),
      },
    );
    return message;
  }

  private async faqs(): Promise<Faq[]> {
    if (this.faqCache && Date.now() - this.faqCache.at < FAQ_TTL_MS)
      return this.faqCache.faqs;
    const faqs = await this.dataSource.manager.find(Faq, {
      where: { is_active: true },
    });
    this.faqCache = { at: Date.now(), faqs };
    return faqs;
  }
}
