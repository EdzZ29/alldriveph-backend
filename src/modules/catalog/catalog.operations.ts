import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, Repository } from 'typeorm';

import {
  BRANCH_ZONES,
  BRANCHES,
  DEFAULT_DRIVER_RATE,
  EXTRAS,
  LONG_RENTAL_DAYS,
  LONG_RENTAL_DISCOUNT,
  MAX_RENTAL_DAYS,
  MIN_LEAD_HOURS,
  MIN_RENTAL_HOURS,
  PICKUP_LOCATIONS,
  SECURITY_DEPOSIT,
  ZONE_CODES,
} from '../../common/constants';
import { CrudService } from '../../common/crud.service';
import {
  BLOCKING_STATUSES,
  VehicleCategory,
  VehicleSort,
} from '../../common/enums';
import { invalidInput, notFound, unprocessable } from '../../common/errors';
import { read, write, type Operations } from '../../common/operations';
import { RevalidateService } from '../../common/revalidate.service';
import {
  idAndInput,
  idArg,
  inputArg,
  LookupArgs,
  validateArgs,
} from '../../common/validation';
import {
  vehicleAdmin,
  vehicleDetail,
  vehicleSummary,
} from '../../common/views';
import { Booking } from '../../entities/booking.entity';
import { Vehicle } from '../../entities/vehicle.entity';
import {
  VehicleInput,
  VehicleListArgs,
  VehicleUpdateInput,
} from './catalog.inputs';

/** Branches, pickup locations, rate zones, extras and policies. */
const META = {
  branches: BRANCHES,
  locations: PICKUP_LOCATIONS,
  zones: BRANCH_ZONES,
  extras: EXTRAS,
  categories: Object.values(VehicleCategory),
  policies: {
    min_lead_hours: MIN_LEAD_HOURS,
    min_rental_hours: MIN_RENTAL_HOURS,
    max_rental_days: MAX_RENTAL_DAYS,
    long_rental_days: LONG_RENTAL_DAYS,
    long_rental_discount: LONG_RENTAL_DISCOUNT,
    security_deposit: SECURITY_DEPOSIT,
    default_driver_rate: DEFAULT_DRIVER_RATE,
  },
};

const ORDER: Record<VehicleSort, [string, 'ASC' | 'DESC'][]> = {
  recommended: [
    ['v.is_featured', 'DESC'],
    ['v.sort_order', 'ASC'],
    ['v.daily_rate', 'ASC'],
  ],
  price_asc: [['v.daily_rate', 'ASC']],
  price_desc: [['v.daily_rate', 'DESC']],
  seats: [
    ['v.seats', 'DESC'],
    ['v.daily_rate', 'ASC'],
  ],
  display_order: [
    ['v.sort_order', 'ASC'],
    ['v.name', 'ASC'],
  ],
};

/** Keeps known zones with a positive rate; blank rates are dropped (quoted on request). */
export function cleanZoneRates(
  value: unknown,
): Record<string, number> | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw invalidInput(
      'Zone rates must be an object of zone code to daily rate',
      'zone_rates',
    );
  }
  const cleaned: Record<string, number> = {};
  for (const [code, rate] of Object.entries(value)) {
    if (!ZONE_CODES.includes(code))
      throw invalidInput(`Unknown rate zone: ${code}`, 'zone_rates');
    if (rate === null || rate === '') continue;
    const amount = Number(rate);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw invalidInput('Zone rates must be greater than zero', 'zone_rates');
    }
    cleaned[code] = Math.round(amount * 100) / 100;
  }
  return cleaned;
}

/** A branch owner's cars stay at their branch. */
function sameBranch(requested: string | null | undefined, own: string): string {
  if (requested && requested !== own)
    throw invalidInput('You can only manage cars at your own branch', 'branch');
  return own;
}

const SAVE = {
  conflict: 'Plate number already exists',
  revalidate: ['vehicles' as const],
};

@Injectable()
export class CatalogOperations {
  constructor(
    @InjectRepository(Vehicle) private readonly vehicles: Repository<Vehicle>,
    private readonly dataSource: DataSource,
    private readonly crud: CrudService,
    private readonly revalidator: RevalidateService,
  ) {}

