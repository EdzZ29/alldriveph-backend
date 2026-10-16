import type { NestFastifyApplication } from '@nestjs/platform-fastify';

import {
  type CacheTag,
  RevalidateService,
} from '../src/common/revalidate.service';
import { settings } from '../src/config/settings';
import { adminClient, createApp, resetDatabase } from './helpers';

/** Lets the fire and forget notifications run. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('website cache revalidation', () => {
  let app: NestFastifyApplication;
  let notified: CacheTag[][];
  const original = {
    revalidateUrl: settings.revalidateUrl,
    revalidateSecret: settings.revalidateSecret,
  };

  beforeAll(async () => {
    app = await createApp();
    await resetDatabase(app);
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    notified = [];
    Object.assign(settings as any, {
      revalidateUrl: 'http://web/api/revalidate',
      revalidateSecret: 'secret',
    });
    jest
      .spyOn(app.get(RevalidateService), 'notify')
      .mockImplementation((tags) => {
        notified.push(tags);
        return Promise.resolve();
      });
  });

  afterEach(() => {
    Object.assign(settings as any, original);
    jest.restoreAllMocks();
  });

  it('content edits refresh the matching cache tag', async () => {
    const admin = await adminClient(app);
    const data = await admin.call({
      create_faq: {
        input: { question: 'Is fuel included?', answer: 'No, return it full.' },
      },
    });
    await admin.call({ delete_faq: { id: data.create_faq.id } });
    await settle();
    expect(notified).toEqual([['faqs'], ['faqs']]);
  });

  it('failed edits and private data do not refresh', async () => {
    const admin = await adminClient(app);
    await admin.error({
      create_faq: { input: { question: '?', answer: 'No' } },
    });
    await admin.error({
      update_booking: {
        id: '00000000-0000-0000-0000-000000000000',
        input: { admin_notes: 'x' },
      },
    });
    await admin.call({ vehicles: { include_inactive: true } });
    await settle();
    expect(notified).toEqual([]);
  });
});
