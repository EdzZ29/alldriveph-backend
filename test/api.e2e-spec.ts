import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import sharp from 'sharp';

import {
  ApiClient,
  adminClient,
  createApp,
  period,
  resetDatabase,
} from './helpers';

const ZONE_RATES = { local: 1300, region: 1800, cities: 2300, mindanao: 2800 };

async function vehicleId(client: ApiClient): Promise<string> {
  const data = await client.call({ vehicle: { slug: 'test-vios' } });
  return data.vehicle.id as string;
}

function trip(
  vid: string,
  pickup: string,
  ret: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    vehicle_id: vid,
    pickup_at: pickup,
    return_at: ret,
    pickup_location: 'butuan-city',
    return_location: 'butuan-city',
    ...overrides,
  };
}

function bookingPayload(
  vid: string,
  pickup: string,
  ret: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ...trip(vid, pickup, ret, { return_location: 'davao-airport' }),
    service_type: 'self_drive',
    extras: [],
    customer_name: 'Maria Santos',
    customer_email: 'Maria@Example.com',
    customer_phone: '+63 917 555 0101',
    license_number: 'N01-23-456789',
    accept_terms: true,
    ...overrides,
  };
}

describe('API', () => {
  let app: NestFastifyApplication;
  let client: ApiClient;

  const quote = async (input: Record<string, unknown>): Promise<any> => {
    const data = await client.call({ quote: input });
    return data.quote;
  };

  beforeAll(async () => {
    app = await createApp();
    await resetDatabase(app);
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    // a fresh, signed out client per test
    client = new ApiClient(app);
  });

  it('booking keeps the optional exact pickup and return spots', async () => {
    const vid = await vehicleId(client);
    const [pickup, ret] = period(120, 2);
    const withSpots = (
      await client.call({
        create_booking: {
          input: bookingPayload(vid, pickup, ret, {
            pickup_address: '  Gaisano Mall main entrance  ',
            return_address: 'Davao airport arrivals, door 3',
          }),
        },
      })
    ).create_booking;
    expect(withSpots.pickup_address).toBe('Gaisano Mall main entrance');
    expect(withSpots.return_address).toBe('Davao airport arrivals, door 3');

    // both are optional; blank means the branch itself
    const [later, laterReturn] = period(130, 2);
    const without = (
      await client.call({
        create_booking: {
          input: bookingPayload(vid, later, laterReturn, {
            pickup_address: '   ',
          }),
        },
      })
    ).create_booking;
    expect(without.pickup_address).toBeNull();
    expect(without.return_address).toBeNull();

    const tooLong = await client.error({
      create_booking: {
        input: bookingPayload(vid, later, laterReturn, {
          pickup_address: 'x'.repeat(301),
        }),
      },
    });
    expect(tooLong.op).toBe('create_booking');
    expect(tooLong.errors[0].field).toBe('pickup_address');
  });

  it('health', async () => {
    const res = await app
      .getHttpAdapter()
      .getInstance()
      .inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().database).toBe(true);
  });

  it('meta lists locations and extras', async () => {
    const { meta } = await client.call({ meta: {} });
    expect(meta.locations.some((loc) => loc.code === 'davao-airport')).toBe(
      true,
    );
    expect(meta.extras.some((extra) => extra.code === 'child-seat')).toBe(true);
  });

  it('public responses leave out staff only fields', async () => {
    const { vehicle, vehicles } = await client.call({
      vehicle: { slug: 'test-vios' },
      vehicles: {},
    });
    expect(vehicle).toMatchObject({
      name: 'Toyota Vios Test',
      daily_rate: 2000,
      features: ['Bluetooth'],
    });
    for (const field of [
      'plate_number',
      'is_active',
      'sort_order',
      'created_at',
    ])
      expect(vehicle).not.toHaveProperty(field);
    // list pages skip the long description and feature list
    expect(vehicles[0]).not.toHaveProperty('features');
    expect(vehicles[0]).not.toHaveProperty('description');
  });

  it('one request can ask for several things', async () => {
    const data: Record<string, unknown> = await client.call({
      meta: {},
      vehicles: {},
      faqs: {},
    });
    expect(Object.keys(data).sort()).toEqual(['faqs', 'meta', 'vehicles']);
  });

  it('bad requests are refused clearly', async () => {
    expect((await client.error({ nope: {} })).message).toBe(
      'Unknown operation: nope',
    );
    expect((await client.error({})).status).toBe(400);
    const many = Object.fromEntries(
      Array.from({ length: 21 }, (_, i) => [`op${i}`, {}]),
    );
    expect((await client.error(many)).status).toBe(400);
    // unknown arguments never reach the database
    const unknown = await client.error({ vehicles: { colour: 'red' } });
    expect(unknown.status).toBe(422);
    expect(unknown.errors[0].field).toBe('colour');
    const notJson = await client.post(Buffer.from('[1]'), {
      'content-type': 'application/json',
    });
    expect(notJson.statusCode).toBe(400);
  });

  it('quote breakdown with driver and extras', async () => {
    const vid = await vehicleId(client);
    const [pickup, ret] = period(3, 2);
    const q = await quote(
      trip(vid, pickup, ret, {
        service_type: 'with_driver',
        extras: ['child-seat', 'delivery'],
      }),
    );
    expect(q.days).toBe(2);
    expect(q.base_amount).toBe(4000);
    expect(q.driver_amount).toBe(3000);
    expect(q.extras_amount).toBe(250 * 2 + 800);
    expect(q.total_amount).toBe(4000 + 3000 + 1300);
    expect(q.available).toBe(true);
  });

  it('long rental discount', async () => {
    const vid = await vehicleId(client);
    const [pickup, ret] = period(40, 7);
    const q = await quote(trip(vid, pickup, ret));
    expect(q.days).toBe(7);
    expect(q.discount_amount).toBe(1400);
    expect(q.total_amount).toBe(14000 - 1400);
  });

  it('partial day rounds up', async () => {
    const vid = await vehicleId(client);
    const [pickup, ret] = period(50, 1.5);
    expect((await quote(trip(vid, pickup, ret))).days).toBe(2);
  });

  it('rejects pickup in the past', async () => {
    const vid = await vehicleId(client);
    const [pickup, ret] = period(-1, 2);
    const error = await client.error({
      create_booking: { input: bookingPayload(vid, pickup, ret) },
    });
    expect(error.status).toBe(422);
  });

  it('self drive requires license', async () => {
    const vid = await vehicleId(client);
    const [pickup, ret] = period(5, 2);
    const error = await client.error({
      create_booking: {
        input: bookingPayload(vid, pickup, ret, { license_number: null }),
      },
    });
    expect(error.code).toBe('BAD_USER_INPUT');
    expect(error.message.toLowerCase()).toContain('license');
  });

  it('field errors name the field', async () => {
    const vid = await vehicleId(client);
    const [pickup, ret] = period(5, 2);
    const error = await client.error({
      quote: trip(vid, pickup, ret, { pickup_location: 'manila' }),
    });
    expect(error.message).toBe('Unknown location');
    expect(error.errors).toEqual([
      { field: 'pickup_location', message: 'Unknown location' },
    ]);
  });

  it('booking flow, overlap and lookup', async () => {
    const admin = await adminClient(app);
    const vid = await vehicleId(client);
    const [pickup, ret] = period(10, 3);

    const booking = (
      await client.call({
        create_booking: { input: bookingPayload(vid, pickup, ret) },
      })
    ).create_booking;
    expect(booking.status).toBe('pending');
    expect(booking.reference.startsWith('AD-')).toBe(true);
    expect(booking.customer_email).toBe('maria@example.com');
    expect(booking.vehicle.slug).toBe('test-vios');
    // customers never see staff only fields
    expect(booking).not.toHaveProperty('admin_notes');
    expect(booking).not.toHaveProperty('license_number');

    // overlapping booking for the same car is refused
    const [overlapPickup, overlapRet] = period(11, 1);
    let error = await client.error({
      create_booking: { input: bookingPayload(vid, overlapPickup, overlapRet) },
    });
    expect(error.code).toBe('CONFLICT');

    // the car disappears from availability search for those dates, and the quote says so
    const data = await client.call({
      vehicles: { available_from: overlapPickup, available_to: overlapRet },
      quote: trip(vid, overlapPickup, overlapRet),
    });
    expect(data.vehicles.every((v) => v.id !== vid)).toBe(true);
    expect(data.quote.available).toBe(false);

    // lookup needs the matching email
    error = await client.error({
      track_booking: {
        reference: booking.reference,
        email: 'other@example.com',
      },
    });
    expect(error.code).toBe('NOT_FOUND');
    const found = await client.call({
      track_booking: {
        reference: booking.reference.toLowerCase(),
        email: 'maria@example.com',
      },
    });
    expect(found.track_booking.reference).toBe(booking.reference);
    expect(found.track_booking).not.toHaveProperty('admin_notes');

    // admin status workflow enforces valid transitions
    const bid = booking.id;
    error = await admin.error({
      update_booking: { id: bid, input: { status: 'completed' } },
    });
    expect(error.code).toBe('CONFLICT');
    let updated = (
      await admin.call({
        update_booking: {
          id: bid,
          input: { status: 'confirmed', admin_notes: 'Paid via GCash' },
        },
      })
    ).update_booking;
    expect(updated).toMatchObject({
      status: 'confirmed',
      admin_notes: 'Paid via GCash',
      license_number: 'N01-23-456789',
    });
    updated = (
      await admin.call({
        update_booking: { id: bid, input: { status: 'cancelled' } },
      })
    ).update_booking;
    expect(updated.status).toBe('cancelled');

    const detail = (await admin.call({ booking: { id: bid } })).booking;
    expect(detail.cancelled_at).not.toBeNull();
    const page = (await admin.call({ bookings: { q: booking.reference } }))
      .bookings;
    expect(page.total).toBe(1);
    expect(page.items[0]).toMatchObject({
      reference: booking.reference,
      vehicle: { name: 'Toyota Vios Test' },
    });

    // cancelled bookings free up the dates
    await client.call({
      create_booking: { input: bookingPayload(vid, overlapPickup, overlapRet) },
    });
  });

  it('admin operations require auth', async () => {
    for (const op of ['stats', 'bookings']) {
      const error = await client.error({ [op]: {} });
      expect(error.code).toBe('UNAUTHENTICATED');
      expect(error.op).toBe(op);
    }
    const error = await client.error({ vehicles: { include_inactive: true } });
    expect(error.status).toBe(401);
  });

  it('login rejects bad password', async () => {
    const error = await client.error({
      login: { email: 'admin@alldrive-test.com', password: 'wrong' },
    });
    expect(error.status).toBe(401);
  });

  it('login sets http only cookie', async () => {
    const res = await client.post({
      login: { email: 'admin@alldrive-test.com', password: 'SuperSecret123' },
    });
    expect(res.json().login.user).not.toHaveProperty('hashed_password');
    const cookie = [res.headers['set-cookie'] ?? []]
      .flat()
      .join('\n')
      .toLowerCase();
    expect(cookie).toContain('httponly');
    expect(cookie).toContain('samesite=lax');
    const { me } = await client.call({ me: {} });
    expect(me).toMatchObject({
      email: 'admin@alldrive-test.com',
      role: 'admin',
    });
    expect(me).not.toHaveProperty('hashed_password');
  });

  it('me is null when signed out', async () => {
    expect((await client.call({ me: {} })).me).toBeNull();
  });

  it('partners can carry a logo and a wide photo', async () => {
    const admin = await adminClient(app);
    const created = (
      await admin.call({
        create_partner: {
          input: {
            name: 'JMDC Genuine Auto Parts',
            category: 'Auto Parts & Repair',
            logo_url: null,
            image_url: '/AllDriveph-partners/JMDC.jpg',
          },
        },
      })
    ).create_partner;
    const { partners } = await client.call({ partners: {} });
    expect(partners).toContainEqual(
      expect.objectContaining({
        id: created.id,
        logo_url: null,
        image_url: '/AllDriveph-partners/JMDC.jpg',
      }),
    );
    await admin.call({ delete_partner: { id: created.id } });
  });

  it('admin crud and public visibility', async () => {
    const admin = await adminClient(app);
    const created = (
      await admin.call({
        create_faq: {
          input: {
            question: 'Do you allow pets?',
            answer: 'Yes, with a cleaning fee.',
            category: 'General',
          },
        },
      })
    ).create_faq;
    const faqId = created.id;
    expect(created.category).toBe('General');
    expect(
      (await client.call({ faqs: {} })).faqs.some((f) => f.id === faqId),
    ).toBe(true);

    await admin.call({
      update_faq: { id: faqId, input: { is_active: false } },
    });
    expect(
      (await client.call({ faqs: {} })).faqs.every((f) => f.id !== faqId),
    ).toBe(true);
    const hidden = await admin.call({ faqs: { include_inactive: true } });
    expect(hidden.faqs).toContainEqual(
      expect.objectContaining({ id: faqId, is_active: false }),
    );

    // unknown input fields are refused, so clients cannot write other columns
    const sneaky = await admin.error({
      update_faq: { id: faqId, input: { created_at: '2020-01-01T00:00:00Z' } },
    });
    expect(sneaky.status).toBe(422);

    const deleted = await admin.call({ delete_faq: { id: faqId } });
    expect(deleted.delete_faq).toBe(true);
    const missing = await admin.error({ delete_faq: { id: faqId } });
    expect(missing.code).toBe('NOT_FOUND');
    const badId = await admin.error({ delete_faq: { id: 'not-a-uuid' } });
    expect(badId.status).toBe(422);
  });

  it('blog drafts are hidden', async () => {
    const admin = await adminClient(app);
    const created = (
      await admin.call({
        create_post: {
          input: {
            title: 'Draft post title',
            excerpt: 'An excerpt that is long enough',
            content: 'Body text '.repeat(20),
          },
        },
      })
    ).create_post;
    const bySlug = { post: { slug: created.slug } };
    expect((await client.call(bySlug)).post).toBeNull();

    await admin.call({
      update_post: { id: created.id, input: { is_published: true } },
    });
    const { post } = await client.call(bySlug);
    expect(post.title).toBe('Draft post title');
    expect(post).not.toHaveProperty('is_published');

    const drafts = await admin.call({
      posts: { include_drafts: true, page_size: 1000 },
    });
    expect(drafts.posts.items[0]).toHaveProperty('is_published');
  });

  it('contact honeypot is not stored', async () => {
    const admin = await adminClient(app);
    const count = async () =>
      (await admin.call({ messages: {} })).messages.total as number;
    const before = await count();
    const payload: Record<string, string> = {
      name: 'Bot',
      email: 'bot@example.com',
      subject: 'Hi',
      message: 'Buy followers now please',
      website: 'spam',
    };
    await client.call({ send_contact_message: { input: payload } });
    delete payload.website;
    await client.call({ send_contact_message: { input: payload } });
    expect(await count()).toBe(before + 1);

    const [latest] = (await admin.call({ messages: { unread: true } })).messages
      .items;
    const read = await admin.call({
      update_message: { id: latest.id, is_read: true },
    });
    expect(read.update_message.is_read).toBe(true);
  });

  it('staff cannot manage users', async () => {
    const admin = await adminClient(app);
    await admin.call({
      create_user: {
        input: {
          email: 'staff@alldrive-test.com',
          full_name: 'Staff User',
          password: 'StaffPass1234',
          role: 'staff',
        },
      },
    });
    const staff = new ApiClient(app);
    await staff.login('staff@alldrive-test.com', 'StaffPass1234');
    const { stats } = await staff.call({ stats: {} });
    expect(stats.monthly).toHaveLength(6);
    const error = await staff.error({ users: {} });
    expect(error.code).toBe('FORBIDDEN');
    // only admins create accounts, whatever the role asked for
    for (const role of ['admin', 'staff', 'owner']) {
      const attempt = await staff.error({
        create_user: {
          input: {
            email: `made-by-staff-${role}@alldrive-test.com`,
            full_name: 'Not Allowed',
            password: 'StaffPass1234',
            role,
            branch: role === 'owner' ? 'davao' : null,
          },
        },
      });
      expect(attempt.code).toBe('FORBIDDEN');
    }
    const { users } = await admin.call({ users: {} });
    expect(users.length).toBeGreaterThanOrEqual(2);
    expect(users[0]).not.toHaveProperty('hashed_password');
  });

  it('branch owners see only the bookings made at their branch', async () => {
    const admin = await adminClient(app);
    const vid = await vehicleId(client);
    const [pickup, ret] = period(150, 2);
    const booked = (
      await client.call({
        create_booking: { input: bookingPayload(vid, pickup, ret) },
      })
    ).create_booking;

    // an owner needs a branch
    const noBranch = await admin.error({
      create_user: {
        input: {
          email: 'nobranch@alldrive-test.com',
          full_name: 'No Branch',
          password: 'OwnerPass1234',
          role: 'owner',
        },
      },
    });
    expect(noBranch.errors[0].field).toBe('branch');

    const owner = async (branch: string) => {
      const email = `owner-${branch}@alldrive-test.com`;
      const created = await admin.call({
        create_user: {
          input: {
            email,
            full_name: `${branch} owner`,
            password: 'OwnerPass1234',
            role: 'owner',
            branch,
          },
        },
      });
      expect(created.create_user).toMatchObject({ role: 'owner', branch });
      const c = new ApiClient(app);
      await c.login(email, 'OwnerPass1234');
      return c;
    };
    const butuan = await owner('butuan');
    const davao = await owner('davao');

    // the booking was picked up in Butuan
    const mine = (await butuan.call({ bookings: { page_size: 100 } })).bookings;
    expect(mine.items.some((b) => b.id === booked.id)).toBe(true);
    const butuanPoints = ['butuan-city', 'butuan-airport'];
    expect(
      mine.items.every((b: { pickup_location: string }) =>
        butuanPoints.includes(b.pickup_location),
      ),
    ).toBe(true);
    const all = (await admin.call({ bookings: { page_size: 100 } })).bookings;
    expect(all.total as number).toBeGreaterThanOrEqual(mine.total as number);

    // admins can narrow the list to one branch; an owner's own branch always wins
    const davaoOnly = (await admin.call({ bookings: { branch: 'davao' } }))
      .bookings;
    expect(davaoOnly.items.some((b) => b.id === booked.id)).toBe(false);
    const butuanOnly = (await admin.call({ bookings: { branch: 'butuan' } }))
      .bookings;
    expect(butuanOnly.items.find((b) => b.id === booked.id)).toMatchObject({
      reference: booked.reference,
      customer_email: 'maria@example.com',
      service_type: 'self_drive',
      return_location: 'davao-airport',
    });
    const sneaky = (await davao.call({ bookings: { branch: 'butuan' } }))
      .bookings;
    expect(sneaky.items.some((b) => b.id === booked.id)).toBe(false);

    const theirs = (await davao.call({ bookings: {} })).bookings;
    expect(theirs.items.some((b) => b.id === booked.id)).toBe(false);
    expect(
      (await davao.call({ booking: { id: booked.id } })).booking,
    ).toBeNull();
    expect(
      (await butuan.call({ booking: { id: booked.id } })).booking.reference,
    ).toBe(booked.reference);

    // dashboard figures are for their branch, without the shared inbox
    const stats = (await davao.call({ stats: {} })).stats;
    expect(stats.unread_messages).toBe(0);
    expect(stats.upcoming.some((b) => b.id === booked.id)).toBe(false);
    expect(
      (await butuan.call({ stats: {} })).stats.upcoming.some(
        (b) => b.id === booked.id,
      ),
    ).toBe(true);

    // owners confirm and cancel their own branch's bookings, not other branches'
    expect(
      (
        await davao.error({
          update_booking: { id: booked.id, input: { status: 'confirmed' } },
        })
      ).code,
    ).toBe('NOT_FOUND');
    const confirmed = (
      await butuan.call({
        update_booking: { id: booked.id, input: { status: 'confirmed' } },
      })
    ).update_booking;
    expect(confirmed.status).toBe('confirmed');

    // and run the fleet of their branch: list, add, edit, show or hide, but never move or delete
    const fleet = (await butuan.call({ vehicles: { include_inactive: true } }))
      .vehicles;
    expect(fleet.length).toBeGreaterThan(0);
    expect(fleet.every((v: { branch: string }) => v.branch === 'butuan')).toBe(
      true,
    );
    expect(
      (await davao.call({ vehicles: { include_inactive: true } })).vehicles,
    ).toEqual([]);
    const car = (
      await davao.call({
        create_vehicle: {
          input: {
            name: 'Davao Owner Avanza',
            brand: 'Toyota',
            model: 'Avanza',
            year: 2024,
            category: 'mpv',
            transmission: 'automatic',
            fuel_type: 'gasoline',
            seats: 7,
            daily_rate: 1800,
            image_url: '/images/cars/toyota-avanza.png',
            branch: 'davao',
          },
        },
      })
    ).create_vehicle;
    expect(car).toMatchObject({ branch: 'davao', is_active: true });
    const hidden = (
      await davao.call({
        update_vehicle: {
          id: car.id,
          input: { is_active: false, daily_rate: 1900 },
        },
      })
    ).update_vehicle;
    expect(hidden).toMatchObject({ is_active: false, daily_rate: 1900 });
    expect(
      (
        await davao.error({
          update_vehicle: { id: car.id, input: { branch: 'butuan' } },
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await butuan.error({
          update_vehicle: { id: car.id, input: { seats: 8 } },
        })
      ).code,
    ).toBe('NOT_FOUND');
    expect(
      (
        await butuan.error({
          create_vehicle: {
            input: {
              name: 'Elsewhere',
              brand: 'Toyota',
              model: 'Vios',
              year: 2024,
              category: 'sedan',
              transmission: 'automatic',
              fuel_type: 'gasoline',
              seats: 5,
              daily_rate: 1300,
              image_url: '/images/cars/x.png',
              branch: 'davao',
            },
          },
        })
      ).errors[0].field,
    ).toBe('branch');
    expect((await davao.error({ delete_vehicle: { id: car.id } })).code).toBe(
      'FORBIDDEN',
    );
    await admin.call({ delete_vehicle: { id: car.id } });

    // and see nothing else of the admin panel
    for (const ops of [
      { messages: {} },
      { users: {} },
      {
        create_user: {
          input: {
            email: 'made-by-owner@alldrive-test.com',
            full_name: 'Not Allowed',
            password: 'OwnerPass1234',
            role: 'staff',
          },
        },
      },
      { create_faq: { input: { question: 'Owner question?', answer: 'No' } } },
    ]) {
      expect((await butuan.error(ops)).code).toBe('FORBIDDEN');
    }
    expect((await butuan.call({ me: {} })).me).toMatchObject({
      role: 'owner',
      branch: 'butuan',
    });

    // moving an owner to staff clears the branch
    const davaoUser = (await admin.call({ users: {} })).users.find(
      (u) => u.email === 'owner-davao@alldrive-test.com',
    );
    const promoted = await admin.call({
      update_user: { id: davaoUser.id, input: { role: 'staff' } },
    });
    expect(promoted.update_user).toMatchObject({ role: 'staff', branch: null });
  });

  it('zone rates drive the price', async () => {
    const admin = await adminClient(app);
    const vid = await vehicleId(client);
    await admin.call({
      update_vehicle: { id: vid, input: { zone_rates: ZONE_RATES } },
    });
    const [pickup, ret] = period(60, 2);
    const base = trip(vid, pickup, ret);

    expect((await quote(base)).base_amount).toBe(2600);

    const far = await quote({ ...base, destination_zone: 'mindanao' });
    expect(far.base_amount).toBe(5600);
    expect(far.line_items[0].label).toContain('Rest of Mindanao');

    const bad = await client.error({
      quote: { ...base, destination_zone: 'luzon' },
    });
    expect(bad.status).toBe(422);

    const badRates = await admin.error({
      update_vehicle: { id: vid, input: { zone_rates: { butuan: 999 } } },
    });
    expect(badRates.status).toBe(422);

    // restore the plain base rate for other tests
    await admin.call({
      update_vehicle: { id: vid, input: { zone_rates: {} } },
    });
  });

  it('meta lists rate zones', async () => {
    const { zones } = (await client.call({ meta: {} })).meta;
    expect(zones.butuan.map((z: { code: string }) => z.code)).toEqual([
      'local',
      'region',
      'cities',
      'mindanao',
    ]);
    expect(zones.davao[1].name).toBe('Within Davao Region');
    expect(zones['cagayan-de-oro'][2].name).toBe('Butuan & Davao City');
  });

  it("pickup must be at the car's branch", async () => {
    const vid = await vehicleId(client);
    const [pickup, ret] = period(70, 2);
    const error = await client.error({
      quote: trip(vid, pickup, ret, {
        pickup_location: 'davao-city',
        return_location: 'davao-city',
      }),
    });
    expect(error.status).toBe(422);
    expect(error.message).toContain('Butuan');
  });

  it('fleet filters by branch', async () => {
    const butuan = (await client.call({ vehicles: { branch: 'butuan' } }))
      .vehicles;
    const davao = (await client.call({ vehicles: { branch: 'davao' } }))
      .vehicles;
    expect(butuan.some((v) => v.slug === 'test-vios')).toBe(true);
    expect(davao.every((v) => v.branch === 'davao')).toBe(true);
  });

  it('destination place sets the zone', async () => {
    const admin = await adminClient(app);
    const vid = await vehicleId(client);
    await admin.call({
      update_vehicle: { id: vid, input: { zone_rates: ZONE_RATES } },
    });
    const [pickup, ret] = period(80, 1);
    const base = trip(vid, pickup, ret);

    // the place wins over a cheaper zone sent by the client
    const q = await quote({
      ...base,
      destination: 'Iligan City',
      destination_zone: 'local',
    });
    expect(q.base_amount).toBe(2800);
    expect(q.line_items[0].label).toContain('Iligan City');

    const bad = await client.error({
      quote: { ...base, destination: 'Manila' },
    });
    expect(bad.status).toBe(422);

    const created = (
      await client.call({
        create_booking: {
          input: {
            ...base,
            destination: 'Surigao City',
            customer_name: 'Ana Reyes',
            customer_email: 'ana@alldrive-test.com',
            customer_phone: '+63 917 555 0199',
            license_number: 'N02-11-111111',
            accept_terms: true,
          },
        },
      })
    ).create_booking;
    expect(created.destination).toBe('Surigao City');
    expect(created.destination_zone).toBe('region');
    await admin.call({
      update_vehicle: { id: vid, input: { zone_rates: {} } },
    });
  });

  it("zones are relative to the car's branch", async () => {
    const admin = await adminClient(app);
    const vid = await vehicleId(client);
    const [pickup, ret] = period(90, 1);

    const quoteAt = async (branch: string, location: string): Promise<any> => {
      await admin.call({
        update_vehicle: { id: vid, input: { zone_rates: ZONE_RATES, branch } },
      });
      return quote(
        trip(vid, pickup, ret, {
          pickup_location: location,
          return_location: location,
          destination: 'Iligan City',
        }),
      );
    };

    // Iligan is far from Butuan, but within Northern Mindanao for a CDO car
    expect((await quoteAt('butuan', 'butuan-city')).base_amount).toBe(2800);
    expect(
      (await quoteAt('cagayan-de-oro', 'cagayan-de-oro-city')).base_amount,
    ).toBe(1800);
    await admin.call({
      update_vehicle: { id: vid, input: { zone_rates: {}, branch: 'butuan' } },
    });
  });

  it('dates without timezone are rejected', async () => {
    const error = await client.error({
      vehicles: {
        available_from: '2030-01-01T09:00:00',
        available_to: '2030-01-02T09:00:00',
      },
    });
    expect(error.status).toBe(422);
    expect(error.message).toContain('timezone');
    const garbage = await client.error({
      vehicles: { available_from: 'tomorrow+08:00' },
    });
    expect(garbage.status).toBe(422);
  });

  it('pagination', async () => {
    const { posts } = await client.call({ posts: { page_size: 1 } });
    expect(posts).toMatchObject({ page: 1, page_size: 1 });
    expect(posts.items.length).toBeLessThanOrEqual(1);
    expect(posts.pages).toBeGreaterThanOrEqual(1);
    const error = await client.error({ posts: { page_size: 1000 } });
    expect(error.status).toBe(422);
  });

  it('a request that writes runs its operations in order', async () => {
    const admin = await adminClient(app);
    const data = await admin.call({
      create_faq: {
        input: { question: 'Is fuel included?', answer: 'No, return it full.' },
      },
      faqs: { include_inactive: true },
    });
    expect(data.faqs.some((f) => f.id === data.create_faq.id)).toBe(true);
    await admin.call({ delete_faq: { id: data.create_faq.id } });
  });

  it('image upload over multipart', async () => {
    const admin = await adminClient(app);
    const png = await sharp({
      create: {
        width: 4,
        height: 4,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .png()
      .toBuffer();
    const boundary = '----alldrive-test-boundary';
    const multipart = (content: Buffer) =>
      Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="car.png"\r\n` +
            'Content-Type: image/png\r\n\r\n',
        ),
        content,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);
    const headers = {
      'content-type': `multipart/form-data; boundary=${boundary}`,
    };

    const res = await admin.post(multipart(png), headers);
    expect(res.statusCode).toBe(200);
    const url: string = res.json().upload_image.url;
    expect(url.startsWith('/media/')).toBe(true);
    expect(url.endsWith('.png')).toBe(true);

    const notImage = await admin.post(multipart(Buffer.from('hello')), headers);
    expect(notImage.statusCode).toBe(415);
    const anonymous = await client.post(multipart(png), headers);
    expect(anonymous.statusCode).toBe(401);
  });
});
