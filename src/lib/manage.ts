import 'server-only';
// O cliente cuida do próprio horário pelo link da confirmação (/m/<token>), sem login:
// confirmar presença, remarcar ou cancelar, até X horas antes (configurado pelo dono).
import type { SupabaseClient } from '@supabase/supabase-js';
import { accessOf } from './billing';
import { getAvailability, pickSlot, totals, type AvailabilityResult } from './booking';
import { deliverConfirmation } from './notify';
import { reminderDueTimes } from './reminders';
import { addDays, dateOf, isValidDate, isValidTime, timeOf, todayLocal } from './time';
import { PUBLIC_SHOP_COLUMNS, type AppointmentStatus, type PublicShop } from './types';

export const TOKEN_RE = /^[0-9a-f]{64}$/;

export type Managed = {
  id: string;
  status: AppointmentStatus;
  presence: 'yes' | 'no' | null;
  startsAt: string;
  date: string;
  time: string;
  serviceName: string;
  serviceIds: string[];
  priceCents: number;
  durationMin: number;
  proId: string;
  proName: string;
  clientName: string;
  shop: PublicShop;
  /** Ainda dá para remarcar ou cancelar pelo link? */
  canChange: boolean;
  upcoming: boolean;
};

type Row = {
  id: string; shop_id: string; professional_id: string; client_id: string; service_id: string | null; service_ids: string[] | null;
  service_name: string; price_cents: number; starts_at: string; ends_at: string; status: AppointmentStatus; presence: 'yes' | 'no' | null;
  confirmation_attempts: number; reminder_attempts: number; day_reminder_attempts: number; manage_token: string;
};

export function changeAllowed(startsAt: string, now: Date, cancelHours: number): boolean {
  return new Date(startsAt).getTime() - now.getTime() >= cancelHours * 3_600_000;
}

async function loadRow(admin: SupabaseClient, token: string) {
  if (!TOKEN_RE.test(token)) return null;
  const { data } = await admin.from('appointments').select('*').eq('manage_token', token).maybeSingle();
  const row = data as Row | null;
  if (!row) return null;
  const [shopRes, proRes, clientRes] = await Promise.all([
    admin.from('shops').select(PUBLIC_SHOP_COLUMNS).eq('id', row.shop_id).maybeSingle(),
    admin.from('professionals').select('name').eq('id', row.professional_id).maybeSingle(),
    admin.from('clients').select('name, phone, wa_consent').eq('id', row.client_id).maybeSingle(),
  ]);
  const shop = shopRes.data as PublicShop | null;
  if (!shop) return null;
  return {
    row, shop,
    proName: (proRes.data as { name: string } | null)?.name ?? '',
    client: clientRes.data as { name: string; phone: string; wa_consent: boolean } | null,
  };
}

export async function loadManaged(admin: SupabaseClient, token: string, now: Date = new Date()): Promise<Managed | null> {
  const r = await loadRow(admin, token);
  if (!r) return null;
  const { row, shop } = r;
  const upcoming = new Date(row.starts_at).getTime() > now.getTime();
  return {
    id: row.id,
    status: row.status,
    presence: row.presence,
    startsAt: row.starts_at,
    date: dateOf(row.starts_at, shop.timezone),
    time: timeOf(row.starts_at, shop.timezone),
    serviceName: row.service_name,
    serviceIds: row.service_ids ?? (row.service_id ? [row.service_id] : []),
    priceCents: row.price_cents,
    durationMin: Math.round((new Date(row.ends_at).getTime() - new Date(row.starts_at).getTime()) / 60_000),
    proId: row.professional_id,
    proName: r.proName,
    clientName: r.client?.name ?? '',
    shop,
    canChange: row.status === 'confirmed' && upcoming && changeAllowed(row.starts_at, now, shop.cancel_hours) && accessOf(shop).allowed,
    upcoming,
  };
}

export type ManageResult = { ok: true; message: string } | { ok: false; error: string; conflict?: boolean };

const tooLate = (h: number) =>
  `Faltam menos de ${h} ${h === 1 ? 'hora' : 'horas'} para o horário. Para mudar agora, fale direto com o estabelecimento.`;

export async function confirmPresence(admin: SupabaseClient, token: string, now: Date = new Date()): Promise<ManageResult> {
  const m = await loadManaged(admin, token, now);
  if (!m) return { ok: false, error: 'Agendamento não encontrado.' };
  if (m.status !== 'confirmed' || !m.upcoming) return { ok: false, error: 'Este horário não está mais ativo.' };
  await admin.from('appointments').update({ presence: 'yes', presence_at: now.toISOString() }).eq('id', m.id).eq('status', 'confirmed');
  return { ok: true, message: 'Presença confirmada. Até lá!' };
}

