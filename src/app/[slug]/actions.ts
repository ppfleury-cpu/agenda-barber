'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createBooking, getAvailability, type AvailabilityResult, type BookingInput, type BookingResult } from '@/lib/booking';
import { PUBLIC_SHOP_COLUMNS, type PublicShop } from '@/lib/types';

const PUBLIC_DAYS = 14;
const PUBLIC_LEAD_MIN = 15;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function shopBySlug(slug: string): Promise<PublicShop | null> {
  const admin = createAdminClient();
  const { data } = await admin.from('shops').select(PUBLIC_SHOP_COLUMNS).eq('slug', String(slug).toLowerCase()).maybeSingle();
  return (data as PublicShop | null) ?? null;
}

const validId = (v: unknown, allowAny = false) => typeof v === 'string' && ((allowAny && v === 'any') || UUID.test(v));

// Estas funções são abertas ao mundo: tudo que chega aqui é tratado como não confiável.
export async function getAvailabilityAction(slug: string, serviceId: string, professionalId: string): Promise<AvailabilityResult> {
  if (!validId(serviceId) || !validId(professionalId, true)) return { ok: false, error: 'Pedido inválido.' };
  const shop = await shopBySlug(slug);
  if (!shop) return { ok: false, error: 'Página não encontrada.' };
  return getAvailability(createAdminClient(), shop, { serviceId, professionalId, days: PUBLIC_DAYS, minLeadMin: PUBLIC_LEAD_MIN });
}

export async function bookAction(slug: string, input: BookingInput & { hp?: string }): Promise<BookingResult> {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Pedido inválido.' };
  if (input.hp) return { ok: false, error: 'Não foi possível concluir o agendamento.' }; // campo-armadilha para robôs
  if (!validId(input.serviceId) || !validId(input.professionalId, true)) return { ok: false, error: 'Pedido inválido.' };
  const shop = await shopBySlug(slug);
  if (!shop) return { ok: false, error: 'Página não encontrada.' };
  return createBooking(
    createAdminClient(),
    shop,
    {
      serviceId: input.serviceId,
      professionalId: input.professionalId,
      date: String(input.date ?? ''),
      time: String(input.time ?? ''),
      name: String(input.name ?? ''),
      phone: String(input.phone ?? ''),
      consent: Boolean(input.consent),
    },
    { source: 'online', minLeadMin: PUBLIC_LEAD_MIN, maxDaysAhead: PUBLIC_DAYS - 1 },
  );
}
