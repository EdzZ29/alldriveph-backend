import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Optional wide photo or banner for each partner, shown above the card. */
export class PartnerPhoto1760745600000 implements MigrationInterface {
  name = 'PartnerPhoto1760745600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE partners ADD COLUMN IF NOT EXISTS image_url VARCHAR(500)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE partners DROP COLUMN IF EXISTS image_url`,
    );
  }
}
