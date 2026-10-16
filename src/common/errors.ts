import { HttpException, IntrinsicException, Logger } from '@nestjs/common';

/**
 * A failed request answers with the HTTP status and one error object, naming the operation that
 * failed. Invalid input also lists the bad fields:
 *
 *   422 { "error": { "op": "quote", "message": "Unknown location", "code": "BAD_USER_INPUT",
 *                    "status": 422,
 *                    "errors": [{ "field": "pickup_location", "message": "Unknown location" }] } }
 */

export interface FieldError {
  field: string | null;
  message: string;
}

const CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'BAD_USER_INPUT',
  429: 'RATE_LIMITED',
};

export const INTERNAL_MESSAGE =
  'Something went wrong on our side. Please try again.';

/** An expected failure with a message the website can show as is. Not logged as a crash. */
export class AppError extends IntrinsicException {
  constructor(
    readonly status: number,
    message: string,
    readonly fieldErrors?: FieldError[],
  ) {
    super(message);
  }

  get code(): string {
    return CODES[this.status] ?? 'ERROR';
  }
}

export const notFound = (label: string) =>
  new AppError(404, `${label} not found`);
export const conflict = (message: string) => new AppError(409, message);
export const unprocessable = (message: string) => new AppError(422, message);
/** Invalid input, reported like field validation (with the `errors` list). */
export const invalidInput = (message: string, field: string | null = null) =>
  new AppError(422, message, [{ field, message }]);

/** Remembers which operation of a request failed. */
export class OperationError extends Error {
  constructor(
    readonly op: string,
    readonly original: unknown,
  ) {
    super(`Operation ${op} failed`);
  }
}

export interface ErrorBody {
  error: {
    op: string | null;
    message: string;
    code: string;
    status: number;
    errors?: FieldError[];
  };
}

const logger = new Logger('API');

function isClientError(
  error: unknown,
): error is { statusCode: number; message: string } {
  const statusCode = (error as { statusCode?: unknown } | null)?.statusCode;
  return (
    error instanceof Error &&
    typeof statusCode === 'number' &&
    statusCode >= 400 &&
    statusCode < 500
  );
}

/** Turns anything thrown while answering a request into its status and JSON body. */
export function errorResponse(thrown: unknown): {
  status: number;
  body: ErrorBody;
} {
  const op = thrown instanceof OperationError ? thrown.op : null;
  const error = thrown instanceof OperationError ? thrown.original : thrown;
  let status: number;
  let message: string;
  let errors: FieldError[] | undefined;
  if (error instanceof AppError) {
    status = error.status;
    message = error.message;
    errors = error.fieldErrors;
  } else if (error instanceof HttpException) {
    status = error.getStatus();
    message = error.message;
  } else if (isClientError(error)) {
    // Fastify and plugin errors for a bad request, e.g. a malformed multipart body
    status = error.statusCode;
    message = error.message;
  } else {
    logger.error(
      `Unhandled error in ${op ?? 'request'}`,
      error instanceof Error ? error.stack : String(error),
    );
    status = 500;
    message = INTERNAL_MESSAGE;
  }
  const code =
    status === 500 ? 'INTERNAL_SERVER_ERROR' : (CODES[status] ?? 'ERROR');
  return {
    status,
    body: {
      error: { op, message, code, status, ...(errors ? { errors } : {}) },
    },
  };
}
