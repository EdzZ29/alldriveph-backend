import { Column, Entity, Index, JoinColumn, OneToOne } from 'typeorm';

import { Timestamped, numeric } from './base';
import { Booking } from './booking.entity';

export type CommissionStatus = 'unpaid' | 'paid';

/**
 * What a branch owner owes Alldrive for one completed booking: a share (10% by default) of the
 * booking total. Created when the booking is completed; an admin records the owner's payment.
 */
@Entity('commissions')
@Index('ix_commissions_branch_status', ['branch', 'status'])
export class Commission extends Timestamped {
  @Index('ix_commissions_booking', { unique: true })
  @Column('uuid')
  booking_id: string;

  /** the branch the booking was picked up at, which owes the commission */
  @Column({ type: 'varchar', length: 30 })
  branch: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: numeric })
  booking_total: number;

  /** the rate when it was earned, e.g. 0.1; later rate changes leave it as it was */
  @Column({ type: 'numeric', precision: 5, scale: 4, transformer: numeric })
  rate: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: numeric })
  amount: number;

  @Column({ type: 'varchar', length: 10, default: 'unpaid' })
  status: CommissionStatus = 'unpaid';

  @Column({ type: 'timestamptz', nullable: true })
  paid_at: Date | null = null;

  /** the admin who recorded the payment */
  @Column({ type: 'varchar', length: 120, nullable: true })
  paid_by: string | null = null;

  /** how it was paid, e.g. "GCash ref 1234 5678" */
  @Column({ type: 'varchar', length: 300, nullable: true })
  payment_note: string | null = null;

  @OneToOne(() => Booking, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'booking_id',
    foreignKeyConstraintName: 'fk_commissions_booking_id',
  })
  booking: Booking;
}
