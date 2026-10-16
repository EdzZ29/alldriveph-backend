import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';

import { LOCATION_BRANCH, branchLocations } from '../../common/constants';
import { BookingStatus } from '../../common/enums';
import { AppError, notFound, unprocessable } from '../../common/errors';
import { LiveHub, type BookingNotice } from '../../common/live.hub';
import { read, write, type Operations } from '../../common/operations';
import { paginate } from '../../common/pagination';
import {
  idAndInput,
  idArg,
  inputArg,
  validateArgs,
} from '../../common/validation';
import { bookingAdmin, bookingPublic, bookingRow } from '../../common/views';
import { settings } from '../../config/settings';
import { Booking } from '../../entities/booking.entity';
import type { NotificationEvent } from '../../entities/booking-notification.entity';
import { CommissionOperations } from '../commissions/commissions.operations';
import { BookingNotifier, notificationView } from './booking-notifier';
import { BookingService } from './booking.service';
import {
  BookingInput,
  BookingListArgs,
  BookingLookup,
  BookingUpdateInput,
  QuoteInput,
} from './bookings.inputs';

/** What admin notifications and live lists need to know about a booking. */
function notice(
  booking: Booking,
  change: BookingNotice['change'],
): BookingNotice {
  return {
    id: booking.id,
    reference: booking.reference,
    status: booking.status,
    customer_name: booking.customer_name,
    vehicle_name: booking.vehicle.name,
    pickup_at: booking.pickup_at,
    branch: LOCATION_BRANCH[booking.pickup_location] ?? null,
    change,
  };
}

/** Status changes the customer is told about. */
const CUSTOMER_EVENTS: Partial<Record<BookingStatus, NotificationEvent>> = {
  [BookingStatus.confirmed]: 'confirmed',
  [BookingStatus.cancelled]: 'cancelled',
};

@Injectable()
export class BookingOperations {
  private readonly logger = new Logger(BookingOperations.name);

  constructor(
    private readonly service: BookingService,
    private readonly hub: LiveHub,
    private readonly notifier: BookingNotifier,
    private readonly commissions: CommissionOperations,
    @InjectRepository(Booking) private readonly repo: Repository<Booking>,
  ) {}

  readonly operations: Operations = {
    /** Live price breakdown and availability for a trip. */
    quote: read(async (_ctx, args) =>
      this.service.quote(await validateArgs(QuoteInput, args)),
    ),

    /** A customer's booking, found by its reference and email. */
    track_booking: read(async (ctx, args) => {
      await ctx.rateLimit('30/hour', 'track_booking');
      const lookup = await validateArgs(BookingLookup, args);
      const booking = await this.repo.findOne({
        where: {
          reference: lookup.reference.trim().toUpperCase(),
          customer_email: lookup.email.toLowerCase(),
        },
      });
      if (!booking)
        throw new AppError(404, 'No booking matches that reference and email');
      return bookingPublic(booking);
    }),

    /** Staff only. Newest first; q searches reference and customer. */
    bookings: read(async (ctx, args) => {
      const { branch } = await ctx.requireBookingViewer();
      const a = await validateArgs(BookingListArgs, args);
      const query = this.repo
        .createQueryBuilder('booking')
        .leftJoinAndSelect('booking.vehicle', 'vehicle')
        .orderBy('booking.created_at', 'DESC');
      const only = branch ?? a.branch;
      if (only)
        query.andWhere('booking.pickup_location IN (:...pickupPoints)', {
          pickupPoints: branchLocations(only),
        });
      if (a.status)
        query.andWhere('booking.status = :status', { status: a.status });
      const term = a.q?.trim().slice(0, 80);
      if (term) {
        query.andWhere(
          new Brackets((where) =>
            where
              .where('booking.reference ILIKE :term')
              .orWhere('booking.customer_name ILIKE :term')
              .orWhere('booking.customer_email ILIKE :term')
              .orWhere('booking.customer_phone ILIKE :term'),
          ),
          { term: `%${term}%` },
        );
      }
      return paginate(query, a.page ?? 1, a.page_size ?? 20, bookingRow);
    }),

    /** Staff, or the owner of the branch it was booked at. Null if not found. */
    booking: read(async (ctx, args) => {
      const { branch } = await ctx.requireBookingViewer();
      const row = await this.repo.findOne({ where: { id: idArg(args) } });
      if (!row || (branch && LOCATION_BRANCH[row.pickup_location] !== branch))
        return null;
      const sent = await this.notifier.history(row.id);
      return {
        ...bookingAdmin(row),
        notifications: sent.map(notificationView),
      };
    }),

    create_booking: write(async (ctx, args) => {
      await ctx.rateLimit(settings.rateLimitPublicWrite, 'create_booking');
      const input = await inputArg(args, BookingInput);
      const booking = await this.service.create(input);
      this.hub.publish({
        type: 'booking',
        booking: notice(booking, 'created'),
      });
      return bookingPublic(booking);
    }),

    /** Staff, or the owner of the branch it was booked at. Moves a booking along its workflow. */
    update_booking: write(async (ctx, args) => {
      const { branch } = await ctx.requireBranchManager();
      const { id, input } = await idAndInput(args, BookingUpdateInput);
      await this.ownBooking(id, branch);
      const { booking, previousStatus } = await this.service.update(id, input);
      this.hub.publish({
        type: 'booking',
        booking: notice(booking, 'updated'),
      });
      // a returned car earns Alldrive its commission from the branch
      if (
        booking.status === BookingStatus.completed &&
        previousStatus !== booking.status
      )
        await this.commissions.recordFor(booking);
      // tell the customer in the background, so the admin panel answers at once; the live stream
      // refreshes the booking window when the email has gone out (or failed)
      const event = CUSTOMER_EVENTS[booking.status];
      if (event && booking.status !== previousStatus) {
        void this.notifier
          .notify(booking, event)
          .then(() =>
            this.hub.publish({
              type: 'booking',
              booking: notice(booking, 'updated'),
            }),
          )
          .catch((error: unknown) =>
            this.logger.error(
              `Customer notice for ${booking.reference} failed`,
              String(error),
            ),
          );
      }
      return bookingAdmin(booking);
    }),

    /** Staff or the branch owner. Sends the confirmed or cancelled email again, e.g. after setting up Gmail. */
    resend_booking_email: write(async (ctx, args) => {
      const { branch } = await ctx.requireBranchManager();
      const booking = await this.ownBooking(idArg(args), branch);
      const event = CUSTOMER_EVENTS[booking.status];
      if (!event)
        throw unprocessable(
          'Only confirmed or cancelled bookings send an email',
        );
      const sent = await this.notifier.notify(booking, event);
      this.hub.publish({
        type: 'booking',
        booking: notice(booking, 'updated'),
      });
      return notificationView(sent);
    }),
  };

  /** A booking the caller may change: any for staff, their branch's for a branch owner. */
  private async ownBooking(
    id: string,
    branch: string | null,
  ): Promise<Booking> {
    const booking = await this.repo.findOne({ where: { id } });
    if (
      !booking ||
      (branch && LOCATION_BRANCH[booking.pickup_location] !== branch)
    )
      throw notFound('Booking');
    return booking;
  }
}
