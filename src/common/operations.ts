import type { RequestContext } from './context';

/** One thing a client can ask the API for, e.g. `vehicles` or `create_booking`. */
export interface Operation {
  run(ctx: RequestContext, args: unknown): unknown;
  /** Changes data: a request containing one runs its operations in order instead of in parallel. */
  write?: boolean;
}

export type Operations = Record<string, Operation>;

export const read = (run: Operation['run']): Operation => ({ run });
export const write = (run: Operation['run']): Operation => ({
  run,
  write: true,
});
