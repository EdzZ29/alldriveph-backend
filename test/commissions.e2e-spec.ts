import type { NestFastifyApplication } from '@nestjs/platform-fastify';

import {
  ApiClient,
  adminClient,
  createApp,
  period,
  resetDatabase,
} from './helpers';

describe('branch commissions', () => {
  let app: NestFastifyApplication;
  let admin: ApiClient;
  let vid: string;
  let day = 400;

  /** A Butuan booking taken through to the given status. */
  const booking = async (
    statuses: string[],
  ): Promise<{ id: string; reference: string; total_amount: number }> => {
    const [pickup, ret] = period((day += 3), 3);
    const created = (
      await new ApiClient(app).call({
        create_booking: {
          input: {
            vehicle_id: vid,
            pickup_at: pickup,
            return_at: ret,
            pickup_location: 'butuan-airport',
            return_location: 'butuan-city',
            customer_name: 'Commission Test',
            customer_email: 'commission@example.com',
            customer_phone: '+63 917 555 0177',
            license_number: 'N01-23-777777',
            accept_terms: true,
          },
        },
      })
    ).create_booking as { id: string; reference: string; total_amount: number };
    for (const status of statuses) {
      await admin.call({
        update_booking: { id: created.id, input: { status } },
      });
    }
    return created;
  };

  const owner = async (branch: string, role = 'owner') => {
    const email = `commission-${role}-${branch}@alldrive-test.com`;
    await admin.call({
      create_user: {
        input: {
          email,
          full_name: `${branch} ${role}`,
          password: 'OwnerPass1234',
          role,
          branch: role === 'owner' ? branch : null,
        },
      },
    });
    const client = new ApiClient(app);
    await client.login(email, 'OwnerPass1234');
    return client;
  };

  beforeAll(async () => {
    app = await createApp();
    await resetDatabase(app);
    admin = await adminClient(app);
    vid = (await admin.call({ vehicle: { slug: 'test-vios' } })).vehicle.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('a completed booking owes Alldrive 10%, recorded once', async () => {
    const done = await booking(['confirmed', 'ongoing', 'completed']);
    await booking(['cancelled']);
    await booking(['confirmed']);

    const { commissions } = await admin.call({ commissions: {} });
    expect(commissions.total).toBe(1);
    expect(commissions.items[0]).toMatchObject({
      branch: 'butuan',
      booking_total: done.total_amount,
      rate: 0.1,
      amount: Math.round(done.total_amount * 10) / 100,
      status: 'unpaid',
      paid_at: null,
      booking: {
        reference: done.reference,
        customer_name: 'Commission Test',
        vehicle_name: 'Toyota Vios Test',
      },
    });

    const summary = (await admin.call({ commission_summary: {} }))
      .commission_summary;
    expect(summary).toMatchObject({
      rate: 0.1,
      unpaid_count: 1,
      unpaid_amount: commissions.items[0].amount,
      paid_count: 0,
      paid_amount: 0,
    });
    expect(
      summary.branches.map((b: { branch: string }) => b.branch).sort(),
    ).toEqual(['butuan', 'cagayan-de-oro', 'davao']);
  });

  it('owners see their own branch; only admins record payments', async () => {
    const butuan = await owner('butuan');
    const davao = await owner('davao');
    const staff = await owner('davao', 'staff');

    const mine = (await butuan.call({ commissions: {} })).commissions;
    expect(mine.total).toBe(1);
    expect(
      (await davao.call({ commissions: { branch: 'butuan' } })).commissions
        .total,
    ).toBe(0);
    const davaoSummary = (await davao.call({ commission_summary: {} }))
      .commission_summary;
    expect(davaoSummary.unpaid_count).toBe(0);
    expect(davaoSummary.branches).toHaveLength(1);
    expect((await staff.call({ commissions: {} })).commissions.total).toBe(1);

    const id = mine.items[0].id as string;
    for (const client of [butuan, staff]) {
      const error = await client.error({
        update_commissions: { ids: [id], status: 'paid' },
      });
      expect(error.code).toBe('FORBIDDEN');
    }

    const paid = await admin.call({
      update_commissions: {
        ids: [id],
        status: 'paid',
        payment_note: 'GCash ref 1234 5678',
      },
    });
    expect(paid.update_commissions.updated).toBe(1);
    const after = (await butuan.call({ commissions: {} })).commissions.items[0];
    expect(after).toMatchObject({
      status: 'paid',
      paid_by: 'Test Admin',
      payment_note: 'GCash ref 1234 5678',
    });
    expect(after.paid_at).not.toBeNull();
    const summary = (await butuan.call({ commission_summary: {} }))
      .commission_summary;
    expect(summary).toMatchObject({ unpaid_count: 0, paid_count: 1 });

    // paying again changes nothing; undoing clears the payment
    expect(
      (
        await admin.call({
          update_commissions: { ids: [id], status: 'paid' },
        })
      ).update_commissions.updated,
    ).toBe(0);
    await admin.call({ update_commissions: { ids: [id], status: 'unpaid' } });
    expect(
      (await admin.call({ commissions: { status: 'unpaid' } })).commissions
        .items[0],
    ).toMatchObject({
      id,
      status: 'unpaid',
      payment_note: null,
      paid_by: null,
    });

    // a whole branch can be settled at once
    await booking(['confirmed', 'ongoing', 'completed']);
    expect(
      (await butuan.error({ settle_branch_commissions: { branch: 'butuan' } }))
        .code,
    ).toBe('FORBIDDEN');
    const settled = await admin.call({
      settle_branch_commissions: {
        branch: 'butuan',
        payment_note: 'Bank transfer',
      },
    });
    expect(settled.settle_branch_commissions.updated).toBe(2);
    expect(
      (await butuan.call({ commission_summary: {} })).commission_summary,
    ).toMatchObject({ unpaid_count: 0, paid_count: 2 });
  });
});
