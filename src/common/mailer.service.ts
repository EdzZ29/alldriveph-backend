import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';

import { settings } from '../config/settings';

export interface Email {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Sends email through SMTP, by default Gmail (smtp.gmail.com:465 with an app password). Without
 * SMTP_USER and SMTP_PASSWORD it is "not configured" and callers record the email as skipped.
 */
@Injectable()
export class Mailer {
  private readonly logger = new Logger(Mailer.name);
  private transport?: Transporter;

  get configured(): boolean {
    return !!(settings.smtpUser && settings.smtpPassword);
  }

  /** Sends one email; throws with the SMTP server's reason when it is refused. */
  async send(email: Email): Promise<void> {
    if (!this.configured) throw new Error('Email is not set up');
    this.transport ??= nodemailer.createTransport({
      host: settings.smtpHost,
      port: settings.smtpPort,
      secure: settings.smtpPort === 465,
      auth: { user: settings.smtpUser, pass: settings.smtpPassword },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    const from =
      settings.mailFrom ?? `"${settings.businessName}" <${settings.smtpUser}>`;
    const info = (await this.transport.sendMail({ from, ...email })) as {
      messageId?: string;
    };
    this.logger.log(
      `Email "${email.subject}" sent to ${email.to} (${info.messageId ?? 'no id'})`,
    );
  }
}
