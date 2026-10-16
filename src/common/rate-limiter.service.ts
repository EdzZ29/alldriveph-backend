import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createClient } from 'redis';

import { settings } from '../config/settings';

const WINDOWS: Record<string, number> = {
  second: 1_000,
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
};

/** "10/minute" -> { limit: 10, windowMs: 60000 } */
function parseRule(rule: string): { limit: number; windowMs: number } {
  const [count, unit] = rule.split('/');
  const windowMs = WINDOWS[unit?.trim().replace(/s$/, '')];
  const limit = Number(count);
  if (!windowMs || !Number.isInteger(limit) || limit < 1) {
    throw new Error(`Invalid rate limit rule: ${rule}`);
  }
  return { limit, windowMs };
}

/**
 * Fixed window limits per client IP and operation (login, bookings, contact form...).
 * In memory by default; set RATE_LIMIT_STORAGE_URI=redis://... to share them across instances.
 * There is deliberately no global limit: server side rendering calls the API from one IP.
 */
@Injectable()
export class RateLimiter implements OnModuleDestroy {
  private readonly logger = new Logger(RateLimiter.name);
  private readonly windows = new Map<
    string,
    { count: number; resetAt: number }
  >();
  private redis?: ReturnType<typeof createClient>;
  private redisReady?: Promise<unknown>;

  constructor() {
    if (settings.rateLimitStorageUri.startsWith('redis')) {
      this.redis = createClient({ url: settings.rateLimitStorageUri });
      this.redis.on('error', (error: Error) =>
        this.logger.warn(`Redis: ${error.message}`),
      );
      this.redisReady = this.redis.connect();
    }
  }

  /** Counts one hit; returns false when the client is over the limit. */
  async hit(rule: string, scope: string, client: string): Promise<boolean> {
    if (settings.isTest) return true;
    const { limit, windowMs } = parseRule(rule);
    const key = `ratelimit:${scope}:${client}`;
    if (this.redis) {
      await this.redisReady;
      const count = await this.redis.incr(key);
      if (count === 1) await this.redis.pExpire(key, windowMs);
      return count <= limit;
    }
    const now = Date.now();
    let window = this.windows.get(key);
    if (!window || window.resetAt <= now) {
      window = { count: 0, resetAt: now + windowMs };
      this.windows.set(key, window);
      if (this.windows.size > 10_000) this.prune(now);
    }
    window.count += 1;
    return window.count <= limit;
  }

  private prune(now: number) {
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(key);
    }
  }

  async onModuleDestroy() {
    if (this.redis?.isOpen) await this.redis.quit();
  }
}
