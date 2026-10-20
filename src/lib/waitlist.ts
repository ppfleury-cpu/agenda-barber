import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { accessOf } from './billing';
import { cleanServiceIds } from './booking';
import { normalizePhone } from './phone';
import { addDays, isValidDate, todayLocal } from './time';
import type { PublicShop } from './types';

export type WaitlistInput = { date: string; serviceIds: string[]; professionalId: string; name: string; phone: string };

/** Entra na lista de espera de um dia lotado. Repetir o mesmo número no mesmo dia não duplica. */
export async function joinWaitlist(
  admin: SupabaseClient, shop: PublicShop, input: WaitlistInput, now: Date = new Date(),
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!accessOf(shop).allowed) return { ok: false, error: 'A agenda está indisponível no momento.' };
  const name = String(input.name ?? '').trim().replace(/\s+/g, ' ');
  const phone = normalizePhone(input.phone);
  const ids = cleanServiceIds(input.serviceIds);
  const today = todayLocal(now, shop.timezone);
  if (name.length < 2 || name.length > 80) return { ok: false, error: 'Digite seu nome.' };
  if (!phone) return { ok: false, error: 'Digite um WhatsApp válido com DDD.' };
  if (!ids) return { ok: false, error: 'Escolha o serviço.' };
  if (!isValidDate(input.date) || input.date < today || input.date > addDays(today, shop.booking_window_days - 1)) {
    return { ok: false, error: 'Esse dia não está disponível.' };
  }
  const { data: svcs } = await admin.from('services').select('id').eq('shop_id', shop.id).in('id', ids);
  if ((svcs ?? []).length !== ids.length) return { ok: false, error: 'Serviço não encontrado.' };
  let professionalId: string | null = null;
  if (input.professionalId !== 'any') {
    const { data } = await admin.from('professionals').select('id').eq('shop_id', shop.id).eq('id', input.professionalId).maybeSingle();
    professionalId = data ? input.professionalId : null;
  }
  const { error } = await admin
    .from('waitlist')
    .insert({ shop_id: shop.id, date: input.date, name, phone, service_ids: ids, professional_id: professionalId });
  if (error && error.code !== '23505') return { ok: false, error: 'Não foi possível entrar na lista. Tente de novo.' };
  return { ok: true };
}
