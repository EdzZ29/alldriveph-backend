import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { Mailer } from '../../common/mailer.service';
import type { Booking } from '../../entities/booking.entity';
import {
  BookingNotification,
  type NotificationEvent,
} from '../../entities/booking-notification.entity';
import { bookingEmail } from './booking-emails';

const NOT_SET_UP =
  'Email is not set up yet. Add SMTP_USER (your Gmail address) and SMTP_PASSWORD (a Gmail app password) to the API .env, then resend.';

/**
 * Tells customers when their booking is confirmed or cancelled, and records each attempt so the
 * admin panel can show whether it reached them. Email today; a text message channel can be added
 * here once an SMS service is chosen (the table already has a `channel` column for it).
 */
@Injectable()
export class BookingNotifier {
  private readonly logger = new Logger(BookingNotifier.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly mailer: Mailer,
  ) {}

  async notify(
    booking: Booking,
    event: NotificationEvent,
  ): Promise<BookingNotification> {
    let status: BookingNotification['status'] = 'sent';
    let error: string | null = null;
    if (!this.mailer.configured) {
      status = 'skipped';
      error = NOT_SET_UP;
    } else {
      try {
        await this.mailer.send(bookingEmail(booking, event));
      } catch (reason) {
        status = 'failed';
        error = (
          reason instanceof Error ? reason.message : String(reason)
        ).slice(0, 500);
        this.logger.warn(
          `Email to ${booking.customer_email} for ${booking.reference} failed: ${error}`,
        );
      }
    }
    const manager = this.dataSource.manager;
    return manager.save(
      manager.create(BookingNotification, {
        booking_id: booking.id,
        channel: 'email',
        event,
        recipient: booking.customer_email,
        status,
        error,
      }),
    );
  }

  history(bookingId: string): Promise<BookingNotification[]> {
    return this.dataSource.manager.find(BookingNotification, {
      where: { booking_id: bookingId },
      order: { created_at: 'DESC' },
      take: 20,
    });
  }
}

export const notificationView = (n: BookingNotification) => ({
  id: n.id,
  channel: n.channel,
  event: n.event,
  recipient: n.recipient,
  status: n.status,
  error: n.error,
  created_at: n.created_at,
});
