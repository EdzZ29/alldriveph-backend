import { Controller, Post, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { RequestContext } from './common/context';
import { AppError, OperationError, errorResponse } from './common/errors';
import type { Operations } from './common/operations';
import { RateLimiter } from './common/rate-limiter.service';
import { settings } from './config/settings';
import { AccountOperations } from './modules/accounts/accounts.operations';
import { AuthService } from './modules/accounts/auth.service';
import { AdminOperations } from './modules/admin/admin.operations';
import { BookingOperations } from './modules/bookings/bookings.operations';
import { CatalogOperations } from './modules/catalog/catalog.operations';
import { ChatOperations } from './modules/chat/chat.operations';
import { CommissionOperations } from './modules/commissions/commissions.operations';
import { ContentOperations } from './modules/content/content.operations';

/** Most operations one request may ask for. */
export const MAX_OPERATIONS = 20;

export const API_PATH = `${settings.apiPrefix}/rpc`;

/**
 * The whole API is one endpoint: POST /api/v1/rpc.
 *
 * The body names the operations you want, each with its arguments, and the answer has exactly
 * those keys:
 *
 *   { "vehicles": { "branch": "davao" }, "meta": {} }
 *   -> 200 { "vehicles": [...], "meta": {...} }
 *
 * Reads in one request run in parallel; a request that changes data runs its operations in
 * order. Any failure answers with its HTTP status and { "error": {...} } (see common/errors.ts).
 * A multipart/form-data request uploads an image: { "upload_image": { "url": "/media/..." } }.
 */
@Controller()
export class RpcController {
  private readonly operations: Operations;

  constructor(
    catalog: CatalogOperations,
    bookings: BookingOperations,
    content: ContentOperations,
    chat: ChatOperations,
    commissions: CommissionOperations,
    accounts: AccountOperations,
    private readonly admin: AdminOperations,
    private readonly auth: AuthService,
    private readonly limiter: RateLimiter,
  ) {
    this.operations = {
      ...catalog.operations,
      ...bookings.operations,
      ...content.operations,
      ...chat.operations,
      ...commissions.operations,
      ...accounts.operations,
      ...admin.operations,
    };
  }

  /** Every operation name, for docs and tests. */
  names(): string[] {
    return Object.keys(this.operations).sort();
  }

  @Post(API_PATH)
  async handle(@Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    const ctx = new RequestContext(req, reply, {
      userFromToken: (token) => this.auth.userFromToken(token),
      limiter: this.limiter,
    });
    try {
      const result = req.isMultipart()
        ? await this.upload(ctx, req)
        : await this.run(ctx, req.body);
      return reply.status(200).send(result);
    } catch (error) {
      const { status, body } = errorResponse(error);
      return reply.status(status).send(body);
    }
  }

  private async run(
    ctx: RequestContext,
    body: unknown,
  ): Promise<Record<string, unknown>> {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new AppError(
        400,
        'Send a JSON object of operation names to arguments, e.g. {"meta": {}}',
      );
    }
    const calls = Object.entries(body as Record<string, unknown>);
    if (!calls.length)
      throw new AppError(400, 'Ask for at least one operation');
    if (calls.length > MAX_OPERATIONS) {
      throw new AppError(
        400,
        `Ask for at most ${MAX_OPERATIONS} operations per request`,
      );
    }
    for (const [name] of calls) {
      if (!Object.hasOwn(this.operations, name))
        throw new OperationError(
          name,
          new AppError(400, `Unknown operation: ${name}`),
        );
    }

    const call = async ([name, args]: [string, unknown]) => {
      try {
        return [name, await this.operations[name].run(ctx, args)] as const;
      } catch (error) {
        throw new OperationError(name, error);
      }
    };
    if (calls.some(([name]) => this.operations[name].write)) {
      const results: Record<string, unknown> = {};
      for (const entry of calls) {
        const [name, value] = await call(entry);
        results[name] = value;
      }
      return results;
    }
    return Object.fromEntries(await Promise.all(calls.map(call)));
  }

  private async upload(ctx: RequestContext, req: FastifyRequest) {
    const maxBytes = settings.maxUploadMb * 1024 * 1024;
    const readFile = async () => {
      const part = await req.file({ limits: { fileSize: maxBytes, files: 1 } });
      if (!part) return undefined;
      try {
        return await part.toBuffer();
      } catch (error) {
        if ((error as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') {
          throw new AppError(
            413,
            `Max file size is ${settings.maxUploadMb} MB`,
          );
        }
        throw error;
      }
    };
    try {
      return { upload_image: await this.admin.uploadImage(ctx, readFile) };
    } catch (error) {
      throw new OperationError('upload_image', error);
    }
  }
}
