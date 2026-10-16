import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Branch commissions: 10% of every completed booking, owed by the branch owner to Alldrive.
 * Bookings completed before this migration get their commission too.
 */
export class Commissions1761091200000 implements MigrationInterface {
  name = 'Commissions1761091200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS commissions (
        id UUID PRIMARY KEY,
        booking_id UUID NOT NULL,
        branch VARCHAR(30) NOT NULL,
        booking_total NUMERIC(12,2) NOT NULL,
        rate NUMERIC(5,4) NOT NULL,
        amount NUMERIC(12,2) NOT NULL,
        status VARCHAR(10) NOT NULL DEFAULT 'unpaid',
        paid_at TIMESTAMPTZ,
        paid_by VARCHAR(120),
        payment_note VARCHAR(300),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT fk_commissions_booking_id FOREIGN KEY (booking_id)
          REFERENCES bookings (id) ON DELETE CASCADE
      )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ix_commissions_booking ON commissions (booking_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS ix_commissions_branch_status ON commissions (branch, status)`,
    );
    // commissions for bookings already completed; the branch is the one of the pickup point
    await queryRunner.query(`
      INSERT INTO commissions (id, booking_id, branch, booking_total, rate, amount, created_at, updated_at)
      SELECT gen_random_uuid(), b.id,
             CASE
               WHEN b.pickup_location LIKE 'butuan%' THEN 'butuan'
               WHEN b.pickup_location IN ('cagayan-de-oro-city', 'laguindingan-airport') THEN 'cagayan-de-oro'
               WHEN b.pickup_location LIKE 'davao%' THEN 'davao'
               ELSE 'butuan'
             END,
             b.total_amount, 0.1, round(b.total_amount * 0.1, 2), b.updated_at, b.updated_at
        FROM bookings b
       WHERE b.status = 'completed'
         AND NOT EXISTS (SELECT 1 FROM commissions c WHERE c.booking_id = b.id)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS commissions`);
  }
}
