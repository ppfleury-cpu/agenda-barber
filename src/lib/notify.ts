import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { accessOf } from './billing';
import {
  confirmationParams, reminderParams, sendTemplate, templateNames, whatsappConfigured, type MessageData,
} from './whatsapp';
import { maskPhone } from './phone';
import { dateOf, timeOf, todayLocal } from './time';

/** Agendamento com os dados necessários para avisar o cliente. */
export type NotifyAppt = {
  id: string;
  starts_at: string;
  service_name: string;
  confirmation_sent_at: string | null;
  confirmation_attempts: number;
  reminder_sent_at: string | null;
  reminder_attempts: number;
  client: { name: string; phone: string; wa_consent: boolean };
  shop: { name: string; phone: string | null; whatsapp_enabled: boolean; suspended: boolean; trial_ends_at: string; paid_until: string | null };
  pro: { name: string };
};

export const MAX_ATTEMPTS = 3;

function dataOf(a: NotifyAppt): MessageData {
  return {
    clientName: a.client.name,
    shopName: a.shop.name,
    serviceName: a.service_name,
    proName: a.pro.name,
    date: dateOf(a.starts_at),
    time: timeOf(a.starts_at),
    today: todayLocal(),
    shopContact: a.shop.phone ? maskPhone(a.shop.phone) : undefined,
  };
}

function canNotify(a: NotifyAppt): boolean {
  return whatsappConfigured() && a.shop.whatsapp_enabled && a.client.wa_consent && accessOf(a.shop).allowed;
}

type Kind = 'confirmation' | 'reminder';

async function deliver(admin: SupabaseClient, a: NotifyAppt, kind: Kind): Promise<'sent' | 'skipped' | 'failed'> {
  const sentCol = kind === 'confirmation' ? 'confirmation_sent_at' : 'reminder_sent_at';
  const attemptsCol = kind === 'confirmation' ? 'confirmation_attempts' : 'reminder_attempts';
  const errorCol = kind === 'confirmation' ? 'confirmation_error' : 'reminder_error';
  const alreadySent = kind === 'confirmation' ? a.confirmation_sent_at : a.reminder_sent_at;
  const attempts = kind === 'confirmation' ? a.confirmation_attempts : a.reminder_attempts;
  if (alreadySent || attempts >= MAX_ATTEMPTS || !canNotify(a)) return 'skipped';

  // "Reserva" o envio: se outro processo já pegou este agendamento, não envia de novo.
  const { data: claimed } = await admin
    .from('appointments')
    .update({ [sentCol]: new Date().toISOString() })
    .eq('id', a.id)
    .is(sentCol, null)
    .select('id');
  if (!claimed?.length) return 'skipped';

  const d = dataOf(a);
  const names = templateNames();
  const result =
    kind === 'confirmation'
      ? await sendTemplate(a.client.phone, names.confirmation, confirmationParams(d))
      : await sendTemplate(a.client.phone, names.reminder, reminderParams(d));

  if (result.ok) return 'sent';
  await admin
    .from('appointments')
    .update({ [sentCol]: null, [attemptsCol]: attempts + 1, [errorCol]: result.error })
    .eq('id', a.id);
  return 'failed';
}

export const deliverConfirmation = (admin: SupabaseClient, a: NotifyAppt) => deliver(admin, a, 'confirmation');
export const deliverReminder = (admin: SupabaseClient, a: NotifyAppt) => deliver(admin, a, 'reminder');
