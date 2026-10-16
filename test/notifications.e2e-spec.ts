import type { NestFastifyApplication } from '@nestjs/platform-fastify';

import { type Email, Mailer } from '../src/common/mailer.service';
import {
  ApiClient,
  adminClient,
  createApp,
  period,
  resetDatabase,
} from './helpers';

/** Waits for the background email of a booking to be recorded, and returns the history. */
async function notificationsOf(
  admin: ApiClient,
  id: string,
  count = 1,
): Promise<any[]> {
  for (let i = 0; i < 40; i++) {
    const { booking } = await admin.call({ booking: { id } });
    if (booking.notifications.length >= count)
      return booking.notifications as any[];
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('No notification was recorded');
}

describe('customer emails on confirmation and cancellation', () => {
  let app: NestFastifyApplication;
  let admin: ApiClient;
  let vid: string;
  let day = 300;

  const book = async (): Promise<{ id: string; reference: string }> => {
    const [pickup, ret] = period((day += 3), 2);
    const visitor = new ApiClient(app);
    const data = await visitor.call({
      create_booking: {
        input: {
          vehicle_id: vid,
          pickup_at: pickup,
          return_at: ret,
          pickup_location: 'butuan-city',
          return_location: 'butuan-airport',
          customer_name: 'Maria Santos',
          customer_email: 'maria@example.com',
          customer_phone: '+63 917 555 0101',
          license_number: 'N01-23-456789',
          accept_terms: true,
        },
      },
    });
    return data.create_booking as { id: string; reference: string };
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

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('records the email as not set up until Gmail is configured', async () => {
    const booking = await book();
    await admin.call({
      update_booking: { id: booking.id, input: { status: 'confirmed' } },
    });
    const [notice] = await notificationsOf(admin, booking.id);
    expect(notice).toMatchObject({
      channel: 'email',
      event: 'confirmed',
      recipient: 'maria@example.com',
      status: 'skipped',
    });
    expect(notice.error).toContain('SMTP_PASSWORD');
  });

  it('emails the customer when staff confirm, then when they cancel', async () => {
    const mailer = app.get(Mailer);
    jest.spyOn(mailer, 'configured', 'get').mockReturnValue(true);
    const sent: Email[] = [];
    jest.spyOn(mailer, 'send').mockImplementation((email) => {
      sent.push(email);
      return Promise.resolve();
    });

    const booking = await book();
    await admin.call({
      update_booking: { id: booking.id, input: { status: 'confirmed' } },
    });
    expect((await notificationsOf(admin, booking.id))[0]).toMatchObject({
      event: 'confirmed',
      status: 'sent',
      error: null,
    });
    expect(sent[0].to).toBe('maria@example.com');
    expect(sent[0].subject).toContain(`Confirmed`);
    expect(sent[0].subject).toContain(booking.reference);
    expect(sent[0].html).toContain('Toyota Vios Test');
    expect(sent[0].html).toContain('Butuan City');
    expect(sent[0].text).toContain(
      `/track?ref=${booking.reference}&email=maria%40example.com`,
    );
    expect(sent[0].text).toContain("driver's license");

    // notes do not email anyone; a cancellation does
    await admin.call({
      update_booking: { id: booking.id, input: { admin_notes: 'Paid' } },
    });
    await admin.call({
      update_booking: { id: booking.id, input: { status: 'cancelled' } },
    });
    const history = await notificationsOf(admin, booking.id, 2);
    expect(history.map((n: { event: string }) => n.event)).toEqual([
      'cancelled',
      'confirmed',
    ]);
    expect(sent).toHaveLength(2);
    expect(sent[1].subject).toContain('Cancelled');
  });

  it('shows why an email failed, and can send it again', async () => {
    const mailer = app.get(Mailer);
    jest.spyOn(mailer, 'configured', 'get').mockReturnValue(true);
    const send = jest
      .spyOn(mailer, 'send')
      .mockRejectedValueOnce(
        new Error('Invalid login: 535 Username and Password not accepted'),
      )
      .mockResolvedValue();

    const booking = await book();
    await admin.call({
      update_booking: { id: booking.id, input: { status: 'confirmed' } },
    });
    const [failed] = await notificationsOf(admin, booking.id);
    expect(failed).toMatchObject({ status: 'failed' });
    expect(failed.error).toContain('Username and Password not accepted');

    const resent = (
      await admin.call({ resend_booking_email: { id: booking.id } })
    ).resend_booking_email;
    expect(resent).toMatchObject({ status: 'sent', event: 'confirmed' });
    expect(send).toHaveBeenCalledTimes(2);

    // nothing to tell the customer while a booking is still pending
    const pending = await book();
    const error = await admin.error({
      resend_booking_email: { id: pending.id },
    });
    expect(error.status).toBe(422);
    const visitor = new ApiClient(app);
    expect(
      (await visitor.error({ resend_booking_email: { id: booking.id } })).code,
    ).toBe('UNAUTHENTICATED');
  });
});
