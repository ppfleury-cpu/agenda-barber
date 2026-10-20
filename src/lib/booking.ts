import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  choosePro, dayWindow, freeTimesByDay, loadByPro, proDoesAll, slotsForDay, type Busy, type Pro, type ShopHours,
} from './availability';
import { accessOf } from './billing';
import { deliverConfirmation, type NotifyAppt } from './notify';
import { normalizePhone } from './phone';
import { reminderDueTimes } from './reminders';
import { addDays, dateOf, isValidDate, isValidTime, timeOf, todayLocal, toMin, localToDate } from './time';
import type { PublicShop } from './types';

const MAX_OPEN_BOOKINGS_PER_CLIENT = 3;
export const MAX_SERVICES_PER_BOOKING = 5;
const UNAVAILABLE = 'A agenda está indisponível no momento.';

type ShopLike = PublicShop;

export type ChosenService = { id: string; name: string; duration_min: number; price_cents: number };
export type BookPro = Pro & { name: string };

/** Ocupado nos dias pedidos. `ignoreId`: o próprio agendamento, ao remarcar. */
export async function loadBusy(
  admin: SupabaseClient, shop: ShopLike, fromDate: string, days: number, ignoreId?: string,
): Promise<Busy[]> {
  const { start, end } = dayWindow(fromDate, days, shop.timezone);
  const [appts, blocks] = await Promise.all([
    admin
      .from('appointments')
      .select('id, professional_id, starts_at, ends_at')
      .eq('shop_id', shop.id)
      .in('status', ['confirmed', 'done'])
      .lt('starts_at', end.toISOString())
      .gt('ends_at', start.toISOString()),
    admin
      .from('time_blocks')
      .select('id, professional_id, starts_at, ends_at')
      .eq('shop_id', shop.id)
      .lt('starts_at', end.toISOString())
      .gt('ends_at', start.toISOString()),
  ]);
  type R = { id: string; professional_id: string | null; starts_at: string; ends_at: string };
  const toBusy = (rows: R[] | null, kind: Busy['kind']) =>
    (rows ?? [])
      .filter((r) => kind === 'block' || r.id !== ignoreId)
      .map((r) => ({
        professional_id: r.professional_id,
        start: new Date(r.starts_at).getTime(),
        end: new Date(r.ends_at).getTime(),
        kind,
      }));
  return [...toBusy(appts.data as R[] | null, 'appt'), ...toBusy(blocks.data as R[] | null, 'block')];
}

/** Lista de serviços válida: sem repetição, de 1 a 5. */
export function cleanServiceIds(ids: unknown): string[] | null {
  if (!Array.isArray(ids)) return null;
  const out = Array.from(new Set(ids.map(String)));
  return out.length >= 1 && out.length <= MAX_SERVICES_PER_BOOKING ? out : null;
}

/** Serviços escolhidos (todos ativos e desta barbearia) e os profissionais que fazem todos eles. */
export async function loadServicesAndPros(admin: SupabaseClient, shopId: string, serviceIds: string[], professionalId: string) {
  const [svc, prosRes] = await Promise.all([
    admin
      .from('services')
      .select('id, name, duration_min, price_cents')
      .in('id', serviceIds)
      .eq('shop_id', shopId)
      .eq('active', true),
    admin
      .from('professionals')
      .select('id, name, work_days, start_time, end_time, break_start, break_end, service_ids')
      .eq('shop_id', shopId)
      .eq('active', true)
      .order('created_at'),
  ]);
  const found = (svc.data ?? []) as ChosenService[];
  const services = serviceIds.map((id) => found.find((s) => s.id === id)).filter(Boolean) as ChosenService[];
  let pros = ((prosRes.data ?? []) as BookPro[]).filter((p) => proDoesAll(p, serviceIds));
  if (professionalId !== 'any') pros = pros.filter((p) => p.id === professionalId);
  return { services: services.length === serviceIds.length ? services : null, pros };
}

export const totals = (services: ChosenService[]) => ({
  name: services.map((s) => s.name).join(' + '),
  duration: services.reduce((n, s) => n + s.duration_min, 0),
  price: services.reduce((n, s) => n + s.price_cents, 0),
});

export const hoursOf = (s: ShopLike): ShopHours => ({
  open_time: s.open_time, close_time: s.close_time, open_days: s.open_days, slot_minutes: s.slot_minutes, timezone: s.timezone,
});

