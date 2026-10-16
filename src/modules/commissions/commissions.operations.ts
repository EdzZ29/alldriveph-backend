import { Injectable, Logger } from '@nestjs/common';
import { DataSource, In } from 'typeorm';

import { BRANCH_CODES, LOCATION_BRANCH } from '../../common/constants';
import { LiveHub, type CommissionNotice } from '../../common/live.hub';
import { read, write, type Operations } from '../../common/operations';
import { paginate } from '../../common/pagination';
import { validateArgs } from '../../common/validation';
import { settings } from '../../config/settings';
import type { Booking } from '../../entities/booking.entity';
import { Commission } from '../../entities/commission.entity';
import {
  CommissionListArgs,
  CommissionPaymentArgs,
  CommissionSummaryArgs,
  SettleBranchArgs,
} from './commissions.inputs';

const cents = (pesos: number) => Math.round(pesos * 100) / 100;

export const commissionView = (c: Commission) => ({
  id: c.id,
  booking_id: c.booking_id,
  branch: c.branch,
  booking_total: c.booking_total,
  rate: c.rate,
  amount: c.amount,
  status: c.status,
  paid_at: c.paid_at,
  paid_by: c.paid_by,
  payment_note: c.payment_note,
  created_at: c.created_at,
  booking: {
    reference: c.booking.reference,
    customer_name: c.booking.customer_name,
    vehicle_name: c.booking.vehicle.name,
    pickup_at: c.booking.pickup_at,
    return_at: c.booking.return_at,
    days: c.booking.days,
  },
});

const notice = (
  c: Commission,
  change: CommissionNotice['change'],
): CommissionNotice => ({
  id: c.id,
  booking_id: c.booking_id,
  reference: c.booking.reference,
  branch: c.branch,
  amount: c.amount,
  status: c.status,
  change,
});

interface Totals {
  unpaid_amount: number;
  unpaid_count: number;
  paid_amount: number;
  paid_count: number;
  month_amount: number;
}

/**
 * Branch commissions: every completed booking earns Alldrive a share (COMMISSION_RATE, 10% by
 * default) of its total, owed by the owner of the branch it was picked up at. Admins record the
 * owners' payments; owners see their own branch; staff can look.
 */
@Injectable()
export class CommissionOperations {
  private readonly logger = new Logger(CommissionOperations.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly hub: LiveHub,
  ) {}

