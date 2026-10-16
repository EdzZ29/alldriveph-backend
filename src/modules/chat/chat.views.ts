import type { ChatConversation, ChatMessage } from '../../entities/chat.entity';

export const chatMessageView = (m: ChatMessage) => ({
  id: m.id,
  conversation_id: m.conversation_id,
  sender: m.sender,
  author: m.author,
  body: m.body,
  created_at: m.created_at,
});
export type ChatMessageView = ReturnType<typeof chatMessageView>;

/** A conversation as the staff inbox lists it (never the visitor's secret). */
export const chatConversationView = (c: ChatConversation) => ({
  id: c.id,
  status: c.status,
  page: c.page,
  lang: c.lang,
  staff_unread: c.staff_unread,
  last_message: c.last_message,
  last_message_at: c.last_message_at,
  created_at: c.created_at,
});
export type ChatConversationView = ReturnType<typeof chatConversationView>;
