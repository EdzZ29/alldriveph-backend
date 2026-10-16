import type {} from '@fastify/cookie'; // adds request.cookies and reply.setCookie types
import type { FastifyReply, FastifyRequest } from 'fastify';

import { settings } from '../config/settings';
import type { User } from '../entities/user.entity';
import { UserRole } from './enums';
import { AppError } from './errors';
import type { RateLimiter } from './rate-limiter.service';

export interface ContextServices {
  /** Resolves a session token to an active user, or null. */
  userFromToken(token: string): Promise<User | null>;
  limiter: RateLimiter;
}

/** Per request state shared by every operation: the signed in user and rate limits. */
export class RequestContext {
  private userPromise?: Promise<User | null>;

  constructor(
    public req: FastifyRequest,
    public reply: FastifyReply,
    private readonly services: ContextServices,
  ) {}

  /** Bearer token from the Authorization header, else the httpOnly session cookie. */
  token(): string | undefined {
    const [scheme, credentials] = (this.req.headers.authorization ?? '').split(
      ' ',
    );
    if (scheme?.toLowerCase() === 'bearer' && credentials?.trim())
      return credentials.trim();
    return this.req.cookies?.[settings.authCookieName] || undefined;
  }

  /** The signed in user, loaded once per request however many operations ask. */
  user(): Promise<User | null> {
    if (!this.userPromise) {
      const token = this.token();
      this.userPromise = token
        ? this.services.userFromToken(token)
        : Promise.resolve(null);
    }
    return this.userPromise;
  }

  /** True for signed in admins and staff. */
  async isStaff(): Promise<boolean> {
    const user = await this.user();
    return user?.role === UserRole.admin || user?.role === UserRole.staff;
  }

  async requireUser(): Promise<User> {
    const user = await this.user();
    if (!user) throw new AppError(401, 'Not authenticated');
    return user;
  }

  async requireStaff(): Promise<User> {
    const user = await this.requireUser();
    if (user.role !== UserRole.admin && user.role !== UserRole.staff) {
      throw new AppError(403, 'Not allowed');
    }
    return user;
  }

  /**
   * Who may read bookings and the dashboard: staff see every branch (branch null), a branch owner
   * only their own branch. Everyone else is refused.
   */
  async requireBookingViewer(): Promise<{ user: User; branch: string | null }> {
    const user = await this.requireUser();
    if (user.role === UserRole.admin || user.role === UserRole.staff)
      return { user, branch: null };
    if (user.role === UserRole.owner && user.branch)
      return { user, branch: user.branch };
    throw new AppError(403, 'Not allowed');
  }

  /**
   * Who may change bookings and cars: staff anywhere (branch null), a branch owner for their own
   * branch only. Same rule as reading; kept separate so the two can diverge.
   */
  requireBranchManager(): Promise<{ user: User; branch: string | null }> {
    return this.requireBookingViewer();
  }

  async requireAdmin(): Promise<User> {
    const user = await this.requireUser();
    if (user.role !== UserRole.admin) {
      throw new AppError(403, 'Administrator access required');
    }
    return user;
  }

  /** Per client IP limit for one operation, e.g. rateLimit("10/minute", "login"). */
  async rateLimit(rule: string, scope: string): Promise<void> {
    if (!(await this.services.limiter.hit(rule, scope, this.req.ip))) {
      throw new AppError(
        429,
        'Too many attempts. Please wait a moment and try again.',
      );
    }
  }
}
