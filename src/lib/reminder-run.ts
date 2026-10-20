import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { deliverConfirmation, deliverDayBefore, deliverReminder, MAX_ATTEMPTS, type NotifyAppt } from './notify';
import { DAY_BEFORE_LATEST_MIN } from './reminders';

const SELECT =
  'id, starts_at, created_at, service_name, manage_token, confirmation_sent_at, confirmation_attempts,' +
  ' reminder_sent_at, reminder_attempts, day_reminder_sent_at, day_reminder_attempts,' +
  ' clients!inner(name, phone, wa_consent),' +
  ' shops!inner(name, phone, whatsapp_enabled, suspended, trial_ends_at, paid_until, timezone),' +
  ' professionals!inner(name)';

const BATCH = 10;
const LIMIT = 200;

type Raw = Record<string, unknown>;
const one = <T,>(v: unknown): T => (Array.isArray(v) ? v[0] : v) as T;

export function toNotify(r: Raw): NotifyAppt {
  return {
    id: r.id as string,
    starts_at: r.starts_at as string,
    service_name: r.service_name as string,
    manage_token: (r.manage_token as string) ?? null,
    confirmation_sent_at: r.confirmation_sent_at as string | null,
    confirmation_attempts: Number(r.confirmation_attempts ?? 0),
    reminder_sent_at: r.reminder_sent_at as string | null,
    reminder_attempts: Number(r.reminder_attempts ?? 0),
    day_reminder_sent_at: (r.day_reminder_sent_at as string | null) ?? null,
    day_reminder_attempts: Number(r.day_reminder_attempts ?? 0),
    client: one(r.clients),
    shop: one(r.shops),
    pro: one(r.professionals),
  };
}

async function inBatches<T, R>(items: T[], fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += BATCH) out.push(...(await Promise.all(items.slice(i, i + BATCH).map(fn))));
  return out;
}

const tally = (results: string[]) => ({
  sent: results.filter((r) => r === 'sent').length,
  failed: results.filter((r) => r === 'failed').length,
  skipped: results.filter((r) => r === 'skipped').length,
});

/**
 * Uma rodada do serviço automático (a cada 5 minutos):
 * 1) refaz confirmações que falharam; 2) lembrete da véspera; 3) lembrete do dia; 4) limpa registros velhos.
 * O horário de cada lembrete já foi gravado no agendamento, então aqui só buscamos o que venceu.
 */
export async function runReminders(admin: SupabaseClient, now: Date = new Date()) {
  const t = now.getTime();
  const iso = (ms: number) => new Date(ms).toISOString();

  const { data: pendingConf } = await admin
    .from('appointments')
    .select(SELECT)
    .eq('status', 'confirmed')
    .is('confirmation_sent_at', null)
    .lt('confirmation_attempts', MAX_ATTEMPTS)
    .gte('created_at', iso(t - 2 * 3_600_000))
    .lte('created_at', iso(t - 30_000))
    .gt('starts_at', iso(t))
    .limit(LIMIT);
  const confirmations = tally(await inBatches((pendingConf ?? []) as unknown as Raw[], (r) => deliverConfirmation(admin, toNotify(r))));

  const { data: dueDay } = await admin
    .from('appointments')
    .select(SELECT)
    .eq('status', 'confirmed')
    .is('day_reminder_sent_at', null)
    .lt('day_reminder_attempts', MAX_ATTEMPTS)
    .lte('day_reminder_due_at', iso(t))
    .gt('starts_at', iso(t + DAY_BEFORE_LATEST_MIN * 60_000))
    .order('day_reminder_due_at')
    .limit(LIMIT);
  const dayBefore = tally(await inBatches((dueDay ?? []) as unknown as Raw[], (r) => deliverDayBefore(admin, toNotify(r))));

  const { data: dueSoon } = await admin
    .from('appointments')
    .select(SELECT)
    .eq('status', 'confirmed')
    .is('reminder_sent_at', null)
    .lt('reminder_attempts', MAX_ATTEMPTS)
    .lte('reminder_due_at', iso(t))
    .gt('starts_at', iso(t))
    .order('reminder_due_at')
    .limit(LIMIT);
  const reminders = tally(await inBatches((dueSoon ?? []) as unknown as Raw[], (r) => deliverReminder(admin, toNotify(r))));

  await Promise.all([
    admin.from('rate_limits').delete().lt('window_start', iso(t - 86_400_000)),
    admin.from('phone_verifications').delete().lt('created_at', iso(t - 86_400_000)),
  ]);

  return { confirmations, dayBefore, reminders };
}