  readonly operations: Operations = {
    meta: read(() => META),

    /** Bookable cars, filtered and sorted. include_inactive (staff only) adds hidden cars. */
    vehicles: read(async (ctx, args) => {
      const a = await validateArgs(VehicleListArgs, args);
      const manage = !!a.include_inactive;
      if (manage) {
        // a branch owner manages the cars kept at their branch, and only those
        const { branch } = await ctx.requireBranchManager();
        if (branch) a.branch = branch;
      }
      const rows = await this.listVehicles(a);
      return rows.map(manage ? vehicleAdmin : vehicleSummary);
    }),

    /** A bookable car by slug, or any car by id (staff, or its branch owner). Null if not found. */
    vehicle: read(async (ctx, args) => {
      const { slug, id } = await validateArgs(LookupArgs, args);
      if (id) {
        const { branch } = await ctx.requireBranchManager();
        const row = await this.vehicles.findOne({ where: { id } });
        return row && (!branch || row.branch === branch)
          ? vehicleAdmin(row)
          : null;
      }
      if (!slug) return null;
      const row = await this.vehicles.findOne({
        where: { slug, is_active: true },
      });
      return row && vehicleDetail(row);
    }),

    /** Staff, or a branch owner adding a car to their own branch. */
    create_vehicle: write(async (ctx, args) => {
      const { branch } = await ctx.requireBranchManager();
      const input = await inputArg(args, VehicleInput);
      const data = {
        ...input,
        zone_rates: cleanZoneRates(input.zone_rates),
        ...(branch ? { branch: sameBranch(input.branch, branch) } : {}),
      };
      const row = await this.crud.create(Vehicle, data, {
        slugFrom: 'name',
        ...SAVE,
      });
      return vehicleAdmin(row);
    }),

    /** Staff, or the owner of the branch the car is kept at (who cannot move it elsewhere). */
    update_vehicle: write(async (ctx, args) => {
      const { branch } = await ctx.requireBranchManager();
      const { id, input } = await idAndInput(args, VehicleUpdateInput);
      if (branch) {
        const current = await this.vehicles.findOne({ where: { id } });
        if (!current || current.branch !== branch) throw notFound('Vehicle');
        if (input.branch !== undefined) sameBranch(input.branch, branch);
      }
      const data = { ...input, zone_rates: cleanZoneRates(input.zone_rates) };
      const row = await this.crud.update(Vehicle, id, data, 'Vehicle', {
        slug: true,
        ...SAVE,
      });
      return vehicleAdmin(row);
    }),

    /** Staff only. Deletes a car; cars with booking history are hidden instead, keeping records. */
    delete_vehicle: write(async (ctx, args) => {
      await ctx.requireStaff();
      return this.deleteVehicle(idArg(args));
    }),
  };

  private listVehicles(f: VehicleListArgs): Promise<Vehicle[]> {
    const query = this.vehicles.createQueryBuilder('v');
    if (!f.include_inactive) query.andWhere('v.is_active = true');
    if (f.category)
      query.andWhere('v.category = :category', { category: f.category });
    if (f.transmission) {
      query.andWhere('v.transmission = :transmission', {
        transmission: f.transmission,
      });
    }
    if (f.min_seats)
      query.andWhere('v.seats >= :minSeats', { minSeats: f.min_seats });
    if (f.branch) query.andWhere('v.branch = :branch', { branch: f.branch });
    if (f.featured !== undefined && f.featured !== null) {
      query.andWhere('v.is_featured = :featured', { featured: f.featured });
    }
    const term = f.q?.trim().slice(0, 80);
    if (term) {
      query.andWhere(
        new Brackets((where) =>
          where
            .where('v.name ILIKE :term')
            .orWhere('v.brand ILIKE :term')
            .orWhere('v.model ILIKE :term'),
        ),
        { term: `%${term}%` },
      );
    }
    if (f.available_from && f.available_to) {
      if (f.available_to <= f.available_from)
        throw unprocessable('Return must be after pickup');
      query.andWhere(
        `NOT EXISTS (${this.dataSource
          .createQueryBuilder()
          .select('1')
          .from(Booking, 'b')
          .where('b.vehicle_id = v.id')
          .andWhere('b.status IN (:...blocking)')
          .andWhere('b.pickup_at < :to AND b.return_at > :from')
          .getQuery()})`,
        {
          blocking: BLOCKING_STATUSES,
          from: f.available_from,
          to: f.available_to,
        },
      );
    }
    for (const [column, direction] of ORDER[f.sort ?? VehicleSort.recommended])
      query.addOrderBy(column, direction);
    return query.getMany();
  }

  private async deleteVehicle(id: string): Promise<boolean> {
    const manager = this.dataSource.manager;
    const vehicle = await this.crud.getOr404(manager, Vehicle, id, 'Vehicle');
    if (await manager.exists(Booking, { where: { vehicle_id: id } })) {
      // keep booking history intact: retire the vehicle instead of deleting it
      await manager.update(Vehicle, { id }, { is_active: false });
    } else {
      await manager.remove(vehicle);
    }
    this.revalidator.revalidate(['vehicles']);
    return true;
  }
}
