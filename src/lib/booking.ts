import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  choosePro, dayWindow, freeTimesByDay, loadByPro, slotsForDay, type Busy, type Pro, type ShopHours,
} from './availability';
import { accessOf } from './billing';
import { deliverConfirmation, type NotifyAppt } from './notify';
import { normalizePhone } from './phone';
import { addDays, dateOf, isValidDate, isValidTime, timeOf, todayLocal, toMin, localToDate } from './time';
import type { PublicShop } from './types';

const MAX_OPEN_BOOKINGS_PER_CLIENT = 3;

type ShopLike = PublicShop;

async function loadBusy(admin: SupabaseClient, shopId: string, fromDate: string, days: number): Promise<Busy[]> {
  const { start, end } = dayWindow(fromDate, days);
  const [appts, blocks] = await Promise.all([
    admin
      .from('appointments')
      .select('professional_id, starts_at, ends_at')
      .eq('shop_id', shopId)
      .in('status', ['confirmed', 'done'])
      .lt('starts_at', end.toISOString())
      .gt('ends_at', start.toISOString()),
    admin
      .from('time_blocks')
      .select('professional_id, starts_at, ends_at')
      .eq('shop_id', shopId)
      .lt('starts_at', end.toISOString())
      .gt('ends_at', start.toISOString()),
  ]);
  const toBusy = (rows: { professional_id: string | null; starts_at: string; ends_at: string }[] | null, kind: Busy['kind']) =>
    (rows ?? []).map((r) => ({
      professional_id: r.professional_id,
      start: new Date(r.starts_at).getTime(),
      end: new Date(r.ends_at).getTime(),
      kind,
    }));
  return [...toBusy(appts.data, 'appt'), ...toBusy(blocks.data, 'block')];
}

async function loadServiceAndPros(admin: SupabaseClient, shopId: string, serviceId: string, professionalId: string) {
  const [svc, prosRes] = await Promise.all([
    admin
      .from('services')
      .select('id, name, duration_min, price_cents')
      .eq('id', serviceId)
      .eq('shop_id', shopId)
      .eq('active', true)
      .maybeSingle(),
    admin.from('professionals').select('id, name, work_days').eq('shop_id', shopId).eq('active', true).order('created_at'),
  ]);
  let pros = (prosRes.data ?? []) as (Pro & { name: string })[];
  if (professionalId !== 'any') pros = pros.filter((p) => p.id === professionalId);
  return {
    service: svc.data as { id: string; name: string; duration_min: number; price_cents: number } | null,
    pros,
  };
}

const hoursOf = (s: ShopLike): ShopHours => ({
  open_time: s.open_time, close_time: s.close_time, open_days: s.open_days, slot_minutes: s.slot_minutes,
});

export type AvailabilityResult =
  | { ok: true; days: Record<string, string[]> }
  | { ok: false; error: string };

/** Horários livres dos próximos dias para um serviço (e profissional ou "qualquer um"). */
export async function getAvailability(
  admin: SupabaseClient,
  shop: ShopLike,
  input: { serviceId: string; professionalId: string; days: number; minLeadMin: number },
): Promise<AvailabilityResult> {
  if (!accessOf(shop).allowed) return { ok: false, error: 'A agenda desta barbearia está indisponível no momento.' };
  const { service, pros } = await loadServiceAndPros(admin, shop.id, input.serviceId, input.professionalId);
  if (!service) return { ok: false, error: 'Serviço não encontrado.' };
  const now = new Date();
  const fromDate = todayLocal(now);
  const days = Math.min(Math.max(input.days, 1), 60);
  const busy = await loadBusy(admin, shop.id, fromDate, days);
  return {
    ok: true,
    days: freeTimesByDay({
      shop: hoursOf(shop), pros, fromDate, days, durationMin: service.duration_min, busy, now, minLeadMin: input.minLeadMin,
    }),
  };
}