export async function cancelByClient(admin: SupabaseClient, token: string, now: Date = new Date()): Promise<ManageResult> {
  const m = await loadManaged(admin, token, now);
  if (!m) return { ok: false, error: 'Agendamento não encontrado.' };
  if (m.status !== 'confirmed' || !m.upcoming) return { ok: false, error: 'Este horário não está mais ativo.' };
  if (!m.canChange) return { ok: false, error: tooLate(m.shop.cancel_hours) };
  const { data } = await admin
    .from('appointments')
    .update({ status: 'cancelled', cancelled_by: 'client', presence: 'no', presence_at: now.toISOString() })
    .eq('id', m.id)
    .eq('status', 'confirmed')
    .select('id');
  if (!data?.length) return { ok: false, error: 'Este horário não está mais ativo.' };
  return { ok: true, message: 'Horário cancelado. Obrigado por avisar!' };
}

export async function managedAvailability(
  admin: SupabaseClient, token: string, professionalId: string, now: Date = new Date(),
): Promise<AvailabilityResult> {
  const m = await loadManaged(admin, token, now);
  if (!m || !m.canChange) return { ok: false, error: 'Não é mais possível remarcar por aqui.' };
  return getAvailability(admin, m.shop, {
    serviceIds: m.serviceIds, professionalId, days: m.shop.booking_window_days, minLeadMin: m.shop.min_lead_min, ignoreAppointmentId: m.id,
  });
}

export async function rescheduleByClient(
  admin: SupabaseClient,
  token: string,
  input: { date: string; time: string; professionalId: string },
  now: Date = new Date(),
): Promise<ManageResult> {
  const loaded = await loadRow(admin, token);
  const m = await loadManaged(admin, token, now);
  if (!loaded || !m) return { ok: false, error: 'Agendamento não encontrado.' };
  if (!m.canChange) return { ok: false, error: m.status === 'confirmed' && m.upcoming ? tooLate(m.shop.cancel_hours) : 'Este horário não está mais ativo.' };
  if (!isValidDate(input.date) || !isValidTime(input.time)) return { ok: false, error: 'Data ou horário inválido.' };
  const today = todayLocal(now, m.shop.timezone);
  if (input.date < today || input.date > addDays(today, m.shop.booking_window_days - 1)) {
    return { ok: false, error: 'Esse dia não está disponível.' };
  }
  const picked = await pickSlot(admin, m.shop, {
    serviceIds: m.serviceIds, professionalId: input.professionalId, date: input.date, time: input.time, now,
    minLeadMin: m.shop.min_lead_min, ignoreId: m.id,
  });
  if (!picked.ok) {
    return picked.error === 'Serviço não encontrado.'
      ? { ok: false, error: 'Este serviço mudou. Para remarcar, fale com o estabelecimento.' }
      : picked;
  }
  const due = reminderDueTimes(picked.start, now, m.shop);
  const { data, error } = await admin
    .from('appointments')
    .update({
      starts_at: picked.start.toISOString(),
      ends_at: picked.end.toISOString(),
      professional_id: picked.pro.id,
      presence: null,
      presence_at: null,
      reminder_due_at: due.soon?.toISOString() ?? null,
      day_reminder_due_at: due.dayBefore?.toISOString() ?? null,
      reminder_sent_at: null, reminder_attempts: 0,
      day_reminder_sent_at: null, day_reminder_attempts: 0,
      confirmation_sent_at: null, confirmation_attempts: 0,
    })
    .eq('id', m.id)
    .eq('status', 'confirmed')
    .select('id, starts_at, manage_token, confirmation_sent_at, confirmation_attempts, reminder_sent_at, reminder_attempts');
  if (error?.code === '23P01') return { ok: false, conflict: true, error: 'Esse horário acabou de ser ocupado. Escolha outro.' };
  if (error || !data?.length) return { ok: false, error: 'Não foi possível remarcar. Tente de novo.' };

  // Nova confirmação com o horário novo (mesmo modelo de mensagem).
  if (m.shop.whatsapp_enabled && loaded.client?.wa_consent) {
    await deliverConfirmation(admin, {
      ...(data[0] as { id: string; starts_at: string; manage_token: string; confirmation_sent_at: null; confirmation_attempts: number; reminder_sent_at: null; reminder_attempts: number }),
      service_name: totals(picked.services).name,
      client: loaded.client,
      shop: m.shop,
      pro: { name: picked.pro.name },
    });
  }
  return { ok: true, message: `Pronto! Novo horário: ${dateOf(picked.start, m.shop.timezone).split('-').reverse().slice(0, 2).join('/')} às ${timeOf(picked.start, m.shop.timezone)} com ${picked.pro.name}.` };
}
