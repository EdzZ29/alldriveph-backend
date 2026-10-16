import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  UpdateDateColumn,
} from 'typeorm';

import { BookingStatus, ServiceType } from '../common/enums';
import { Identified, numeric } from './base';
import { Vehicle } from './vehicle.entity';

@Entity('bookings')
@Check('ck_bookings_valid_period', 'return_at > pickup_at')
@Check('ck_bookings_non_negative_total', 'total_amount >= 0')
@Index('ix_bookings_vehicle_period', ['vehicle_id', 'pickup_at', 'return_at'])
export class Booking extends Identified {
  @Index('ix_bookings_reference', { unique: true })
  @Column({ type: 'varchar', length: 16 })
  reference: string;

  @Index('ix_bookings_vehicle_id')
  @Column('uuid')
  vehicle_id: string;

  @Index('ix_bookings_status')
  @Column({ type: 'varchar', length: 20 })
  status: BookingStatus = BookingStatus.pending;

  @Column({ type: 'varchar', length: 20 })
  service_type: ServiceType;

  @Column({ type: 'varchar', length: 120 })
  customer_name: string;

  @Index('ix_bookings_customer_email')
  @Column({ type: 'varchar', length: 255 })
  customer_email: string;

  @Column({ type: 'varchar', length: 30 })
  customer_phone: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  license_number: string | null = null;

  @Column({ type: 'varchar', length: 40 })
  pickup_location: string;

  @Column({ type: 'varchar', length: 40 })
  return_location: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  delivery_address: string | null = null;

  /** Optional exact spot within the pickup branch area, e.g. a hotel or landmark. */
  @Column({ type: 'varchar', length: 300, nullable: true })
  pickup_address: string | null = null;

  /** Optional exact spot within the return branch area. */
  @Column({ type: 'varchar', length: 300, nullable: true })
  return_address: string | null = null;

  @Column({ type: 'varchar', length: 20, default: 'local' })
  destination_zone: string = 'local';

  @Column({ type: 'varchar', length: 120, nullable: true })
  destination: string | null = null;

  @Column('timestamptz')
  pickup_at: Date;

  @Column('timestamptz')
  return_at: Date;

  @Column({ type: 'varchar', length: 40, array: true })
  extras: string[] = [];

  @Column('int')
  days: number;

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: numeric })
  daily_rate: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: numeric })
  base_amount: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: numeric })
  discount_amount: number = 0;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: numeric })
  driver_amount: number = 0;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: numeric })
  extras_amount: number = 0;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: numeric })
  total_amount: number;

  @Column({ type: 'text', nullable: true })
  notes: string | null = null;

  @Column({ type: 'text', nullable: true })
  admin_notes: string | null = null;

  @Column({ type: 'timestamptz', nullable: true })
  cancelled_at: Date | null = null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @ManyToOne(() => Vehicle, {
    eager: true,
    onDelete: 'RESTRICT',
    nullable: false,
  })
  @JoinColumn({
    name: 'vehicle_id',
    foreignKeyConstraintName: 'fk_bookings_vehicle_id_vehicles',
  })
  vehicle: Vehicle;
}
