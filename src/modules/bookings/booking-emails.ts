// The emails a customer gets when their booking is confirmed or cancelled. Plain HTML tables with
// inline styles, which every mail app (Gmail, Outlook, phones) shows the same way.

import { PICKUP_LOCATIONS, SECURITY_DEPOSIT } from '../../common/constants';
import { ServiceType } from '../../common/enums';
import type { Email } from '../../common/mailer.service';
import { settings } from '../../config/settings';
import type { Booking } from '../../entities/booking.entity';
import type { NotificationEvent } from '../../entities/booking-notification.entity';

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );

const when = (date: Date) =>
  new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);

const peso = (amount: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(amount);

const place = (code: string) =>
  PICKUP_LOCATIONS.find((l) => l.code === code)?.name ?? code;

/** The customer's tracking page, opened straight on this booking. */
export const trackUrl = (booking: Booking) =>
  `${settings.siteUrl}/track?ref=${encodeURIComponent(booking.reference)}&email=${encodeURIComponent(booking.customer_email)}`;

function layout(
  heading: string,
  intro: string,
  rows: [string, string][],
  footer: string,
  button?: { label: string; href: string },
) {
  const table = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:8px 0;color:#64748b;font-size:14px;width:140px;vertical-align:top">${escape(label)}</td>` +
        `<td style="padding:8px 0;color:#0f172a;font-size:14px;font-weight:600">${escape(value)}</td></tr>`,
    )
    .join('');
  const cta = button
    ? `<p style="margin:28px 0 8px"><a href="${escape(button.href)}" style="display:inline-block;background:#27abff;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:12px">${escape(button.label)}</a></p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:#0b1220;padding:20px 28px;color:#ffffff;font-size:18px;font-weight:700">${escape(settings.businessName)}</td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 12px;font-size:22px;color:#0f172a">${escape(heading)}</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#334155">${escape(intro)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0">${table}</table>
${cta}
<p style="margin:20px 0 0;font-size:14px;line-height:1.6;color:#475569">${escape(footer)}</p>
</td></tr>
<tr><td style="padding:16px 28px;background:#f8fafc;color:#94a3b8;font-size:12px">${escape(settings.businessName)} · ${escape(settings.businessPhone)} · ${escape(settings.siteUrl)}</td></tr>
</table></td></tr></table></body></html>`;
}

function asText(
  heading: string,
  intro: string,
  rows: [string, string][],
  footer: string,
  link?: string,
) {
  return [
    heading,
    '',
    intro,
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    ...(link ? ['', `View your booking: ${link}`] : []),
    '',
    footer,
    '',
    `${settings.businessName} · ${settings.businessPhone}`,
  ].join('\n');
}

/** The email for a booking that was just confirmed or cancelled. */
export function bookingEmail(
  booking: Booking,
  event: NotificationEvent,
): Email {
  const name = booking.customer_name.split(/\s+/)[0] || booking.customer_name;
  const trip: [string, string][] = [
    ['Reference', booking.reference],
    ['Car', booking.vehicle.name],
    ['Pickup', `${when(booking.pickup_at)}, ${place(booking.pickup_location)}`],
    ['Return', `${when(booking.return_at)}, ${place(booking.return_location)}`],
    ...(booking.pickup_address
      ? [['Pickup spot', booking.pickup_address] as [string, string]]
      : []),
    [
      'Service',
      booking.service_type === ServiceType.with_driver
        ? 'With driver'
        : 'Self drive',
    ],
    ['Total', peso(booking.total_amount)],
  ];
  const link = trackUrl(booking);

  if (event === 'confirmed') {
    const heading = `Your booking ${booking.reference} is confirmed`;
    const intro = `Hi ${name}, good news: your ${booking.vehicle.name} is reserved for you. Here are your trip details.`;
    const bring =
      booking.service_type === ServiceType.self_drive
        ? `Please bring your driver's license and one valid ID at pickup. A refundable security deposit of ${peso(SECURITY_DEPOSIT)} is collected when you pick up the car.`
        : 'Your driver will meet you at the pickup point. Please have one valid ID with you.';
    const footer = `${bring} Questions or changes? Call or message us at ${settings.businessPhone}, or just reply to this email.`;
    return {
      to: booking.customer_email,
      subject: `Confirmed: your ${settings.businessName} booking ${booking.reference}`,
      html: layout(heading, intro, trip, footer, {
        label: 'View my booking',
        href: link,
      }),
      text: asText(heading, intro, trip, footer, link),
    };
  }

  const heading = `Your booking ${booking.reference} was cancelled`;
  const intro = `Hi ${name}, your booking for the ${booking.vehicle.name} has been cancelled.`;
  const footer = `If you did not expect this or would like to book other dates, call or message us at ${settings.businessPhone}, or reply to this email. We are happy to help.`;
  return {
    to: booking.customer_email,
    subject: `Cancelled: your ${settings.businessName} booking ${booking.reference}`,
    html: layout(heading, intro, trip, footer, {
      label: 'View my booking',
      href: link,
    }),
    text: asText(heading, intro, trip, footer, link),
  };
}