export type BookingInput = {
  serviceId: string;
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
      appointment: { id: string; date: string; time: string; serviceName: string; proName: string; priceCents: number; durationMin: number };
      whatsapp: 'sent' | 'pending' | 'off';
    }
  | { ok: false; error: string; conflict?: boolean };

export async function createBooking(
  admin: SupabaseClient,
  shop: ShopLike,
  input: BookingInput,
  opts: { source: 'online' | 'painel'; minLeadMin: number; maxDaysAhead: number },
): Promise<BookingResult> {
  if (!accessOf(shop).allowed) return { ok: false, error: 'A agenda desta barbearia está indisponível no momento.' };

  const name = String(input.name ?? '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 80) return { ok: false, error: 'Digite o nome do cliente.' };
  const phone = normalizePhone(input.phone);
  if (!phone) return { ok: false, error: 'Digite um WhatsApp válido com DDD, por exemplo (62) 91234-5678.' };
  if (!isValidDate(input.date) || !isValidTime(input.time)) return { ok: false, error: 'Data ou horário inválido.' };

  const now = new Date();
  const today = todayLocal(now);
  if (input.date < today || input.date > addDays(today, opts.maxDaysAhead)) {
    return { ok: false, error: 'Esse dia não está disponível para agendamento.' };
  }

  const { service, pros } = await loadServiceAndPros(admin, shop.id, input.serviceId, input.professionalId);
  if (!service) return { ok: false, error: 'Serviço não encontrado.' };

  const busy = await loadBusy(admin, shop.id, input.date, 1);
  const slot = slotsForDay({
    shop: hoursOf(shop), pros, date: input.date, durationMin: service.duration_min, busy, now, minLeadMin: opts.minLeadMin,
  }).find((s) => s.time === input.time);
  if (!slot || slot.proIds.length === 0) {
    return { ok: false, conflict: true, error: 'Esse horário acabou de ser ocupado. Escolha outro.' };
  }
  const proId = choosePro(slot.proIds, loadByPro(busy))!;
  const pro = pros.find((p) => p.id === proId)!;

  // Limite contra abuso: um mesmo telefone não pode segurar muitos horários futuros.
  const { data: existing } = await admin.from('clients').select('id').eq('shop_id', shop.id).eq('phone', phone).maybeSingle();
  if (existing) {
    const { count } = await admin
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', existing.id)
      .eq('status', 'confirmed')
      .gte('starts_at', now.toISOString());
    if ((count ?? 0) >= MAX_OPEN_BOOKINGS_PER_CLIENT) {
      return { ok: false, error: 'Este número já tem 3 horários marcados. Cancele um deles ou fale com a barbearia.' };
    }
  }

  const { data: client, error: clientErr } = await admin
    .from('clients')
    .upsert({ shop_id: shop.id, name, phone, wa_consent: input.consent }, { onConflict: 'shop_id,phone' })
    .select('id, name, phone, wa_consent')
    .single();
  if (clientErr || !client) return { ok: false, error: 'Não foi possível salvar seus dados. Tente de novo.' };

  const start = localToDate(input.date, toMin(input.time));
  const end = new Date(start.getTime() + service.duration_min * 60_000);
  const { data: appt, error: apptErr } = await admin
    .from('appointments')
    .insert({
      shop_id: shop.id,
      professional_id: proId,
      service_id: service.id,
      client_id: client.id,
      service_name: service.name,
      price_cents: service.price_cents,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      source: opts.source,
    })
    .select('id, starts_at, confirmation_sent_at, confirmation_attempts, reminder_sent_at, reminder_attempts')
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
      service_name: service.name,
      client: { name: client.name, phone: client.phone, wa_consent: client.wa_consent },
      shop: shop,
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
      date: dateOf(appt.starts_at),
      time: timeOf(appt.starts_at),
      serviceName: service.name,
      proName: pro.name,
      priceCents: service.price_cents,
      durationMin: service.duration_min,
    },
  };
}
