import { Injectable, Logger } from '@nestjs/common';

import { settings } from '../config/settings';

/** Cache tags on the website. Keep in sync with CACHE_TAGS in alldriveph-frontend/lib/api.ts. */
export type CacheTag = 'vehicles' | 'blog' | 'services' | 'partners' | 'faqs';

/**
 * Tells the public website to drop cached data after an admin edit.
 *
 * The Next.js site caches the fleet, blog and other content in memory. When staff save a change
 * to one of these, the mutation calls `revalidate` with the matching cache tags and we POST them
 * to the site's /api/revalidate endpoint, so visitors see the change on their next page load.
 */
@Injectable()
export class RevalidateService {
  private readonly logger = new Logger(RevalidateService.name);

  /** Fire and forget, so the admin response is never slowed down by the website. */
  revalidate(tags: CacheTag[]): void {
    if (!tags.length || !settings.revalidateUrl || !settings.revalidateSecret)
      return;
    void this.notify(tags);
  }

  async notify(tags: CacheTag[]): Promise<void> {
    try {
      const res = await fetch(settings.revalidateUrl!, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-revalidate-secret': settings.revalidateSecret!,
        },
        body: JSON.stringify({ tags }),
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (error) {
      // the edit is saved either way; the cache self heals within the hour
      this.logger.warn(
        `Website cache refresh failed for ${tags.join(', ')}: ${String(error)}`,
      );
    }
  }
}
