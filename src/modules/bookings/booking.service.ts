import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';

import {
  BRANCH_NAMES,
  EXTRAS_BY_CODE,
  LOCATION_BRANCH,
  SECURITY_DEPOSIT,
} from '../../common/constants';
import {
  ALLOWED_TRANSITIONS,
  BLOCKING_STATUSES,
  BookingStatus,
  ServiceType,
} from '../../common/enums';
import {
  AppError,
  conflict,
  invalidInput,
  notFound,
  unprocessable,
} from '../../common/errors';
import { bookingReference } from '../../common/utils';
import { Booking } from '../../entities/booking.entity';
import { Vehicle } from '../../entities/vehicle.entity';
import {
  BookingInput,
  BookingUpdateInput,
  QuoteInput,
} from './bookings.inputs';
import {
  calculateQuote,
  validatePeriod,
  type QuoteResult,
  type Trip,
} from './pricing';

/** Live price breakdown and availability for a trip. */
export interface Quote extends QuoteResult {
  vehicle_id: string;
  security_deposit: number;
  available: boolean;
}

/** Normalised trip details with the checks that span several fields. */
function tripFrom(input: QuoteInput): Trip {
  if (input.return_at.getTime() <= input.pickup_at.getTime()) {
    throw invalidInput('Return time must be after pickup time');
  }
  const extras = [...new Set(input.extras ?? [])].sort();
  const unknown = extras.filter((code) => !EXTRAS_BY_CODE[code]);
  if (unknown.length)
    throw invalidInput(`Unknown extras: ${unknown.join(', ')}`, 'extras');
  return {
    pickup_at: input.pickup_at,
    return_at: input.return_at,
    service_type: input.service_type ?? ServiceType.self_drive,
    destination_zone: input.destination_zone ?? 'local',
    destination: input.destination ?? null,
    extras,
  };
}

function checkBookingRules(input: BookingInput, trip: Trip): void {
  if (!input.accept_terms)
    throw invalidInput('You must accept the rental terms');
  if (
    trip.service_type === ServiceType.self_drive &&
    !input.license_number?.trim()
  ) {
    throw invalidInput(
      "A driver's license number is required for self drive rentals",
    );
  }
  if (trip.extras.includes('delivery') && !input.delivery_address?.trim()) {
    throw invalidInput('Please provide a delivery address');
  }
}

function validatePickupBranch(vehicle: Vehicle, pickupLocation: string): void {
  if (LOCATION_BRANCH[pickupLocation] !== vehicle.branch) {
    const branch = BRANCH_NAMES[vehicle.branch] ?? vehicle.branch;
    throw unprocessable(
      `This car is based in our ${branch} branch. Please choose a pickup location in ${branch}.`,
    );
  }
}

const blank = (value?: string | null) => value?.trim() || null;

@Injectable()
export class BookingService {
  constructor(private readonly dataSource: DataSource) {}

  /** True when no pending, confirmed or ongoing booking overlaps the period. */
  async isAvailable(
    manager: EntityManager,
    vehicleId: string,
    pickupAt: Date,
    returnAt: Date,
  ): Promise<boolean> {
    const clash = await manager
      .createQueryBuilder(Booking, 'b')
      .select('1')
      .where('b.vehicle_id = :vehicleId', { vehicleId })
      .andWhere('b.status IN (:...statuses)', { statuses: BLOCKING_STATUSES })
      .andWhere('b.pickup_at < :returnAt AND b.return_at > :pickupAt', {
        pickupAt,
        returnAt,
      })
      .limit(1)
      .getRawOne<Record<string, unknown>>();
    return !clash;
  }

  private async activeVehicle(
    manager: EntityManager,
    id: string,
    lock = false,
  ) {
    const query = manager
      .createQueryBuilder(Vehicle, 'v')
      .where('v.id = :id AND v.is_active = true', { id });
    if (lock) query.setLock('pessimistic_write');
    const vehicle = await query.getOne();
    if (!vehicle) throw notFound('Vehicle');
    return vehicle;
  }

