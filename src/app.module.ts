import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CrudService } from './common/crud.service';
import { RateLimiter } from './common/rate-limiter.service';
import { RevalidateService } from './common/revalidate.service';
import { settings } from './config/settings';
import { dataSourceOptions } from './database/data-source';
import { ENTITIES } from './entities';
import { HealthController } from './health.controller';
import { AccountOperations } from './modules/accounts/accounts.operations';
import { AuthService } from './modules/accounts/auth.service';
import { AdminOperations } from './modules/admin/admin.operations';
import { BookingNotifier } from './modules/bookings/booking-notifier';
import { BookingService } from './modules/bookings/booking.service';
import { BookingOperations } from './modules/bookings/bookings.operations';
import { CatalogOperations } from './modules/catalog/catalog.operations';
import { LiveHub } from './common/live.hub';
import { Mailer } from './common/mailer.service';
import { ChatOperations } from './modules/chat/chat.operations';
import { EventsController } from './events.controller';
import { CommissionOperations } from './modules/commissions/commissions.operations';
import { ContentOperations } from './modules/content/content.operations';
import { RpcController } from './rpc.controller';

@Module({
  imports: [
    // apply pending migrations on start, so deploys need no extra step
    TypeOrmModule.forRoot({
      ...dataSourceOptions,
      migrationsRun: !settings.isTest,
    }),
    TypeOrmModule.forFeature(ENTITIES),
    JwtModule.register({
      secret: settings.secretKey,
      signOptions: { algorithm: 'HS256', issuer: settings.jwtIssuer },
      verifyOptions: { algorithms: ['HS256'], issuer: settings.jwtIssuer },
    }),
  ],
  controllers: [RpcController, EventsController, HealthController],
  providers: [
    AuthService,
    RateLimiter,
    RevalidateService,
    CrudService,
    BookingService,
    BookingNotifier,
    Mailer,
    AccountOperations,
    AdminOperations,
    BookingOperations,
    CatalogOperations,
    LiveHub,
    ChatOperations,
    CommissionOperations,
    ContentOperations,
  ],
})
export class AppModule {}
