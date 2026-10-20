import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { deliverConfirmation, deliverReminder, MAX_ATTEMPTS, type NotifyAppt } from '@/lib/notify';
import { whatsappConfigured } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SELECT =
  'id, starts_at, created_at, service_name, confirmation_sent_at, confirmation_attempts, reminder_sent_at, reminder_attempts,' +
  ' clients!inner(name, phone, wa_consent),' +
  ' shops!inner(name, phone, whatsapp_enabled, suspended, trial_ends_at, paid_until),' +
  ' professionals!inner(name)';

const REMINDER_LEAD_MIN = 30;
const BATCH = 10;
const LIMIT = 100;

type Raw = Record<string, unknown> & { created_at: string };
const one = <T,>(v: unknown): T => (Array.isArray(v) ? v[0] : v) as T;

function toNotify(r: Raw): NotifyAppt {
  return {
    id: r.id as string,
    starts_at: r.starts_at as string,
    service_name: r.service_name as string,
    confirmation_sent_at: r.confirmation_sent_at as string | null,
    confirmation_attempts: r.confirmation_attempts as number,
    reminder_sent_at: r.reminder_sent_at as string | null,
    reminder_attempts: r.reminder_attempts as number,
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

// Roda a cada minuto (veja vercel.json). Envia o lembrete 30 minutos antes e refaz confirmações que falharam.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET não configurado' }, { status: 500 });
  const received = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ error: 'não autorizado' }, { status: 401 });
  if (!whatsappConfigured()) return NextResponse.json({ ok: true, skipped: 'WhatsApp não configurado' });

  const admin = createAdminClient();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  // 1) Confirmações que não saíram na hora (falha de rede, por exemplo). Só dos últimos 2 horas.
  const { data: pendingConf } = await admin
    .from('appointments')
    .select(SELECT)
    .eq('status', 'confirmed')
    .is('confirmation_sent_at', null)
    .lt('confirmation_attempts', MAX_ATTEMPTS)
    .gte('created_at', new Date(now - 2 * 3_600_000).toISOString())
    .lte('created_at', new Date(now - 30_000).toISOString())
    .gt('starts_at', nowIso)
    .limit(LIMIT);
  const confirmations = tally(await inBatches((pendingConf ?? []) as unknown as Raw[], (r) => deliverConfirmation(admin, toNotify(r))));

  // 2) Lembretes: horários que começam daqui a no máximo 30 minutos.
  const { data: due } = await admin
    .from('appointments')
    .select(SELECT)
    .eq('status', 'confirmed')
    .is('reminder_sent_at', null)
    .lt('reminder_attempts', MAX_ATTEMPTS)
    .gt('starts_at', nowIso)
    .lte('starts_at', new Date(now + REMINDER_LEAD_MIN * 60_000).toISOString())
    .limit(LIMIT);
  // Quem marcou com menos de 30 minutos de antecedência acabou de receber a confirmação; não repete.
  const dueRows = ((due ?? []) as unknown as Raw[]).filter(
    (r) => new Date(r.created_at).getTime() <= new Date(r.starts_at as string).getTime() - REMINDER_LEAD_MIN * 60_000,
  );
  const reminders = tally(await inBatches(dueRows, (r) => deliverReminder(admin, toNotify(r))));

  return NextResponse.json({ ok: true, confirmations, reminders });
}
