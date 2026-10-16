import { Column, CreateDateColumn, Entity, Index } from 'typeorm';

import { Identified } from './base';

/** email today; sms is reserved for text messages once an SMS service is set up */
export type NotificationChannel = 'email' | 'sms';
export type NotificationEvent = 'confirmed' | 'cancelled';
/** skipped: the channel is not set up yet (e.g. no Gmail app password) */
export type NotificationStatus = 'sent' | 'failed' | 'skipped';

/** One automatic message to a customer about their booking, and how it went. */
@Entity('booking_notifications')
@Index('ix_booking_notifications_booking', ['booking_id', 'created_at'])
export class BookingNotification extends Identified {
  @Column('uuid')
  booking_id: string;

  @Column({ type: 'varchar', length: 10 })
  channel: NotificationChannel;

  @Column({ type: 'varchar', length: 20 })
  event: NotificationEvent;

  /** the email address or phone number it went to */
  @Column({ type: 'varchar', length: 255 })
  recipient: string;

  @Column({ type: 'varchar', length: 10 })
  status: NotificationStatus;

  /** why it failed or was skipped */
  @Column({ type: 'varchar', length: 500, nullable: true })
  error: string | null = null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