export type AvailabilityResult =
  | { ok: true; days: Record<string, string[]> }
  | { ok: false; error: string };

/** Horários livres dos próximos dias para os serviços escolhidos (e profissional ou "qualquer um"). */
export async function getAvailability(
  admin: SupabaseClient,
  shop: ShopLike,
  input: { serviceIds: string[]; professionalId: string; days: number; minLeadMin: number; ignoreAppointmentId?: string },
): Promise<AvailabilityResult> {
  if (!accessOf(shop).allowed) return { ok: false, error: UNAVAILABLE };
  const ids = cleanServiceIds(input.serviceIds);
  if (!ids) return { ok: false, error: 'Escolha de 1 a 5 serviços.' };
  const { services, pros } = await loadServicesAndPros(admin, shop.id, ids, input.professionalId);
  if (!services) return { ok: false, error: 'Serviço não encontrado.' };
  const now = new Date();
  const fromDate = todayLocal(now, shop.timezone);
  const days = Math.min(Math.max(input.days, 1), 60);
  const busy = await loadBusy(admin, shop, fromDate, days, input.ignoreAppointmentId);
  return {
    ok: true,
    days: freeTimesByDay({
      shop: hoursOf(shop), pros, fromDate, days, durationMin: totals(services).duration, busy, now, minLeadMin: input.minLeadMin,
    }),
  };
}

/** Confere se o horário está livre e escolhe o profissional. Usado ao agendar e ao remarcar. */
export async function pickSlot(
  admin: SupabaseClient,
  shop: ShopLike,
  a: { serviceIds: string[]; professionalId: string; date: string; time: string; now: Date; minLeadMin: number; ignoreId?: string },
): Promise<
  | { ok: true; services: ChosenService[]; pro: BookPro; start: Date; end: Date }
  | { ok: false; error: string; conflict?: boolean }
> {
  const { services, pros } = await loadServicesAndPros(admin, shop.id, a.serviceIds, a.professionalId);
  if (!services) return { ok: false, error: 'Serviço não encontrado.' };
  if (!pros.length) return { ok: false, error: 'Nenhum profissional faz todos os serviços escolhidos.' };
  const { duration } = totals(services);
  const busy = await loadBusy(admin, shop, a.date, 1, a.ignoreId);
  const slot = slotsForDay({
    shop: hoursOf(shop), pros, date: a.date, durationMin: duration, busy, now: a.now, minLeadMin: a.minLeadMin,
  }).find((s) => s.time === a.time);
  if (!slot || slot.proIds.length === 0) return { ok: false, conflict: true, error: 'Esse horário acabou de ser ocupado. Escolha outro.' };
  const pro = pros.find((p) => p.id === choosePro(slot.proIds, loadByPro(busy)))!;
  const start = localToDate(a.date, toMin(a.time), shop.timezone);
  return { ok: true, services, pro, start, end: new Date(start.getTime() + duration * 60_000) };
}

export type BookingInput = {
  serviceIds: string[];
  professionalId: string; // id ou "any"
  date: string;
  time: string;
  name: string;
  phone: string;
  consent: boolean;
};

export type BookingResult =
  | {
      ok: true;
      appointment: {
        id: string; date: string; time: string; serviceName: string; proName: string; priceCents: number; durationMin: number;
        manageToken: string;
      };
      whatsapp: 'sent' | 'pending' | 'off';
    }
  | { ok: false; error: string; conflict?: boolean; needCode?: boolean };

