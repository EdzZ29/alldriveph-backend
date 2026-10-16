import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';

import { Identified, Timestamped } from './base';

export type ChatStatus = 'open' | 'closed';
export type ChatSender = 'visitor' | 'bot' | 'staff';

/** A website visitor's chat with the team, from the chat bubble on every page. */
@Entity('chat_conversations')
@Index('ix_chat_conversations_status_last', ['status', 'last_message_at'])
export class ChatConversation extends Timestamped {
  /** SHA-256 of the secret the visitor's browser keeps; the secret itself is never stored. */
  @Column({ type: 'varchar', length: 64 })
  token_hash: string;

  @Column({ type: 'varchar', length: 20, default: 'open' })
  status: ChatStatus = 'open';

  /** The page the visitor started on, e.g. /fleet/toyota-vios. */
  @Column({ type: 'varchar', length: 300, nullable: true })
  page: string | null = null;

  /** The site language the visitor uses (en, fil, ko...). */
  @Column({ type: 'varchar', length: 10, default: 'en' })
  lang: string = 'en';

  /** Visitor messages the team has not opened yet. */
  @Column('int', { default: 0 })
  staff_unread: number = 0;

  @Column('timestamptz')
  last_message_at: Date;

  /** A short preview for the inbox list. */
  @Column({ type: 'varchar', length: 200, default: '' })
  last_message: string = '';
}

@Entity('chat_messages')
@Index('ix_chat_messages_conversation_created', [
  'conversation_id',
  'created_at',
])
export class ChatMessage extends Identified {
  @Column('uuid')
  conversation_id: string;

  @Column({ type: 'varchar', length: 10 })
  sender: ChatSender;

  /** The team member's name on staff replies. */
  @Column({ type: 'varchar', length: 120, nullable: true })
  author: string | null = null;

  @Column('text')
  body: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @ManyToOne(() => ChatConversation, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'conversation_id',
    foreignKeyConstraintName: 'fk_chat_messages_conversation_id',
  })
  conversation?: ChatConversation;
}
