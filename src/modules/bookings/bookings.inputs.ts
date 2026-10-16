import {
  ArrayMaxSize,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

import {
  ALL_PLACES,
  BRANCH_CODES,
  DEFAULT_ZONE,
  LOCATION_CODES,
  ZONE_CODES,
} from '../../common/constants';
import { BookingStatus, ServiceType } from '../../common/enums';
import { IsDateTime, Nullable, Optional } from '../../common/validation';

const PHONE_PATTERN = /^\+?[0-9][0-9\s\-()]{6,20}$/;

/** A trip to price: car, dates, places, service and extras. */
export class QuoteInput {
  @IsUUID()
  vehicle_id: string;

  @IsDateTime()
  pickup_at: Date;

  @IsDateTime()
  return_at: Date;

  @IsIn(LOCATION_CODES, { message: 'Unknown location' })
  pickup_location: string;

  @IsIn(LOCATION_CODES, { message: 'Unknown location' })
  return_location: string;

  @Optional()
  @IsEnum(ServiceType)
  service_type?: ServiceType = ServiceType.self_drive;

  @Optional()
  @IsIn(ZONE_CODES, { message: 'Unknown destination zone' })
  destination_zone?: string = DEFAULT_ZONE;

  /** A specific place, e.g. "Iligan City"; when given it decides the rate zone. */
  @Nullable()
  @MaxLength(120)
  @IsIn(ALL_PLACES, { message: 'Choose a destination from the list' })
  destination?: string | null;

  @Optional()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  extras?: string[] = [];
}

/** A trip plus the customer details needed to book it. */
export class BookingInput extends QuoteInput {
  @IsString()
  @Length(2, 120)
  customer_name: string;

  @IsEmail({}, { message: 'Enter a valid email address' })
  customer_email: string;

  @Matches(PHONE_PATTERN, { message: 'Enter a valid phone number' })
  customer_phone: string;

  @Nullable()
  @IsString()
  @MaxLength(40)
  license_number?: string | null;

  @Nullable()
  @IsString()
  @MaxLength(300)
  delivery_address?: string | null;

  /** Optional exact pickup spot within the branch area (hotel, landmark, address). */
  @Nullable()
  @IsString()
  @MaxLength(300)
  pickup_address?: string | null;

  /** Optional exact return spot within the branch area. */
  @Nullable()
  @IsString()
  @MaxLength(300)
  return_address?: string | null;

  @Nullable()
  @IsString()
  @MaxLength(1000)
  notes?: string | null;

  @IsBoolean()
  accept_terms: boolean;
}

/** Staff changes to a booking. */
export class BookingUpdateInput {
  @Nullable()
  @IsEnum(BookingStatus)
  status?: BookingStatus | null;

  @Nullable()
  @IsString()
  @MaxLength(2000)
  admin_notes?: string | null;
}

/** `track_booking` arguments. */
export class BookingLookup {
  @IsString()
  @Length(6, 16)
  reference: string;

  @IsEmail({}, { message: 'Enter a valid email address' })
  email: string;
}

/** `bookings` arguments (staff only). */
export class BookingListArgs {
  @Optional() @IsInt() page?: number = 1;
  @Optional() @IsInt() page_size?: number = 20;

  @Nullable()
  @IsEnum(BookingStatus)
  status?: BookingStatus | null;

  @Nullable()
  @IsString()
  q?: string | null;

  /** Only bookings picked up at this branch (staff; a branch owner always sees their own). */
  @Nullable()
  @IsIn(BRANCH_CODES, { message: 'Unknown branch' })
  branch?: string | null;
}
