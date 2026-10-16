import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { DataSource, In, MoreThanOrEqual } from 'typeorm';

import type { RequestContext } from '../../common/context';
import { branchLocations } from '../../common/constants';
import { BookingStatus } from '../../common/enums';
import { AppError } from '../../common/errors';
import { read, type Operations } from '../../common/operations';
import { bookingUpcoming } from '../../common/views';
import { settings } from '../../config/settings';
import { Booking } from '../../entities/booking.entity';

// business months follow Philippine time (UTC+8, no daylight saving), not UTC
const MANILA = 'Asia/Manila';
const MANILA_OFFSET_MS = 8 * 3_600_000;
const REVENUE_STATUSES = [
  BookingStatus.confirmed,
  BookingStatus.ongoing,
  BookingStatus.completed,
];

/** Start of a Manila calendar month, as a UTC instant. */
function manilaMonthStart(year: number, monthIndex: number): Date {
  return new Date(Date.UTC(year, monthIndex, 1) - MANILA_OFFSET_MS);
}

const monthKey = (year: number, monthIndex: number) =>
  `${year}-${String(monthIndex + 1).padStart(2, '0')}`;

const FORMATS: Record<string, string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
};

@Injectable()
export class AdminOperations {
  constructor(private readonly dataSource: DataSource) {}

  readonly operations: Operations = {
    /** Dashboard figures for the current Manila month; a branch owner gets their branch only. */
    stats: read(async (ctx) => {
      const { branch } = await ctx.requireBookingViewer();
      return this.stats(branch);
    }),
  };

  private async stats(branch: string | null) {
    const now = new Date();
    const local = new Date(now.getTime() + MANILA_OFFSET_MS);
    const year = local.getUTCFullYear();
    const month = local.getUTCMonth();
    const monthStart = manilaMonthStart(year, month);
    const nextMonthStart = manilaMonthStart(year, month + 1);
    const seriesStart = manilaMonthStart(year, month - 5);
    const db = this.dataSource;
    // a branch owner's figures: bookings picked up at their branch, and the cars kept there
    const points = branch ? branchLocations(branch) : null;
    const inBranch = (param: number) =>
      `($${param}::varchar[] IS NULL OR pickup_location = ANY($${param}))`;

    // independent figures: run them in parallel on separate pool connections
    const [byStatus, totals, monthlyRows, upcoming] = await Promise.all([
      db.query<{ status: string; count: string }[]>(
        `SELECT status, count(*) AS count FROM bookings WHERE ${inBranch(1)} GROUP BY status`,
        [points],
      ),
      db.query<Record<string, string>[]>(
        `SELECT
           (SELECT coalesce(sum(total_amount), 0) FROM bookings
             WHERE status = ANY($1) AND pickup_at >= $2 AND pickup_at < $3 AND ${inBranch(4)}) AS revenue_month,
           (SELECT count(*) FROM bookings WHERE created_at >= $2 AND ${inBranch(4)}) AS bookings_month,
           (SELECT count(*) FROM vehicles WHERE is_active AND ($5::varchar IS NULL OR branch = $5)) AS active_fleet,
           (SELECT count(DISTINCT vehicle_id) FROM bookings WHERE status = 'ongoing' AND ${inBranch(4)}) AS on_road,
           (SELECT CASE WHEN $5::varchar IS NULL THEN count(*) ELSE 0 END
              FROM contact_messages WHERE NOT is_read) AS unread`,
        [REVENUE_STATUSES, monthStart, nextMonthStart, points, branch],
      ),
      db.query<{ m: string; revenue: string; bookings: string }[]>(
        `SELECT to_char(date_trunc('month', timezone($1, pickup_at)), 'YYYY-MM') AS m,
                sum(total_amount) AS revenue, count(*) AS bookings
           FROM bookings
          WHERE status = ANY($2) AND pickup_at >= $3 AND pickup_at < $4 AND ${inBranch(5)}
          GROUP BY m ORDER BY m`,
        [MANILA, REVENUE_STATUSES, seriesStart, nextMonthStart, points],
      ),
      db.manager.find(Booking, {
        where: {
          status: In([BookingStatus.pending, BookingStatus.confirmed]),
          pickup_at: MoreThanOrEqual(now),
          ...(points ? { pickup_location: In(points) } : {}),
        },
        order: { pickup_at: 'ASC' },
        take: 6,
      }),
    ]);

    const counts = Object.fromEntries(
      byStatus.map((row) => [row.status, Number(row.count)]),
    );
    const series = new Map(monthlyRows.map((row) => [row.m, row]));
    const monthly: { month: string; revenue: number; bookings: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const date = new Date(Date.UTC(year, month - i, 1));
      const key = monthKey(date.getUTCFullYear(), date.getUTCMonth());
      const row = series.get(key);
      monthly.push({
        month: key,
        revenue: row ? Number(row.revenue) : 0,
        bookings: row ? Number(row.bookings) : 0,
      });
    }
    const [figures] = totals;
    const activeFleet = Number(figures.active_fleet);
    const onRoad = Number(figures.on_road);
    return {
      revenue_month: Number(figures.revenue_month),
      bookings_month: Number(figures.bookings_month),
      pending: counts.pending ?? 0,
      confirmed: counts.confirmed ?? 0,
      ongoing: counts.ongoing ?? 0,
      completed: counts.completed ?? 0,
      cancelled: counts.cancelled ?? 0,
      active_fleet: activeFleet,
      on_road: onRoad,
      utilization: activeFleet
        ? Math.round((onRoad / activeFleet) * 1000) / 10
        : 0,
      unread_messages: Number(figures.unread),
      monthly,
      upcoming: upcoming.map(bookingUpcoming),
    };
  }

  /**
   * Staff and branch owners. Stores a JPG, PNG or WEBP image and returns its URL. Reached by sending the file
   * as multipart/form-data to the API endpoint.
   */
  async uploadImage(
    ctx: RequestContext,
    readFile: () => Promise<Buffer | undefined>,
  ): Promise<{ url: string }> {
    // staff, and branch owners adding photos of their cars
    await ctx.requireBranchManager();
    const content = await readFile();
    if (!content?.length) throw new AppError(400, 'Attach an image file');

    let format: string | undefined;
    try {
      format = (await sharp(content).metadata()).format;
    } catch {
      throw new AppError(415, 'File is not a valid image');
    }
    const extension = format ? FORMATS[format] : undefined;
    if (!extension) throw new AppError(415, 'Use JPG, PNG or WEBP images');

    const now = new Date();
    const folder = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const name = `${randomUUID().replaceAll('-', '')}.${extension}`;
    await mkdir(join(settings.mediaDir, folder), { recursive: true });
    await writeFile(join(settings.mediaDir, folder, name), content);
    return { url: `${settings.mediaUrlPrefix}/${folder}/${name}` };
  }
}
