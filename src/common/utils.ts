import { randomBytes, randomInt } from 'node:crypto';
import {
  Not,
  type EntityManager,
  type EntityTarget,
  type ObjectLiteral,
} from 'typeorm';

const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function slugify(value: string): string {
  const slug = value
    .normalize('NFKD')
    // drop accents and any other non ASCII characters
    .replace(/[\u0080-￿]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return slug || randomBytes(4).toString('hex');
}

/** A slug not used by another row: "toyota-vios", then "toyota-vios-2", "toyota-vios-3"... */
export async function uniqueSlug<
  T extends ObjectLiteral & { id: string; slug: string },
>(
  manager: EntityManager,
  entity: EntityTarget<T>,
  base: string,
  excludeId?: string,
): Promise<string> {
  const root = slugify(base).slice(0, 120);
  let candidate = root;
  for (let n = 2; ; n++) {
    const where = excludeId
      ? { slug: candidate, id: Not(excludeId) }
      : { slug: candidate };
    if (!(await manager.exists(entity, { where: where as never })))
      return candidate;
    candidate = `${root}-${n}`;
  }
}

export function bookingReference(): string {
  let code = '';
  for (let i = 0; i < 7; i++)
    code += REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)];
  return `AD-${code}`;
}

/** Round half to even, like Python's round(). */
function roundHalfEven(value: number): number {
  const floor = Math.floor(value);
  const diff = value - floor;
  if (diff > 0.5) return floor + 1;
  if (diff < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}

export function readingMinutes(text: string): number {
  return Math.max(
    1,
    roundHalfEven(text.split(/\s+/).filter(Boolean).length / 220),
  );
}

/** Copy of an input without the fields the client left out (undefined). */
export function defined<T extends object>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}
