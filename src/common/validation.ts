import { applyDecorators, type ValidationError } from '@nestjs/common';
import { Transform, plainToInstance } from 'class-transformer';
import {
  IsDate,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
  validate,
} from 'class-validator';

import { AppError, invalidInput, type FieldError } from './errors';

function flatten(errors: ValidationError[], parent = ''): FieldError[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own = Object.values(error.constraints ?? {}).map((message) => ({
      field,
      message,
    }));
    return [...own, ...flatten(error.children ?? [], field)];
  });
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Checks plain JSON against the class-validator rules on `cls` and returns an instance. Unknown
 * fields are refused, so a client can never write columns the class does not list. Problems are
 * reported like the website expects: the first message, plus the full list of bad fields.
 */
export async function validateArgs<T extends object>(
  cls: new () => T,
  values: unknown,
  name = 'arguments',
): Promise<T> {
  if (values === undefined || values === null) values = {};
  if (!isObject(values)) throw invalidInput(`${name} must be an object`, name);
  const instance = plainToInstance(cls, values);
  const errors = await validate(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: false,
    validationError: { target: false, value: false },
  });
  if (errors.length) {
    const details = flatten(errors);
    throw new AppError(422, details[0].message, details);
  }
  return instance;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A UUID argument such as `id`, lowercased. */
export function uuidArg(value: unknown, field = 'id'): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw invalidInput(`${field} must be a UUID`, field);
  }
  return value.toLowerCase();
}

/** Arguments of the shape { id, input } used by every update operation. */
export async function idAndInput<T extends object>(
  args: unknown,
  cls: new () => T,
): Promise<{ id: string; input: T }> {
  const { id, input, ...rest } = isObject(args) ? args : {};
  const unknown = Object.keys(rest);
  if (unknown.length)
    throw invalidInput(`Unknown argument: ${unknown[0]}`, unknown[0]);
  return { id: uuidArg(id), input: await validateArgs(cls, input, 'input') };
}

/** Arguments of the shape { input } used by every create operation. */
export async function inputArg<T extends object>(
  args: unknown,
  cls: new () => T,
): Promise<T> {
  const { input, ...rest } = isObject(args) ? args : {};
  const unknown = Object.keys(rest);
  if (unknown.length)
    throw invalidInput(`Unknown argument: ${unknown[0]}`, unknown[0]);
  return validateArgs(cls, input, 'input');
}

/** Arguments of the shape { id } used by delete and staff lookups. */
export function idArg(args: unknown): string {
  const { id, ...rest } = isObject(args) ? args : {};
  const unknown = Object.keys(rest);
  if (unknown.length)
    throw invalidInput(`Unknown argument: ${unknown[0]}`, unknown[0]);
  return uuidArg(id);
}

const OFFSET = /(?:[zZ]|[+-]\d{2}:?\d{2})$/;

function parseDateTime(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  // a date without an offset is ambiguous for pricing and availability
  if (!OFFSET.test(value.trim())) {
    throw new AppError(422, 'Dates must include a timezone offset');
  }
  return new Date(value);
}

/** ISO 8601 date and time with a timezone offset, e.g. 2026-11-02T09:00:00+08:00. */
export const IsDateTime = () =>
  applyDecorators(
    Transform(({ value }) => parseDateTime(value)),
    IsDate({ message: '$property must be an ISO 8601 date and time' }),
  );

/** The field may be left out, but not set to null (the column is NOT NULL). */
export const Optional = () =>
  ValidateIf((_object, value) => value !== undefined);

/** The field may be left out or set to null. */
export const Nullable = () => IsOptional();

/** Arguments of a single row lookup: by slug (public), or by id (staff only). */
export class LookupArgs {
  @Nullable()
  @IsString()
  @MaxLength(160)
  slug?: string | null;

  @Nullable()
  @IsUUID('all', { message: 'id must be a UUID' })
  id?: string | null;
}
