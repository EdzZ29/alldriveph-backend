import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  UpdateDateColumn,
} from 'typeorm';

import { UserRole } from '../common/enums';
import { Identified } from './base';

@Entity('users')
export class User extends Identified {
  @Index('ix_users_email', { unique: true })
  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 120 })
  full_name: string;

  // never sent to clients (see userView)
  @Column({ type: 'varchar', length: 255 })
  hashed_password: string;

  @Column({ type: 'varchar', length: 20 })
  role: UserRole = UserRole.staff;

  /** The branch a branch owner manages (a BRANCHES code); null for admins and staff. */
  @Column({ type: 'varchar', length: 30, nullable: true })
  branch: string | null = null;

  @Column('boolean')
  is_active: boolean = true;

  @Column({ type: 'timestamptz', nullable: true })
  last_login_at: Date | null = null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
