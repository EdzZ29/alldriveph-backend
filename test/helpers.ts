import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import type { LightMyRequestResponse } from 'fastify';
import { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';
import { configureApp, createAdapter } from '../src/app.setup';
import {
  FuelType,
  Transmission,
  UserRole,
  VehicleCategory,
} from '../src/common/enums';
import { User } from '../src/entities/user.entity';
import { Vehicle } from '../src/entities/vehicle.entity';

export const ADMIN_EMAIL = 'admin@alldrive-test.com';
export const ADMIN_PASSWORD = 'SuperSecret123';

export const API = '/api/v1/rpc';

type Operations = Record<string, unknown>;

/** Builds the app the same way main.ts does, without listening on a port. */
export async function createApp(): Promise<NestFastifyApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(
    createAdapter(),
    { logger: ['error', 'warn'] },
  );
  await configureApp(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

/** Drops every table, rebuilds the schema from the migrations and adds the fixtures. */
export async function resetDatabase(
  app: NestFastifyApplication,
): Promise<void> {
  const dataSource = app.get(DataSource);
  const database = (dataSource.options as { url?: string }).url ?? '';
  if (!/\/\w*_test(\?.*)?$/.test(database)) {
    throw new Error(`Refusing to reset a non test database: ${database}`);
  }
  await dataSource.dropDatabase();
  await dataSource.runMigrations();

  const users = dataSource.getRepository(User);
  await users.save(
    users.create({
      email: ADMIN_EMAIL,
      full_name: 'Test Admin',
      hashed_password: await bcrypt.hash(ADMIN_PASSWORD, 12),
      role: UserRole.admin,
    }),
  );
  const vehicles = dataSource.getRepository(Vehicle);
  await vehicles.save(
    vehicles.create({
      slug: 'test-vios',
      name: 'Toyota Vios Test',
      brand: 'Toyota',
      model: 'Vios',
      year: 2023,
      category: VehicleCategory.sedan,
      transmission: Transmission.automatic,
      fuel_type: FuelType.gasoline,
      seats: 5,
      luggage: 2,
      daily_rate: 2000,
      driver_rate: 1500,
      image_url: '/images/cars/toyota-vios-black.png',
      features: ['Bluetooth'],
    }),
  );
}

/** Calls the API like the website does. Keeps cookies like a browser. */
export class ApiClient {
  readonly headers: Record<string, string> = {};
  private readonly cookies = new Map<string, string>();

  constructor(private readonly app: NestFastifyApplication) {}

  /** A plain POST to the API endpoint; `payload` is sent as JSON unless it is a Buffer. */
  async post(
    payload: object | Buffer,
    headers: Record<string, string> = {},
  ): Promise<LightMyRequestResponse> {
    const cookie = [...this.cookies]
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
    const res = await this.app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'POST',
        url: API,
        headers: {
          ...(Buffer.isBuffer(payload)
            ? {}
            : { 'content-type': 'application/json' }),
          ...(cookie ? { cookie } : {}),
          ...this.headers,
          ...headers,
        },
        payload: Buffer.isBuffer(payload) ? payload : JSON.stringify(payload),
      });
    for (const line of [res.headers['set-cookie'] ?? []].flat()) {
      const [pair] = line.split(';');
      const index = pair.indexOf('=');
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      if (value) this.cookies.set(name, value);
      else this.cookies.delete(name);
    }
    return res;
  }

  /** The results of a request that must succeed, keyed by operation. */
  async call(operations: Operations): Promise<any> {
    const res = await this.post(operations);
    const body = res.json();
    if (res.statusCode !== 200) {
      throw new Error(`Unexpected ${res.statusCode}: ${JSON.stringify(body)}`);
    }
    return body;
  }

  /** The error of a request that must fail: { op, message, code, status, errors? }. */
  async error(operations: Operations): Promise<any> {
    const res = await this.post(operations);
    const body = res.json();
    if (res.statusCode === 200) {
      throw new Error(`Expected an error, got: ${JSON.stringify(body)}`);
    }
    expect(body.error.status).toBe(res.statusCode);
    return body.error;
  }

  async login(email: string, password: string): Promise<void> {
    const data = await this.call({ login: { email, password } });
    this.headers.authorization = `Bearer ${data.login.access_token}`;
  }
}

/** A client signed in as the fixture admin. */
export async function adminClient(
  app: NestFastifyApplication,
): Promise<ApiClient> {
  const client = new ApiClient(app);
  await client.login(ADMIN_EMAIL, ADMIN_PASSWORD);
  return client;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** ISO 8601 with an explicit offset, like Python's datetime.isoformat() for UTC. */
function iso(date: Date): string {
  return date.toISOString().replace(/\.000Z$/, '+00:00');
}

/** A rental period starting `startDays` from now (on the hour, UTC) and lasting `lengthDays`. */
export function period(
  startDays: number,
  lengthDays: number,
): [string, string] {
  const base = new Date();
  base.setUTCMinutes(0, 0, 0);
  const start = base.getTime() + startDays * DAY_MS;
  return [iso(new Date(start)), iso(new Date(start + lengthDays * DAY_MS))];
}
