import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { accessOf } from './billing';
import {
  confirmationParams, dayBeforeParams, reminderParams, sendTemplate, templateNames, whatsappConfigured, type MessageData,
} from './whatsapp';
import { maskPhone } from './phone';
import { dateOf, timeOf, todayLocal } from './time';

/** Agendamento com os dados necessários para avisar o cliente. */
export type NotifyAppt = {
  id: string;
  starts_at: string;
  service_name: string;
  manage_token?: string | null;
  confirmation_sent_at: string | null;
  confirmation_attempts: number;
  reminder_sent_at: string | null;
  reminder_attempts: number;
  day_reminder_sent_at?: string | null;
  day_reminder_attempts?: number;
  client: { name: string; phone: string; wa_consent: boolean };
  shop: {
    name: string; phone: string | null; whatsapp_enabled: boolean; suspended: boolean; trial_ends_at: string; paid_until: string | null;
    timezone?: string | null;
  };
  pro: { name: string };
};

export const MAX_ATTEMPTS = 3;

/** Endereço público da página "meu horário" de um agendamento. */
export function manageUrl(token: string | null | undefined): string | undefined {
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/$/, '');
  return token && site ? `${site}/m/${token}` : undefined;
}

export function messageDataOf(a: NotifyAppt): MessageData {
  const tz = a.shop.timezone;
  return {
    clientName: a.client.name,
    shopName: a.shop.name,
    serviceName: a.service_name,
    proName: a.pro.name,
    date: dateOf(a.starts_at, tz),
    time: timeOf(a.starts_at, tz),
    today: todayLocal(new Date(), tz),
    shopContact: a.shop.phone ? maskPhone(a.shop.phone) : undefined,
    manageUrl: manageUrl(a.manage_token),
  };
}

function canNotify(a: NotifyAppt): boolean {
  return whatsappConfigured() && a.shop.whatsapp_enabled && a.client.wa_consent && accessOf(a.shop).allowed;
}

export type NotifyKind = 'confirmation' | 'reminder' | 'day_before';

const COLUMNS: Record<NotifyKind, { sent: string; attempts: string; error: string }> = {
  confirmation: { sent: 'confirmation_sent_at', attempts: 'confirmation_attempts', error: 'confirmation_error' },
  reminder: { sent: 'reminder_sent_at', attempts: 'reminder_attempts', error: 'reminder_error' },
  day_before: { sent: 'day_reminder_sent_at', attempts: 'day_reminder_attempts', error: 'day_reminder_error' },
};

async function deliver(admin: SupabaseClient, a: NotifyAppt, kind: NotifyKind): Promise<'sent' | 'skipped' | 'failed'> {
  const col = COLUMNS[kind];
  const row = a as unknown as Record<string, unknown>;
  const alreadySent = row[col.sent];
  const attempts = Number(row[col.attempts] ?? 0);
  if (alreadySent || attempts >= MAX_ATTEMPTS || !canNotify(a)) return 'skipped';

  // "Reserva" o envio: se outro processo já pegou este agendamento, não envia de novo.
  const { data: claimed } = await admin
    .from('appointments')
    .update({ [col.sent]: new Date().toISOString() })
    .eq('id', a.id)
    .is(col.sent, null)
    .select('id');
  if (!claimed?.length) return 'skipped';

  const d = messageDataOf(a);
  const names = templateNames();
  const result =
    kind === 'confirmation'
      ? await sendTemplate(a.client.phone, names.confirmation, confirmationParams(d))
      : kind === 'day_before'
        ? await sendTemplate(a.client.phone, names.dayBefore, dayBeforeParams(d))
        : await sendTemplate(a.client.phone, names.reminder, reminderParams(d));

  if (result.ok) return 'sent';
  await admin
    .from('appointments')
    .update({ [col.sent]: null, [col.attempts]: attempts + 1, [col.error]: result.error })
    .eq('id', a.id);
  return 'failed';
}

export const deliverConfirmation = (admin: SupabaseClient, a: NotifyAppt) => deliver(admin, a, 'confirmation');
export const deliverReminder = (admin: SupabaseClient, a: NotifyAppt) => deliver(admin, a, 'reminder');
export const deliverDayBefore = (admin: SupabaseClient, a: NotifyAppt) => deliver(admin, a, 'day_before');
