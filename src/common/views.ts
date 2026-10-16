// What each operation sends back. Pages get exactly the fields they show, and staff only fields
// (plate numbers, internal notes, drafts, timestamps) never leave the server for anyone else.
// Keep in sync with the types in alldriveph-frontend/lib/types.ts.

import type { Booking } from '../entities/booking.entity';
import type {
  BlogPost,
  ContactMessage,
  Faq,
  Partner,
  Service,
} from '../entities/content.entity';
import type { User } from '../entities/user.entity';
import type { Vehicle } from '../entities/vehicle.entity';

function pick<T, K extends keyof T>(row: T, keys: readonly K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const key of keys) out[key] = row[key];
  return out;
}

const VEHICLE_SUMMARY = [
  'id',
  'slug',
  'name',
  'brand',
  'model',
  'year',
  'category',
  'transmission',
  'fuel_type',
  'seats',
  'luggage',
  'color',
  'daily_rate',
  'driver_rate',
  'zone_rates',
  'image_url',
  'branch',
  'is_featured',
] as const satisfies readonly (keyof Vehicle)[];
const VEHICLE_DETAIL = [
  ...VEHICLE_SUMMARY,
  'description',
  'features',
] as const satisfies readonly (keyof Vehicle)[];
const VEHICLE_ADMIN = [
  ...VEHICLE_DETAIL,
  'plate_number',
  'is_active',
  'sort_order',
  'created_at',
  'updated_at',
] as const satisfies readonly (keyof Vehicle)[];

/** List pages: everything except the long description and feature list. */
export const vehicleSummary = (v: Vehicle) => pick(v, VEHICLE_SUMMARY);
/** A car's own page and the booking flow. */
export const vehicleDetail = (v: Vehicle) => pick(v, VEHICLE_DETAIL);
export const vehicleAdmin = (v: Vehicle) => pick(v, VEHICLE_ADMIN);

const BOOKING = [
  'id',
  'reference',
  'status',
  'service_type',
  'customer_name',
  'customer_email',
  'customer_phone',
  'pickup_location',
  'return_location',
  'delivery_address',
  'pickup_address',
  'return_address',
  'destination_zone',
  'destination',
  'pickup_at',
  'return_at',
  'extras',
  'days',
  'daily_rate',
  'base_amount',
  'discount_amount',
  'driver_amount',
  'extras_amount',
  'total_amount',
  'notes',
  'created_at',
] as const satisfies readonly (keyof Booking)[];
const BOOKING_ADMIN = [
  ...BOOKING,
  'license_number',
  'admin_notes',
  'cancelled_at',
  'updated_at',
] as const satisfies readonly (keyof Booking)[];
const BOOKING_ROW = [
  'id',
  'reference',
  'status',
  'service_type',
  'customer_name',
  'customer_email',
  'customer_phone',
  'pickup_location',
  'return_location',
  'pickup_at',
  'return_at',
  'days',
  'total_amount',
  'created_at',
] as const satisfies readonly (keyof Booking)[];

/** What a customer sees after booking or when tracking a booking. */
export const bookingPublic = (b: Booking) => ({
  ...pick(b, BOOKING),
  vehicle: vehicleSummary(b.vehicle),
});
export const bookingAdmin = (b: Booking) => ({
  ...pick(b, BOOKING_ADMIN),
  vehicle: vehicleSummary(b.vehicle),
});
/** A row of the admin bookings table. */
export const bookingRow = (b: Booking) => ({
  ...pick(b, BOOKING_ROW),
  vehicle: { name: b.vehicle.name },
});
/** An upcoming pickup on the dashboard. */
export const bookingUpcoming = (b: Booking) => ({
  ...pick(b, ['id', 'customer_name', 'pickup_at', 'status'] as const),
  vehicle: { name: b.vehicle.name },
});

const POST_SUMMARY = [
  'id',
  'slug',
  'title',
  'excerpt',
  'cover_image_url',
  'author_name',
  'tags',
  'reading_minutes',
  'published_at',
] as const satisfies readonly (keyof BlogPost)[];
const POST_DETAIL = [
  ...POST_SUMMARY,
  'content',
] as const satisfies readonly (keyof BlogPost)[];
const POST_ADMIN = [
  ...POST_DETAIL,
  'is_published',
  'created_at',
  'updated_at',
] as const satisfies readonly (keyof BlogPost)[];

export const postSummary = (p: BlogPost) => pick(p, POST_SUMMARY);
export const postDetail = (p: BlogPost) => pick(p, POST_DETAIL);
export const postAdmin = (p: BlogPost) => pick(p, POST_ADMIN);

export const serviceView = (s: Service) =>
  pick(s, [
    'id',
    'slug',
    'title',
    'summary',
    'description',
    'icon',
    'price_from',
    'highlights',
    'sort_order',
    'is_active',
  ] as const);

export const partnerView = (p: Partner) =>
  pick(p, [
    'id',
    'name',
    'category',
    'description',
    'logo_url',
    'image_url',
    'website_url',
    'sort_order',
    'is_active',
  ] as const);

export const faqView = (f: Faq) =>
  pick(f, [
    'id',
    'question',
    'answer',
    'category',
    'sort_order',
    'is_active',
  ] as const);

export const messageView = (m: ContactMessage) =>
  pick(m, [
    'id',
    'name',
    'email',
    'phone',
    'subject',
    'message',
    'is_read',
    'created_at',
  ] as const);

/** Never includes the password hash. */
export const userView = (u: User) =>
  pick(u, [
    'id',
    'email',
    'full_name',
    'role',
    'branch',
    'is_active',
    'last_login_at',
    'created_at',
  ] as const);
