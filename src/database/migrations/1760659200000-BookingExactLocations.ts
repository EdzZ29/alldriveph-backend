import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Optional exact pickup and return spots a customer can give within the branch area. */
export class BookingExactLocations1760659200000 implements MigrationInterface {
  name = 'BookingExactLocations1760659200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pickup_address VARCHAR(300)`,
    );
    await queryRunner.query(
      `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS return_address VARCHAR(300)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE bookings DROP COLUMN IF EXISTS return_address`,
    );
    await queryRunner.query(
      `ALTER TABLE bookings DROP COLUMN IF EXISTS pickup_address`,
    );
  }
}
