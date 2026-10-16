import 'reflect-metadata';
import { DataSource, type DataSourceOptions } from 'typeorm';

import { settings } from '../config/settings';
import { ENTITIES } from '../entities';
import { InitialSchema1760572800000 } from './migrations/1760572800000-InitialSchema';
import { BookingExactLocations1760659200000 } from './migrations/1760659200000-BookingExactLocations';
import { PartnerPhoto1760745600000 } from './migrations/1760745600000-PartnerPhoto';
import { UserBranch1760832000000 } from './migrations/1760832000000-UserBranch';
import { Chat1760918400000 } from './migrations/1760918400000-Chat';
import { BookingNotifications1761004800000 } from './migrations/1761004800000-BookingNotifications';
import { Commissions1761091200000 } from './migrations/1761091200000-Commissions';

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  url: settings.databaseUrl,
  entities: ENTITIES,
  migrations: [
    InitialSchema1760572800000,
    BookingExactLocations1760659200000,
    PartnerPhoto1760745600000,
    UserBranch1760832000000,
    Chat1760918400000,
    BookingNotifications1761004800000,
    Commissions1761091200000,
  ],
  // the schema is owned by migrations; never let TypeORM alter tables on its own
  synchronize: false,
  extra: { max: settings.dbPoolSize },
};

/** Used by the TypeORM CLI (npm run migration:*) and the seed script. */
export default new DataSource(dataSourceOptions);
