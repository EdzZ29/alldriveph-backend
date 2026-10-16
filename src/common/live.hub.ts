import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { createClient } from 'redis';

import { settings } from '../config/settings';
import type {
  ChatConversationView,
  ChatMessageView,
} from '../modules/chat/chat.views';

/** A booking as admin notifications show it. */
export interface BookingNotice {
  id: string;
  reference: string;
  status: string;
  customer_name: string;
  vehicle_name: string;
  pickup_at: Date;
  /** branch code of the pickup point, so branch owners only hear about their own */
  branch: string | null;
  /** created by a customer, or moved along by staff */
  change: 'created' | 'updated';
}

/** A contact form message as admin notifications show it. */
export interface ContactNotice {
  id: string;
  name: string;
  subject: string;
}

/** A commission as admin notifications and the commissions page need it. */
export interface CommissionNotice {
  id: string;
  booking_id: string;
  reference: string;
  branch: string;
  amount: number;
  status: 'unpaid' | 'paid';
  /** earned when a booking was completed, or paid when an admin recorded the payment */
  change: 'created' | 'paid' | 'unpaid';
}

export type LiveEvent =
  | { type: 'message'; conversation_id: string; message: ChatMessageView }
  | { type: 'conversation'; conversation: ChatConversationView }
  | { type: 'booking'; booking: BookingNotice }
  | { type: 'contact'; contact: ContactNotice }
  | { type: 'commission'; commission: CommissionNotice };

const CHANNEL = 'alldrive:live';

/**
 * Delivers live events (chat messages, new bookings, contact messages) to every open stream
 * (GET /api/v1/events) as they happen. In memory for one API instance; with
 * RATE_LIMIT_STORAGE_URI=redis://... events go through Redis pub/sub, so a visitor connected to
 * one instance hears a reply sent from another.
 */
@Injectable()
export class LiveHub implements OnModuleDestroy {
  private readonly logger = new Logger(LiveHub.name);
  private readonly emitter = new EventEmitter().setMaxListeners(0);
  private publisher?: ReturnType<typeof createClient>;
  private subscriber?: ReturnType<typeof createClient>;

  constructor() {
    if (!settings.rateLimitStorageUri.startsWith('redis')) return;
    this.publisher = createClient({ url: settings.rateLimitStorageUri });
    this.subscriber = this.publisher.duplicate();
    for (const client of [this.publisher, this.subscriber]) {
      client.on('error', (error: Error) =>
        this.logger.warn(`Redis: ${error.message}`),
      );
    }
    void this.publisher.connect();
    void this.subscriber
      .connect()
      .then(() =>
        this.subscriber!.subscribe(CHANNEL, (raw) =>
          this.deliver(JSON.parse(raw) as LiveEvent),
        ),
      );
  }

  publish(event: LiveEvent): void {
    if (this.publisher?.isReady) {
      void this.publisher.publish(CHANNEL, JSON.stringify(event));
    } else {
      this.deliver(event);
    }
  }

  /** Calls `listener` for every event until the returned function is called. */
  subscribe(listener: (event: LiveEvent) => void): () => void {
    this.emitter.on('event', listener);
    return () => this.emitter.off('event', listener);
  }

  private deliver(event: LiveEvent) {
    this.emitter.emit('event', event);
  }

  async onModuleDestroy() {
    for (const client of [this.subscriber, this.publisher]) {
      if (client?.isOpen) await client.quit();
    }
  }
}
