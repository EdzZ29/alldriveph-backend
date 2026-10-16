import { Controller, Get, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { DataSource } from 'typeorm';

import { RequestContext } from './common/context';
import { AppError, errorResponse } from './common/errors';
import { LiveHub, type LiveEvent } from './common/live.hub';
import { RateLimiter } from './common/rate-limiter.service';
import { settings } from './config/settings';
import { Booking } from './entities/booking.entity';
import { AuthService } from './modules/accounts/auth.service';
import { ChatOperations } from './modules/chat/chat.operations';

/** Keeps proxies from closing a quiet stream. */
const HEARTBEAT_MS = 25_000;

/** The JSON each event type carries. */
function payload(event: LiveEvent): unknown {
  switch (event.type) {
    case 'message':
      return event.message;
    case 'conversation':
      return event.conversation;
    case 'booking':
      return event.booking;
    case 'contact':
      return event.contact;
    case 'commission':
      return event.commission;
  }
}

/**
 * Live updates as Server-Sent Events, so new messages and bookings appear without a refresh:
 *
 *   GET /api/v1/events?chat=<id>&token=<secret>   a visitor's own chat conversation
 *   GET /api/v1/events?booking=<ref>&email=<email> a customer's own booking (tracking page)
 *   GET /api/v1/events                            signed in: staff get every event (chat,
 *                                                 bookings, contact form); a branch owner gets
 *                                                 the bookings of their branch
 *
 * Each event is `event: <message|conversation|booking|contact>` with its JSON as data. The
 * browser's EventSource reconnects by itself; clients re-sync with a normal request after.
 */
@Controller()
export class EventsController {
  constructor(
    private readonly hub: LiveHub,
    private readonly chat: ChatOperations,
    private readonly auth: AuthService,
    private readonly limiter: RateLimiter,
    private readonly dataSource: DataSource,
  ) {}

  /** Which events this request may hear, or an error to answer with. */
  private async audience(
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<(event: LiveEvent) => boolean> {
    const query = req.query as {
      chat?: string;
      token?: string;
      booking?: string;
      email?: string;
    };
    const ctx = new RequestContext(req, reply, {
      userFromToken: (token) => this.auth.userFromToken(token),
      limiter: this.limiter,
    });
    if (query.booking) {
      // the customer's tracking page: the same reference + email check as track_booking
      await ctx.rateLimit('120/hour', 'track_stream');
      const booking = await this.dataSource.manager.findOne(Booking, {
        where: {
          reference: String(query.booking).trim().toUpperCase(),
          customer_email: String(query.email ?? '')
            .trim()
            .toLowerCase(),
        },
      });
      if (!booking)
        throw new AppError(404, 'No booking matches that reference and email');
      return (event) =>
        event.type === 'booking' && event.booking.id === booking.id;
    }
    if (query.chat) {
      if (!(await this.chat.canWatch(query.chat, query.token ?? '')))
        throw new AppError(404, 'Chat not found');
      const id = query.chat;
      return (event) =>
        event.type === 'message' && event.conversation_id === id;
    }
    const { branch } = await ctx.requireBookingViewer();
    if (!branch) return () => true;
    return (event) =>
      (event.type === 'booking' && event.booking.branch === branch) ||
      (event.type === 'commission' && event.commission.branch === branch);
  }

  @Get(`${settings.apiPrefix}/events`)
  async stream(@Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    let accepts: (event: LiveEvent) => boolean;
    try {
      accepts = await this.audience(req, reply);
    } catch (error) {
      const { status, body } = errorResponse(error);
      return reply.status(status).send(body);
    }

    // from here on the raw socket is ours: no compression, no buffering
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    res.write('retry: 3000\n\n');

    const unsubscribe = this.hub.subscribe((event) => {
      if (accepts(event))
        res.write(
          `event: ${event.type}\ndata: ${JSON.stringify(payload(event))}\n\n`,
        );
    });
    const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
    const close = () => {
      clearInterval(heartbeat);
      unsubscribe();
    };
    req.raw.on('close', close);
    res.on('error', close);
  }
}
