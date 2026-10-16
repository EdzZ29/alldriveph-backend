// Values are lowercase ("sedan", "self_drive"), the same JSON the website uses. Stored as plain
// VARCHAR in the database.

export enum UserRole {
  admin = 'admin',
  staff = 'staff',
  /** a branch owner: sees the dashboard and bookings of their own branch only */
  owner = 'owner',
}

export enum VehicleCategory {
  sedan = 'sedan',
  suv = 'suv',
  mpv = 'mpv',
  pickup = 'pickup',
  van = 'van',
}

export enum Transmission {
  automatic = 'automatic',
  manual = 'manual',
}

export enum FuelType {
  gasoline = 'gasoline',
  diesel = 'diesel',
  hybrid = 'hybrid',
}

export enum ServiceType {
  self_drive = 'self_drive',
  with_driver = 'with_driver',
}

export enum BookingStatus {
  pending = 'pending',
  confirmed = 'confirmed',
  ongoing = 'ongoing',
  completed = 'completed',
  cancelled = 'cancelled',
}

export enum VehicleSort {
  recommended = 'recommended',
  price_asc = 'price_asc',
  price_desc = 'price_desc',
  seats = 'seats',
  display_order = 'display_order',
}

/** Statuses that hold the vehicle and block overlapping bookings. */
export const BLOCKING_STATUSES = [
  BookingStatus.pending,
  BookingStatus.confirmed,
  BookingStatus.ongoing,
];

export const ALLOWED_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  [BookingStatus.pending]: [BookingStatus.confirmed, BookingStatus.cancelled],
  [BookingStatus.confirmed]: [BookingStatus.ongoing, BookingStatus.cancelled],
  [BookingStatus.ongoing]: [BookingStatus.completed],
  [BookingStatus.completed]: [],
  [BookingStatus.cancelled]: [],
};
