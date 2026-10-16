import { Injectable } from '@nestjs/common';
import {
  DataSource,
  QueryFailedError,
  type EntityManager,
  type EntityTarget,
} from 'typeorm';

import { AppError, notFound } from './errors';
import { RevalidateService, type CacheTag } from './revalidate.service';
import { defined, uniqueSlug } from './utils';

interface SaveOptions<T> {
  /** create: build the slug from this field when none is given */
  slugFrom?: keyof T & string;
  /** update: make a given slug unique */
  slug?: boolean;
  /** message for a unique constraint violation (e.g. a duplicate plate number) */
  conflict?: string;
  /** update: adjust the changes using the stored row before they are applied */
  prepare?: (existing: T, changes: Partial<T>) => void;
  revalidate?: CacheTag[];
}

type Row = { id: string; slug?: string };

export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string } | undefined)?.code === '23505'
  );
}

/** Create, update and delete helpers shared by the admin mutations. */
@Injectable()
export class CrudService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly revalidator: RevalidateService,
  ) {}

  async getOr404<T extends Row>(
    manager: EntityManager,
    entity: EntityTarget<T>,
    id: string,
    label: string,
  ): Promise<T> {
    const row = await manager.findOne(entity, { where: { id } as never });
    if (!row) throw notFound(label);
    return row;
  }

  private async save<T extends Row>(
    manager: EntityManager,
    row: T,
    conflict?: string,
  ) {
    try {
      return await manager.save(row);
    } catch (error) {
      if (conflict && isUniqueViolation(error))
        throw new AppError(409, conflict);
      throw error;
    }
  }

  async create<T extends Row>(
    entity: EntityTarget<T>,
    input: object,
    options: SaveOptions<T> = {},
  ): Promise<T> {
    const manager = this.dataSource.manager;
    const data = defined(input) as Partial<T> & Record<string, unknown>;
    if (options.slugFrom) {
      const base = String(data.slug || data[options.slugFrom]);
      data.slug = await uniqueSlug(manager, entity as never, base);
    }
    const row = await this.save(
      manager,
      manager.create(entity, data as never),
      options.conflict,
    );
    this.revalidator.revalidate(options.revalidate ?? []);
    return row;
  }

  async update<T extends Row>(
    entity: EntityTarget<T>,
    id: string,
    input: object,
    label: string,
    options: SaveOptions<T> = {},
  ): Promise<T> {
    const manager = this.dataSource.manager;
    const row = await this.getOr404(manager, entity, id, label);
    const changes = defined(input) as Partial<T> & Record<string, unknown>;
    if (options.slug && changes.slug) {
      changes.slug = await uniqueSlug(
        manager,
        entity as never,
        String(changes.slug),
        row.id,
      );
    }
    options.prepare?.(row, changes);
    Object.assign(row, changes);
    const saved = await this.save(manager, row, options.conflict);
    this.revalidator.revalidate(options.revalidate ?? []);
    return saved;
  }

  async remove<T extends Row>(
    entity: EntityTarget<T>,
    id: string,
    label: string,
    revalidate: CacheTag[] = [],
  ): Promise<boolean> {
    const manager = this.dataSource.manager;
    await manager.remove(await this.getOr404(manager, entity, id, label));
    this.revalidator.revalidate(revalidate);
    return true;
  }
}