  readonly operations: Operations = {
    /** Commissions newest first, with the booking they came from. */
    commissions: read(async (ctx, args) => {
      const { branch } = await ctx.requireBookingViewer();
      const a = await validateArgs(CommissionListArgs, args);
      const query = this.dataSource
        .createQueryBuilder(Commission, 'c')
        .leftJoinAndSelect('c.booking', 'booking')
        .leftJoinAndSelect('booking.vehicle', 'vehicle')
        .orderBy('c.created_at', 'DESC');
      const only = branch ?? a.branch;
      if (only) query.andWhere('c.branch = :branch', { branch: only });
      if (a.status && a.status !== 'all')
        query.andWhere('c.status = :status', { status: a.status });
      return paginate(query, a.page ?? 1, a.page_size ?? 25, commissionView);
    }),

    /** Totals, overall and per branch (a branch owner gets their branch only). */
    commission_summary: read(async (ctx, args) => {
      const { branch } = await ctx.requireBookingViewer();
      const a = await validateArgs(CommissionSummaryArgs, args);
      const only = branch ?? a.branch ?? null;
      const rows = await this.dataSource.query<
        {
          branch: string;
          status: string;
          count: string;
          amount: string;
          month: string;
        }[]
      >(
        `SELECT branch, status, count(*) AS count, coalesce(sum(amount), 0) AS amount,
                coalesce(sum(amount) FILTER (
                  WHERE created_at >= date_trunc('month', now() AT TIME ZONE 'Asia/Manila') AT TIME ZONE 'Asia/Manila'
                ), 0) AS month
           FROM commissions
          WHERE ($1::varchar IS NULL OR branch = $1)
          GROUP BY branch, status`,
        [only],
      );
      const empty = (): Totals => ({
        unpaid_amount: 0,
        unpaid_count: 0,
        paid_amount: 0,
        paid_count: 0,
        month_amount: 0,
      });
      const total = empty();
      const byBranch = new Map<string, Totals>(
        (only ? [only] : BRANCH_CODES).map((code) => [code, empty()]),
      );
      for (const row of rows) {
        const branchTotals = byBranch.get(row.branch) ?? empty();
        byBranch.set(row.branch, branchTotals);
        for (const target of [total, branchTotals]) {
          const key = row.status === 'paid' ? 'paid' : 'unpaid';
          target[`${key}_amount`] = cents(
            target[`${key}_amount`] + Number(row.amount),
          );
          target[`${key}_count`] += Number(row.count);
          target.month_amount = cents(target.month_amount + Number(row.month));
        }
      }
      return {
        rate: settings.commissionRate,
        ...total,
        branches: [...byBranch].map(([code, totals]) => ({
          branch: code,
          ...totals,
        })),
      };
    }),

    /** Admin only. Marks every unpaid commission of a branch as paid, in one go. */
    settle_branch_commissions: write(async (ctx, args) => {
      await ctx.requireAdmin();
      const a = await validateArgs(SettleBranchArgs, args);
      const unpaid = await this.dataSource.manager.find(Commission, {
        where: { branch: a.branch, status: 'unpaid' },
        select: { id: true },
      });
      if (!unpaid.length) return { updated: 0 };
      return this.operations.update_commissions.run(ctx, {
        ids: unpaid.map((row) => row.id),
        status: 'paid',
        payment_note: a.payment_note ?? null,
      });
    }),

    /** Admin only. Records (or undoes) a branch owner's payment for one or more commissions. */
    update_commissions: write(async (ctx, args) => {
      const admin = await ctx.requireAdmin();
      const a = await validateArgs(CommissionPaymentArgs, args);
      const rows = await this.dataSource.manager.find(Commission, {
        where: { id: In(a.ids) },
      });
      const paid = a.status === 'paid';
      const changes = paid
        ? {
            status: 'paid' as const,
            paid_at: new Date(),
            paid_by: admin.full_name,
            payment_note: a.payment_note?.trim() || null,
          }
        : {
            status: 'unpaid' as const,
            paid_at: null,
            paid_by: null,
            payment_note: null,
          };
      const affected = rows.filter((row) => row.status !== a.status);
      if (affected.length) {
        await this.dataSource.manager.update(
          Commission,
          { id: In(affected.map((row) => row.id)) },
          changes,
        );
      }
      for (const row of affected) {
        Object.assign(row, changes);
        this.hub.publish({
          type: 'commission',
          commission: notice(row, paid ? 'paid' : 'unpaid'),
        });
      }
      return { updated: affected.length };
    }),
  };

  /**
   * Records the commission of a booking that was just completed. Safe to call twice: a booking
   * has at most one commission.
   */
  async recordFor(booking: Booking): Promise<void> {
    const manager = this.dataSource.manager;
    if (await manager.exists(Commission, { where: { booking_id: booking.id } }))
      return;
    const rate = settings.commissionRate;
    const commission = await manager.save(
      manager.create(Commission, {
        booking_id: booking.id,
        branch:
          LOCATION_BRANCH[booking.pickup_location] ?? booking.vehicle.branch,
        booking_total: booking.total_amount,
        rate,
        amount: cents(booking.total_amount * rate),
      }),
    );
    commission.booking = booking;
    this.logger.log(
      `Commission ${commission.amount} for ${booking.reference} (${commission.branch})`,
    );
    this.hub.publish({
      type: 'commission',
      commission: notice(commission, 'created'),
    });
  }
}
