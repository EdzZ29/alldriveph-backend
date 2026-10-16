import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Website chat: visitor conversations and their messages (visitor, auto-reply bot, staff). */
export class Chat1760918400000 implements MigrationInterface {
  name = 'Chat1760918400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS chat_conversations (
        id UUID PRIMARY KEY,
        token_hash VARCHAR(64) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'open',
        page VARCHAR(300),
        lang VARCHAR(10) NOT NULL DEFAULT 'en',
        staff_unread INT NOT NULL DEFAULT 0,
        last_message_at TIMESTAMPTZ NOT NULL,
        last_message VARCHAR(200) NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS ix_chat_conversations_status_last ON chat_conversations (status, last_message_at)`,
    );
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id UUID PRIMARY KEY,
        conversation_id UUID NOT NULL,
        sender VARCHAR(10) NOT NULL,
        author VARCHAR(120),
        body TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT fk_chat_messages_conversation_id FOREIGN KEY (conversation_id)
          REFERENCES chat_conversations (id) ON DELETE CASCADE
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS ix_chat_messages_conversation_created ON chat_messages (conversation_id, created_at)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS chat_messages`);
    await queryRunner.query(`DROP TABLE IF EXISTS chat_conversations`);
  }
}
