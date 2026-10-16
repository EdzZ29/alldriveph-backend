import { PartialType } from '@nestjs/mapped-types';
import {
  ArrayMaxSize,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { BRANCH_CODES } from '../../common/constants';
import {
  FuelType,
  Transmission,
  VehicleCategory,
  VehicleSort,
} from '../../common/enums';
import { IsDateTime, Nullable, Optional } from '../../common/validation';

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MESSAGE = 'Use lowercase letters, numbers and dashes only';

/** `vehicles` arguments: filters, sort order, and hidden cars for staff. */
export class VehicleListArgs {
  @Nullable()
  @IsEnum(VehicleCategory)
  category?: VehicleCategory | null;

  @Nullable()
  @IsEnum(Transmission)
  transmission?: Transmission | null;

  @Nullable()
  @IsInt()
  @Min(1)
  @Max(30)
  min_seats?: number | null;

  @Nullable()
  @IsString()
  q?: string | null;

  @Nullable()
  @IsBoolean()
  featured?: boolean | null;

  @Nullable()
  @IsString()
  branch?: string | null;

  /** With available_to: only cars free for the whole period. */
  @Nullable()
  @IsDateTime()
  available_from?: Date | null;

  @Nullable()
  @IsDateTime()
  available_to?: Date | null;

  @Optional()
  @IsEnum(VehicleSort)
  sort?: VehicleSort = VehicleSort.recommended;

  /** Staff only: adds hidden cars. */
  @Optional()
  @IsBoolean()
  include_inactive?: boolean = false;
}

/** A car to add to the fleet. */
export class VehicleInput {
  @IsString() @Length(2, 140) name: string;
  @IsString() @Length(2, 60) brand: string;
  @IsString() @Length(1, 80) model: string;
  @IsInt() @Min(1990) @Max(2100) year: number;
  @IsEnum(VehicleCategory) category: VehicleCategory;
  @IsEnum(Transmission) transmission: Transmission;
  @IsEnum(FuelType) fuel_type: FuelType;
  @IsInt() @Min(2) @Max(30) seats: number;

  @Optional()
  @IsInt()
  @Min(0)
  @Max(20)
  luggage?: number;

  @Nullable()
  @IsString()
  @MaxLength(40)
  color?: string | null;

  @Nullable()
  @IsString()
  @MaxLength(20)
  plate_number?: string | null;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(99_999_999.99)
  daily_rate: number;

  @Optional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99_999_999.99)
  driver_rate?: number;

  /** {zone code: daily rate}; blank zones are dropped. Checked by cleanZoneRates. */
  @Optional()
  @IsObject({
    message: 'Zone rates must be an object of zone code to daily rate',
  })
  zone_rates?: Record<string, unknown>;

  @IsString() @Length(1, 500) image_url: string;

  @Optional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @Optional()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  features?: string[];

  @Optional()
  @IsIn(BRANCH_CODES, { message: 'Unknown branch' })
  branch?: string;

  @Optional() @IsBoolean() is_featured?: boolean;
  @Optional() @IsBoolean() is_active?: boolean;
  @Optional() @IsInt() sort_order?: number;

  @Nullable()
  @MaxLength(140)
  @Matches(SLUG_PATTERN, { message: SLUG_MESSAGE })
  slug?: string | null;
}

/** Changes to a car; omitted fields stay as they are. */
export class VehicleUpdateInput extends PartialType(VehicleInput, {
  skipNullProperties: false,
}) {}
