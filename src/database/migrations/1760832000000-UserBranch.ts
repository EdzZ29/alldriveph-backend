import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Branch owner accounts: the branch each owner manages (null for admins and staff). */
export class UserBranch1760832000000 implements MigrationInterface {
  name = 'UserBranch1760832000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS branch VARCHAR(30)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS branch`);
  }
}
