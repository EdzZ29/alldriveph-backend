// Runs before any test imports the app, so settings.ts sees these (real env vars win over .env).
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.ENVIRONMENT = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgresql://postgres:admin@localhost:3000/alldriveph_test';
process.env.MEDIA_DIR = mkdtempSync(join(tmpdir(), 'alldriveph-media-'));
// '' counts as unset in settings.ts, and keeps dotenv from filling them from .env
process.env.REVALIDATE_URL = '';
process.env.REVALIDATE_SECRET = '';
// never send real customer emails from a test run, even when .env has Gmail set up
process.env.SMTP_USER = '';
process.env.SMTP_PASSWORD = '';
