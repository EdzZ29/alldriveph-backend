import {
  EXTRAS_BY_CODE,
  LONG_RENTAL_DAYS,
  LONG_RENTAL_DISCOUNT,
  MAX_RENTAL_DAYS,
  MIN_LEAD_HOURS,
  MIN_RENTAL_HOURS,
  PLACE_ZONE,
  zoneName,
} from '../../common/constants';
import { ServiceType } from '../../common/enums';
import { unprocessable } from '../../common/errors';
import type { Vehicle } from '../../entities/vehicle.entity';

export interface Trip {
  pickup_at: Date;
  return_at: Date;
  service_type: ServiceType;
  destination_zone: string;
  destination?: string | null;
  extras: string[];
}

export interface QuoteResult {
  days: number;
  daily_rate: number;
  base_amount: number;
  discount_amount: number;
  driver_amount: number;
  extras_amount: number;
  total_amount: number;
  line_items: { label: string; amount: number }[];
}

const HOUR = 3_600_000;

// money is added up in whole centavos so totals never pick up floating point dust
const toCents = (pesos: number) => Math.round(pesos * 100);
const toPesos = (cents: number) => cents / 100;
const DISCOUNT_PERCENT = Math.round(LONG_RENTAL_DISCOUNT * 100);

/** Charge per started 24 hour block, minimum one day. */
export function rentalDays(pickupAt: Date, returnAt: Date): number {
  const hours = (returnAt.getTime() - pickupAt.getTime()) / HOUR;
  return Math.max(1, Math.ceil(hours / 24 - 1e-9));
}

export function validatePeriod(pickupAt: Date, returnAt: Date): void {
  if (pickupAt.getTime() < Date.now() + MIN_LEAD_HOURS * HOUR) {
    throw unprocessable(
      `Pickup must be at least ${MIN_LEAD_HOURS} hours from now`,
    );
  }
  const hours = (returnAt.getTime() - pickupAt.getTime()) / HOUR;
  if (hours < MIN_RENTAL_HOURS) {
    throw unprocessable(`Minimum rental period is ${MIN_RENTAL_HOURS} hours`);
  }
  if (hours > MAX_RENTAL_DAYS * 24) {
    throw unprocessable(
      `Maximum rental period is ${MAX_RENTAL_DAYS} days. Contact us for long term leases.`,
    );
  }
}

/** Daily rate for a destination zone, falling back to the base daily rate. */
export function zoneRate(vehicle: Vehicle, zone: string): number {
  const rate = vehicle.zone_rates?.[zone];
  return rate ? Number(rate) : Number(vehicle.daily_rate);
}

/** The server, not the client, decides which zone a destination is priced in. */
export function resolveZone(vehicle: Vehicle, trip: Trip): void {
  if (trip.destination) {
    trip.destination_zone = PLACE_ZONE[vehicle.branch][trip.destination];
  }
}

export function calculateQuote(vehicle: Vehicle, trip: Trip): QuoteResult {
  resolveZone(vehicle, trip);
  const days = rentalDays(trip.pickup_at, trip.return_at);
  const plural = days > 1 ? 's' : '';
  const rate = zoneRate(vehicle, trip.destination_zone);
  const base = toCents(rate) * days;
  const place =
    trip.destination || zoneName(vehicle.branch, trip.destination_zone);
  const items = [
    {
      label: `${vehicle.name} x ${days} day${plural} (${place})`,
      amount: base,
    },
  ];

  let discount = 0;
  if (days >= LONG_RENTAL_DAYS) {
    // round half up to the centavo
    discount = Math.floor((base * DISCOUNT_PERCENT + 50) / 100);
    items.push({
      label: `Long rental discount (${DISCOUNT_PERCENT}%)`,
      amount: -discount,
    });
  }

  let driver = 0;
  if (trip.service_type === ServiceType.with_driver) {
    driver = toCents(Number(vehicle.driver_rate)) * days;
    items.push({
      label: `Professional driver x ${days} day${plural}`,
      amount: driver,
    });
  }

  let extras = 0;
  for (const code of trip.extras) {
    const extra = EXTRAS_BY_CODE[code];
    if (
      code === 'additional-driver' &&
      trip.service_type === ServiceType.with_driver
    )
      continue;
    const amount = toCents(extra.price) * (extra.per_day ? days : 1);
    extras += amount;
    items.push({ label: extra.name, amount });
  }

  return {
    days,
    daily_rate: rate,
    base_amount: toPesos(base),
    discount_amount: toPesos(discount),
    driver_amount: toPesos(driver),
    extras_amount: toPesos(extras),
    total_amount: toPesos(base - discount + driver + extras),
    line_items: items.map((item) => ({
      label: item.label,
      amount: toPesos(item.amount),
    })),
  };
}
