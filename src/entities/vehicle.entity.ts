import { Column, Entity, Index } from 'typeorm';

import { FuelType, Transmission, VehicleCategory } from '../common/enums';
import { Timestamped, numeric } from './base';

@Entity('vehicles')
export class Vehicle extends Timestamped {
  @Index('ix_vehicles_slug', { unique: true })
  @Column({ type: 'varchar', length: 140 })
  slug: string;

  @Column({ type: 'varchar', length: 140 })
  name: string;

  @Column({ type: 'varchar', length: 60 })
  brand: string;

  @Column({ type: 'varchar', length: 80 })
  model: string;

  @Column('int')
  year: number;

  @Index('ix_vehicles_category')
  @Column({ type: 'varchar', length: 20 })
  category: VehicleCategory;

  @Column({ type: 'varchar', length: 20 })
  transmission: Transmission;

  @Column({ type: 'varchar', length: 20 })
  fuel_type: FuelType;

  @Column('int')
  seats: number;

  @Column('int')
  luggage: number = 2;

  @Column({ type: 'varchar', length: 40, nullable: true })
  color: string | null = null;

  @Column({ type: 'varchar', length: 20, nullable: true, unique: true })
  plate_number: string | null = null;

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: numeric })
  daily_rate: number;

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: numeric })
  driver_rate: number = 1000;

  /** daily rate per destination zone, e.g. {"local": 1300, "region": 1800}; falls back to daily_rate */
  @Column({ type: 'jsonb', default: {} })
  zone_rates: Record<string, number> = {};

  @Column({ type: 'varchar', length: 500 })
  image_url: string;

  @Column({ type: 'text' })
  description: string = '';

  @Column({ type: 'varchar', length: 80, array: true })
  features: string[] = [];

  @Index('ix_vehicles_branch')
  @Column({ type: 'varchar', length: 30, default: 'butuan' })
  branch: string = 'butuan';

  @Column('boolean')
  is_featured: boolean = false;

  @Index('ix_vehicles_is_active')
  @Column('boolean')
  is_active: boolean = true;

  @Column('int')
  sort_order: number = 0;
}
