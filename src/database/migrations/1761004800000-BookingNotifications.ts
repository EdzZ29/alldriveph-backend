import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Automatic customer messages (email now, SMS later) when a booking is confirmed or cancelled. */
export class BookingNotifications1761004800000 implements MigrationInterface {
  name = 'BookingNotifications1761004800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS booking_notifications (
        id UUID PRIMARY KEY,
        booking_id UUID NOT NULL,
        channel VARCHAR(10) NOT NULL,
        event VARCHAR(20) NOT NULL,
        recipient VARCHAR(255) NOT NULL,
        status VARCHAR(10) NOT NULL,
        error VARCHAR(500),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT fk_booking_notifications_booking_id FOREIGN KEY (booking_id)
          REFERENCES bookings (id) ON DELETE CASCADE
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS ix_booking_notifications_booking ON booking_notifications (booking_id, created_at)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS booking_notifications`);
  }
}
