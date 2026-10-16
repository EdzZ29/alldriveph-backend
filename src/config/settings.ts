import { config } from 'dotenv';
import { join } from 'node:path';

// .env sits next to package.json; real environment variables win over it
config({ path: join(__dirname, '..', '..', '.env'), quiet: true });

type Environment = 'development' | 'staging' | 'production' | 'test';

function str(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function optional(name: string): string | undefined {
  return process.env[name] || undefined;
}

function int(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && process.env[name] !== '' ? value : fallback;
}

function list(name: string, fallback: string[]): string[] {
  const value = process.env[name];
  if (!value) return fallback;
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Accepts the old SQLAlchemy style URL too (postgresql+asyncpg://...). */
function databaseUrl(): string {
  return str(
    'DATABASE_URL',
    'postgresql://postgres:admin@127.0.0.1:3000/alldriveph',
  ).replace(/^postgres(ql)?\+\w+:\/\//, 'postgresql://');
}

const environment = str('ENVIRONMENT', 'development') as Environment;
const secretKey = str(
  'SECRET_KEY',
  'change-me-in-production-please-use-a-long-random-string',
);
if (secretKey.length < 32) {
  throw new Error('SECRET_KEY must be at least 32 characters long');
}
if (environment === 'production' && secretKey.startsWith('change-me')) {
  throw new Error(
    'Refusing to start in production with the default SECRET_KEY',
  );
}

export const settings = {
  appName: 'Alldrive Rent a Car PH API',
  environment,
  isProduction: environment === 'production',
  isTest: environment === 'test',
  port: int('PORT', 8000),
  apiPrefix: '/api/v1',

  databaseUrl: databaseUrl(),
  dbPoolSize: int('DB_POOL_SIZE', 10),

  secretKey,
  jwtIssuer: 'alldriveph-api',
  accessTokenExpireMinutes: int('ACCESS_TOKEN_EXPIRE_MINUTES', 60 * 12),
  authCookieName: str('AUTH_COOKIE_NAME', 'adp_session'),
  cookieDomain: optional('COOKIE_DOMAIN'),
  corsOrigins: list('CORS_ORIGINS', ['http://localhost:3001']),
  allowedHosts: list('ALLOWED_HOSTS', ['*']),
  // set to true behind a reverse proxy so client IPs come from X-Forwarded-For
  trustProxy: str('TRUST_PROXY', 'false') === 'true',

  rateLimitAuth: str('RATE_LIMIT_AUTH', '10/minute'),
  rateLimitPublicWrite: str('RATE_LIMIT_PUBLIC_WRITE', '20/hour'),
  // redis://host:6379/0 when running more than one instance
  rateLimitStorageUri: str('RATE_LIMIT_STORAGE_URI', 'memory://'),

  mediaDir: str('MEDIA_DIR', join(__dirname, '..', '..', 'media')),
  mediaUrlPrefix: '/media',
  maxUploadMb: int('MAX_UPLOAD_MB', 5),

  // the API pings the website after admin edits so its cache refreshes right away
  revalidateUrl: optional('REVALIDATE_URL'),
  revalidateSecret: optional('REVALIDATE_SECRET'),

  // customer emails when a booking is confirmed or cancelled. With Gmail: SMTP_USER is the Gmail
  // address and SMTP_PASSWORD a 16 character app password (Google Account > Security > App
  // passwords). Left empty, emails are skipped and the admin panel says so.
  smtpHost: str('SMTP_HOST', 'smtp.gmail.com'),
  smtpPort: int('SMTP_PORT', 465),
  smtpUser: optional('SMTP_USER'),
  smtpPassword: optional('SMTP_PASSWORD')?.replace(/\s+/g, ''),
  mailFrom: optional('MAIL_FROM'),
  /** the public website, for links in emails */
  siteUrl: str('SITE_URL', 'http://localhost:3001').replace(/\/$/, ''),
  businessName: str('BUSINESS_NAME', 'Alldrive Rent a Car PH'),
  businessPhone: str('BUSINESS_PHONE', '0946 126 0177'),

  /** share of each completed booking a branch owner pays Alldrive (0.1 = 10%) */
  commissionRate: Number(str('COMMISSION_RATE', '0.1')),

  firstAdminEmail: str('FIRST_ADMIN_EMAIL', 'admin@alldriveph.com'),
  firstAdminPassword: str('FIRST_ADMIN_PASSWORD', 'ChangeMe123!'),
  firstAdminName: str('FIRST_ADMIN_NAME', 'Alldrive Admin'),
} as const;