  async quote(input: QuoteInput): Promise<Quote> {
    const trip = tripFrom(input);
    validatePeriod(trip.pickup_at, trip.return_at);
    const manager = this.dataSource.manager;
    const vehicle = await this.activeVehicle(manager, input.vehicle_id);
    validatePickupBranch(vehicle, input.pickup_location);
    const result = calculateQuote(vehicle, trip);
    const available = await this.isAvailable(
      manager,
      vehicle.id,
      trip.pickup_at,
      trip.return_at,
    );
    return {
      vehicle_id: vehicle.id,
      ...result,
      security_deposit: SECURITY_DEPOSIT,
      available,
    };
  }

  async create(input: BookingInput): Promise<Booking> {
    const trip = tripFrom(input);
    checkBookingRules(input, trip);
    validatePeriod(trip.pickup_at, trip.return_at);

    return this.dataSource.transaction(async (manager) => {
      // lock the car so two concurrent requests cannot both pass the availability check
      const vehicle = await this.activeVehicle(manager, input.vehicle_id, true);
      validatePickupBranch(vehicle, input.pickup_location);
      if (
        !(await this.isAvailable(
          manager,
          vehicle.id,
          trip.pickup_at,
          trip.return_at,
        ))
      ) {
        throw conflict(
          'Sorry, this vehicle was just booked for those dates. Please choose other dates or another car.',
        );
      }
      const quote = calculateQuote(vehicle, trip);
      let reference = bookingReference();
      while (await manager.exists(Booking, { where: { reference } })) {
        reference = bookingReference();
      }
      const booking = manager.create(Booking, {
        reference,
        vehicle_id: vehicle.id,
        service_type: trip.service_type,
        customer_name: input.customer_name.trim(),
        customer_email: input.customer_email.toLowerCase(),
        customer_phone: input.customer_phone.trim(),
        license_number: blank(input.license_number),
        pickup_location: input.pickup_location,
        return_location: input.return_location,
        delivery_address: blank(input.delivery_address),
        pickup_address: blank(input.pickup_address),
        return_address: blank(input.return_address),
        destination_zone: trip.destination_zone,
        destination: trip.destination,
        pickup_at: trip.pickup_at,
        return_at: trip.return_at,
        extras: trip.extras,
        days: quote.days,
        daily_rate: quote.daily_rate,
        base_amount: quote.base_amount,
        discount_amount: quote.discount_amount,
        driver_amount: quote.driver_amount,
        extras_amount: quote.extras_amount,
        total_amount: quote.total_amount,
        notes: blank(input.notes),
      });
      await manager.save(booking);
      booking.vehicle = vehicle;
      return booking;
    });
  }

  /** Applies staff changes; also returns the status it had before, so callers know what moved. */
  async update(
    id: string,
    input: BookingUpdateInput,
  ): Promise<{ booking: Booking; previousStatus: BookingStatus }> {
    const previousStatus = await this.dataSource.transaction(
      async (manager) => {
        const booking = await manager
          .createQueryBuilder(Booking, 'b')
          .setLock('pessimistic_write')
          .where('b.id = :id', { id })
          .getOne();
        if (!booking) throw notFound('Booking');
        const changes: Partial<Booking> = {};
        if (input.status && input.status !== booking.status) {
          if (!ALLOWED_TRANSITIONS[booking.status].includes(input.status)) {
            throw new AppError(
              409,
              `Cannot change a ${booking.status} booking to ${input.status}`,
            );
          }
          changes.status = input.status;
          if (input.status === BookingStatus.cancelled)
            changes.cancelled_at = new Date();
        }
        if (input.admin_notes !== undefined && input.admin_notes !== null) {
          changes.admin_notes = input.admin_notes.trim() || null;
        }
        if (Object.keys(changes).length)
          await manager.update(Booking, { id }, changes);
        return booking.status;
      },
    );
    const booking = await this.dataSource.manager.findOneOrFail(Booking, {
      where: { id },
    });
    return { booking, previousStatus };
  }
}
