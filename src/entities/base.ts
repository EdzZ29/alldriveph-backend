import { randomUUID } from 'node:crypto';
import {
  BeforeInsert,
  CreateDateColumn,
  PrimaryColumn,
  UpdateDateColumn,
  type ValueTransformer,
} from 'typeorm';

/** NUMERIC columns come back from Postgres as strings; work with plain numbers instead. */
export const numeric: ValueTransformer = {
  to: (value?: number | null) => value,
  from: (value: string | null) => (value === null ? null : Number(value)),
};

export abstract class Identified {
  @PrimaryColumn('uuid')
  id: string;

  @BeforeInsert()
  protected assignId() {
    this.id ??= randomUUID();
  }
}

/** Tables with created_at / updated_at. */
export abstract class Timestamped extends Identified {
  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