export async function createBooking(
  admin: SupabaseClient,
  shop: ShopLike,
  input: BookingInput,
  opts: { source: 'online' | 'painel'; minLeadMin: number; maxDaysAhead: number; verified?: boolean; now?: Date },
): Promise<BookingResult> {
  if (!accessOf(shop).allowed) return { ok: false, error: UNAVAILABLE };

  const name = String(input.name ?? '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 80) return { ok: false, error: 'Digite o nome do cliente.' };
  const phone = normalizePhone(input.phone);
  if (!phone) return { ok: false, error: 'Digite um WhatsApp válido com DDD, por exemplo (62) 91234-5678.' };
  if (!isValidDate(input.date) || !isValidTime(input.time)) return { ok: false, error: 'Data ou horário inválido.' };
  const serviceIds = cleanServiceIds(input.serviceIds);
  if (!serviceIds) return { ok: false, error: 'Escolha de 1 a 5 serviços.' };

  const now = opts.now ?? new Date();
  const today = todayLocal(now, shop.timezone);
  if (input.date < today || input.date > addDays(today, opts.maxDaysAhead)) {
    return { ok: false, error: 'Esse dia não está disponível para agendamento.' };
  }

  const picked = await pickSlot(admin, shop, {
    serviceIds, professionalId: input.professionalId, date: input.date, time: input.time, now, minLeadMin: opts.minLeadMin,
  });
  if (!picked.ok) return picked;
  const { services, pro, start, end } = picked;
  const sum = totals(services);

  // Cliente já cadastrado: o nome NÃO é trocado (quem digitou o telefone pode não ser o dono do número).
  // A permissão de WhatsApp só muda se o número foi confirmado por código, ou pelo próprio dono no balcão.
  const { data: existing } = await admin
    .from('clients').select('id, name, phone, wa_consent').eq('shop_id', shop.id).eq('phone', phone).maybeSingle();
  let client = existing as { id: string; name: string; phone: string; wa_consent: boolean } | null;
  if (client) {
    const { count } = await admin
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', client.id)
      .eq('status', 'confirmed')
      .gte('starts_at', now.toISOString());
    if (opts.source === 'online' && (count ?? 0) >= MAX_OPEN_BOOKINGS_PER_CLIENT) {
      return { ok: false, error: 'Este número já tem 3 horários marcados. Cancele um deles ou fale com o estabelecimento.' };
    }
    const mayChangeConsent = opts.source === 'painel' || opts.verified === true;
    if (mayChangeConsent && client.wa_consent !== input.consent) {
      await admin.from('clients').update({ wa_consent: input.consent }).eq('id', client.id);
      client = { ...client, wa_consent: input.consent };
    }
  } else {
    const ins = await admin
      .from('clients')
      .insert({ shop_id: shop.id, name, phone, wa_consent: input.consent })
      .select('id, name, phone, wa_consent')
      .single();
    if (ins.error?.code === '23505') {
      // outro pedido criou o mesmo cliente no mesmo instante
      const again = await admin.from('clients').select('id, name, phone, wa_consent').eq('shop_id', shop.id).eq('phone', phone).maybeSingle();
      client = again.data as typeof client;
    } else client = ins.data as typeof client;
  }
  if (!client) return { ok: false, error: 'Não foi possível salvar seus dados. Tente de novo.' };

  const due = reminderDueTimes(start, now, shop);
  const { data: appt, error: apptErr } = await admin
    .from('appointments')
    .insert({
      shop_id: shop.id,
      professional_id: pro.id,
      service_id: services[0].id,
      service_ids: serviceIds,
      client_id: client.id,
      service_name: sum.name,
      price_cents: sum.price,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      source: opts.source,
      reminder_due_at: due.soon?.toISOString() ?? null,
      day_reminder_due_at: due.dayBefore?.toISOString() ?? null,
    })
    .select('id, starts_at, manage_token, confirmation_sent_at, confirmation_attempts, reminder_sent_at, reminder_attempts, day_reminder_sent_at, day_reminder_attempts')
    .single();
  if (apptErr || !appt) {
    // 23P01 = o banco recusou porque outra pessoa pegou o horário no mesmo instante
    if (apptErr?.code === '23P01') return { ok: false, conflict: true, error: 'Esse horário acabou de ser ocupado. Escolha outro.' };
    return { ok: false, error: 'Não foi possível concluir o agendamento. Tente de novo.' };
  }

  let whatsapp: 'sent' | 'pending' | 'off' = 'off';
  if (shop.whatsapp_enabled && client.wa_consent) {
    const notify: NotifyAppt = {
      ...appt,
      service_name: sum.name,
      client: { name: client.name, phone: client.phone, wa_consent: client.wa_consent },
      shop,
      pro: { name: pro.name },
    };
    const r = await deliverConfirmation(admin, notify);
    whatsapp = r === 'sent' ? 'sent' : r === 'failed' ? 'pending' : 'off';
  }

  return {
    ok: true,
    whatsapp,
    appointment: {
      id: appt.id,
      date: dateOf(appt.starts_at, shop.timezone),
      time: timeOf(appt.starts_at, shop.timezone),
      serviceName: sum.name,
      proName: pro.name,
      priceCents: sum.price,
      durationMin: sum.duration,
      manageToken: appt.manage_token,
    },
  };
}
