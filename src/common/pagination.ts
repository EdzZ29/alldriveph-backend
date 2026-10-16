import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

import { AppError } from './errors';

export const MAX_PAGE_SIZE = 100;

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

/** One page of a query; the rows and the COUNT run in parallel on separate connections. */
export async function paginate<T extends ObjectLiteral, R = T>(
  query: SelectQueryBuilder<T>,
  page: number,
  pageSize: number,
  view: (row: T) => R,
  maxPageSize = MAX_PAGE_SIZE,
): Promise<Page<R>> {
  if (page < 1 || page > 10_000 || pageSize < 1 || pageSize > maxPageSize) {
    throw new AppError(
      422,
      `page must be 1 to 10000 and page_size 1 to ${maxPageSize}`,
    );
  }
  const [items, total] = await Promise.all([
    query
      .clone()
      .offset((page - 1) * pageSize)
      .limit(pageSize)
      .getMany(),
    query.clone().orderBy().getCount(),
  ]);
  return {
    items: items.map(view),
    total,
    page,
    page_size: pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
