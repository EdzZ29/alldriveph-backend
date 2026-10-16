import type { NestFastifyApplication } from '@nestjs/platform-fastify';

import {
  ApiClient,
  adminClient,
  createApp,
  period,
  resetDatabase,
} from './helpers';

/** Reads Server-Sent Events from a live stream until `count` events arrived or time ran out. */
async function readEvents(
  url: string,
  headers: Record<string, string>,
  count: number,
  trigger: () => Promise<unknown>,
): Promise<{
  status: number;
  type: string | null;
  events: { event: string; data: any }[];
}> {
  const controller = new AbortController();
  const res = await fetch(url, { headers, signal: controller.signal });
  const events: { event: string; data: any }[] = [];
  if (res.status !== 200 || !res.body) {
    controller.abort();
    return {
      status: res.status,
      type: res.headers.get('content-type'),
      events,
    };
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const timeout = setTimeout(() => controller.abort(), 5_000);
  // the stream is open once its first bytes (the retry hint) arrive
  const first = await reader.read();
  buffer += decoder.decode(first.value, { stream: true });
  await trigger();
  try {
    while (events.length < count) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let end: number;
      while ((end = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const event = /^event: (.+)$/m.exec(block)?.[1];
        const data = /^data: (.+)$/m.exec(block)?.[1];
        if (event && data) events.push({ event, data: JSON.parse(data) });
      }
    }
  } catch {
    // aborted by the timeout
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
  return { status: res.status, type: res.headers.get('content-type'), events };
}

describe('website chat', () => {
  let app: NestFastifyApplication;
  let base: string;

  beforeAll(async () => {
    app = await createApp();
    await resetDatabase(app);
    await app.listen(0, '127.0.0.1');
    base = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  });

  afterAll(async () => {
    await app?.close();
  });

  it('answers common questions and hands the rest to the team', async () => {
    const admin = await adminClient(app);
    await admin.call({
      create_faq: {
        input: {
          question: 'Is fuel included in the rental price?',
          answer: 'Fuel is not included. Return the car with the same level.',
        },
      },
    });
    const visitor = new ApiClient(app);

    // a matching question gets the FAQ answer straight away
    const started = (
      await visitor.call({
        chat_start: {
          message: 'Hi, is fuel included in the price?',
          lang: 'en',
          page: '/fleet',
        },
      })
    ).chat_start;
    expect(started.token.length).toBeGreaterThanOrEqual(20);
    expect(started.messages.map((m: { sender: string }) => m.sender)).toEqual([
      'visitor',
      'bot',
    ]);
    expect(started.messages[1].body).toContain('Fuel is not included');

    // anything else: the team is notified, once
    const access = { id: started.id, token: started.token };
    const other = (
      await visitor.call({
        chat_send: {
          ...access,
          message: 'Can you deliver to my hotel at 5am?',
        },
      })
    ).chat_send.messages;
    expect(other.map((m: { sender: string }) => m.sender)).toEqual([
      'visitor',
      'bot',
    ]);
    expect(other[1].body).toContain('team has been notified');
    const again = (
      await visitor.call({
        chat_send: { ...access, message: 'It is the Marco Polo hotel' },
      })
    ).chat_send.messages;
    expect(again.map((m: { sender: string }) => m.sender)).toEqual(['visitor']);

    // the conversation is private to the browser that holds the secret
    const wrong = await visitor.error({
      chat_messages: { id: started.id, token: 'x'.repeat(32) },
    });
    expect(wrong.status).toBe(404);
    const history = (await visitor.call({ chat_messages: access }))
      .chat_messages;
    expect(history.messages).toHaveLength(5);

    // staff see it in the inbox, unread, and their reply quiets the bot
    expect(
      (await admin.call({ chat_unread: {} })).chat_unread.conversations,
    ).toBe(1);
    const inbox = (await admin.call({ chats: {} })).chats;
    expect(inbox.items[0]).toMatchObject({
      id: started.id,
      staff_unread: 3,
      page: '/fleet',
    });
    expect(inbox.items[0]).not.toHaveProperty('token_hash');
    const opened = (await admin.call({ chat: { id: started.id } })).chat;
    expect(opened.messages).toHaveLength(5);
    expect(
      (await admin.call({ chat_unread: {} })).chat_unread.conversations,
    ).toBe(0);

    const reply = (
      await admin.call({
        chat_reply: { id: started.id, message: 'Yes, we can deliver at 5am.' },
      })
    ).chat_reply;
    expect(reply).toMatchObject({ sender: 'staff', author: 'Test Admin' });
    const afterStaff = (
      await visitor.call({
        chat_send: { ...access, message: 'Is fuel included in the price?' },
      })
    ).chat_send.messages;
    expect(afterStaff.map((m: { sender: string }) => m.sender)).toEqual([
      'visitor',
    ]);

    const closed = (
      await admin.call({ update_chat: { id: started.id, status: 'closed' } })
    ).update_chat;
    expect(closed.status).toBe('closed');

    // visitors cannot read the inbox
    for (const op of ['chats', 'chat_unread']) {
      expect((await visitor.error({ [op]: {} })).code).toBe('UNAUTHENTICATED');
    }
    expect(
      (await visitor.error({ chat_reply: { id: started.id, message: 'hi' } }))
        .code,
    ).toBe('UNAUTHENTICATED');
  });

  it('streams new messages live to the visitor and to staff', async () => {
    const admin = await adminClient(app);
    const visitor = new ApiClient(app);
    const { id, token } = (
      await visitor.call({ chat_start: { message: 'Hello, anyone there?' } })
    ).chat_start;

    // the visitor's stream gets the staff reply the moment it is sent
    const mine = await readEvents(
      `${base}/api/v1/events?chat=${id}&token=${token}`,
      {},
      1,
      () => admin.call({ chat_reply: { id, message: 'Hi! How can we help?' } }),
    );
    expect(mine.status).toBe(200);
    expect(mine.type).toContain('text/event-stream');
    expect(mine.events[0]).toMatchObject({
      event: 'message',
      data: {
        conversation_id: id,
        sender: 'staff',
        body: 'Hi! How can we help?',
      },
    });

    // staff hear new visitor messages (and the inbox summary) as they arrive
    const staff = await readEvents(
      `${base}/api/v1/events`,
      { authorization: admin.headers.authorization },
      2,
      () =>
        visitor.call({
          chat_send: { id, token, message: 'I need a van tomorrow' },
        }),
    );
    expect(staff.events.map((e) => e.event)).toEqual([
      'message',
      'conversation',
    ]);
    expect(staff.events[0].data).toMatchObject({
      sender: 'visitor',
      body: 'I need a van tomorrow',
    });

    // no stream without the secret or a staff session
    const stranger = await readEvents(
      `${base}/api/v1/events?chat=${id}&token=${'y'.repeat(32)}`,
      {},
      0,
      async () => {},
    );
    expect(stranger.status).toBe(404);
    const anonymous = await readEvents(
      `${base}/api/v1/events`,
      {},
      0,
      async () => {},
    );
    expect(anonymous.status).toBe(401);
  });

  it('notifies the admin panel of new bookings and contact messages live', async () => {
    const admin = await adminClient(app);
    const visitor = new ApiClient(app);
    const vid = (await visitor.call({ vehicle: { slug: 'test-vios' } })).vehicle
      .id as string;
    const [pickup, ret] = period(200, 2);
    const book = () =>
      visitor.call({
        create_booking: {
          input: {
            vehicle_id: vid,
            pickup_at: pickup,
            return_at: ret,
            pickup_location: 'butuan-city',
            return_location: 'butuan-city',
            customer_name: 'Live Test',
            customer_email: 'live@example.com',
            customer_phone: '+63 917 555 0123',
            license_number: 'N01-11-222222',
            accept_terms: true,
          },
        },
      });

    const staff = await readEvents(
      `${base}/api/v1/events`,
      { authorization: admin.headers.authorization },
      2,
      async () => {
        await book();
        await visitor.call({
          send_contact_message: {
            input: {
              name: 'Ana',
              email: 'ana@example.com',
              subject: 'Group rate',
              message: 'Do you have rates for 3 vans?',
            },
          },
        });
      },
    );
    expect(staff.events.map((e) => e.event)).toEqual(['booking', 'contact']);
    expect(staff.events[0].data).toMatchObject({
      customer_name: 'Live Test',
      vehicle_name: 'Toyota Vios Test',
      branch: 'butuan',
      change: 'created',
      status: 'pending',
    });
    expect(staff.events[1].data).toMatchObject({
      name: 'Ana',
      subject: 'Group rate',
    });

    // a branch owner hears only the bookings of their own branch, nothing else
    const owner = async (branch: string) => {
      const email = `live-owner-${branch}@alldrive-test.com`;
      await admin.call({
        create_user: {
          input: {
            email,
            full_name: 'Owner',
            password: 'OwnerPass1234',
            role: 'owner',
            branch,
          },
        },
      });
      const client = new ApiClient(app);
      await client.login(email, 'OwnerPass1234');
      return client.headers.authorization;
    };
    const [later, laterReturn] = period(210, 2);
    const bookLater = () =>
      visitor.call({
        create_booking: {
          input: {
            vehicle_id: vid,
            pickup_at: later,
            return_at: laterReturn,
            pickup_location: 'butuan-airport',
            return_location: 'butuan-city',
            customer_name: 'Owner Test',
            customer_email: 'owner@example.com',
            customer_phone: '+63 917 555 0124',
            license_number: 'N01-11-333333',
            accept_terms: true,
          },
        },
      });
    const butuan = await readEvents(
      `${base}/api/v1/events`,
      { authorization: await owner('butuan') },
      1,
      async () => {
        await visitor.call({
          chat_start: { message: 'Owners should not see this' },
        });
        await bookLater();
      },
    );
    expect(butuan.events).toHaveLength(1);
    expect(butuan.events[0]).toMatchObject({
      event: 'booking',
      data: { customer_name: 'Owner Test', branch: 'butuan' },
    });

    const davao = await readEvents(
      `${base}/api/v1/events`,
      { authorization: await owner('davao') },
      1,
      () =>
        admin.call({
          update_booking: {
            id: butuan.events[0].data.id,
            input: { status: 'confirmed' },
          },
        }),
    );
    expect(davao.status).toBe(200);
    expect(davao.events).toHaveLength(0);
  });

  it("updates the customer's tracking page live when staff confirm", async () => {
    const admin = await adminClient(app);
    const visitor = new ApiClient(app);
    const vid = (await visitor.call({ vehicle: { slug: 'test-vios' } })).vehicle
      .id as string;
    const [pickup, ret] = period(230, 2);
    const booking = (
      await visitor.call({
        create_booking: {
          input: {
            vehicle_id: vid,
            pickup_at: pickup,
            return_at: ret,
            pickup_location: 'butuan-city',
            return_location: 'butuan-city',
            customer_name: 'Track Live',
            customer_email: 'track@example.com',
            customer_phone: '+63 917 555 0125',
            license_number: 'N01-11-444444',
            accept_terms: true,
          },
        },
      })
    ).create_booking as { id: string; reference: string };

    const page = await readEvents(
      `${base}/api/v1/events?booking=${booking.reference.toLowerCase()}&email=Track@Example.com`,
      {},
      1,
      () =>
        admin.call({
          update_booking: { id: booking.id, input: { status: 'confirmed' } },
        }),
    );
    expect(page.events[0]).toMatchObject({
      event: 'booking',
      data: { id: booking.id, status: 'confirmed' },
    });

    const wrong = await readEvents(
      `${base}/api/v1/events?booking=${booking.reference}&email=someone@example.com`,
      {},
      0,
      async () => {},
    );
    expect(wrong.status).toBe(404);
  });
});
