'use server';

import { cookies, headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  cleanServiceIds, createBooking, getAvailability, type AvailabilityResult, type BookingInput, type BookingResult,
} from '@/lib/booking';
import { LIMITS, withinLimit } from '@/lib/rate-limit';
import { checkCode, isTrusted, requestCode, TRUST_DAYS, trustCookieName, trustToken, verificationRequired } from '@/lib/verify';
import { joinWaitlist, type WaitlistInput } from '@/lib/waitlist';
import { normalizePhone } from '@/lib/phone';
import { PUBLIC_SHOP_COLUMNS, type PublicShop } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOO_MANY = 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.';

async function shopBySlug(slug: string): Promise<PublicShop | null> {
  const admin = createAdminClient();
  const { data } = await admin.from('shops').select(PUBLIC_SHOP_COLUMNS).eq('slug', String(slug).toLowerCase()).maybeSingle();
  return (data as PublicShop | null) ?? null;
}

const validId = (v: unknown, allowAny = false) => typeof v === 'string' && ((allowAny && v === 'any') || UUID.test(v));
const validIds = (v: unknown) => {
  const ids = cleanServiceIds(v);
  return ids && ids.every((id) => UUID.test(id)) ? ids : null;
};

/** IP de quem chamou (a Vercel preenche x-forwarded-for). */
async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get('x-forwarded-for')?.split(',')[0] ?? h.get('x-real-ip') ?? 'desconhecido').trim();
}

async function limited(kind: keyof typeof LIMITS, extra = ''): Promise<boolean> {
  const { windowSec, max } = LIMITS[kind];
  return !(await withinLimit(createAdminClient(), `${kind}:${await clientIp()}${extra}`, windowSec, max));
}

async function trusted(shopId: string, phone: string): Promise<boolean> {
  return isTrusted((await cookies()).get(trustCookieName(shopId))?.value, shopId, phone);
}

// Estas funções são abertas ao mundo: tudo que chega aqui é tratado como não confiável.
export async function getAvailabilityAction(slug: string, serviceIds: string[], professionalId: string): Promise<AvailabilityResult> {
  const ids = validIds(serviceIds);
  if (!ids || !validId(professionalId, true)) return { ok: false, error: 'Pedido inválido.' };
  if (await limited('availability')) return { ok: false, error: TOO_MANY };
  const shop = await shopBySlug(slug);
  if (!shop) return { ok: false, error: 'Página não encontrada.' };
  return getAvailability(createAdminClient(), shop, {
    serviceIds: ids, professionalId, days: shop.booking_window_days, minLeadMin: shop.min_lead_min,
  });
}

export type CodeResult = { ok: true; needed: boolean } | { ok: false; error: string };

/** Primeiro passo ao confirmar: diz se precisa de código e, se precisar, envia. */
export async function requestCodeAction(slug: string, phone: string): Promise<CodeResult> {
  const shop = await shopBySlug(slug);
  if (!shop) return { ok: false, error: 'Página não encontrada.' };
  const digits = normalizePhone(String(phone ?? ''));
  if (!digits) return { ok: false, error: 'Digite um WhatsApp válido com DDD, por exemplo (62) 91234-5678.' };
  if (!verificationRequired() || (await trusted(shop.id, digits))) return { ok: true, needed: false };
  if (await limited('code')) return { ok: false, error: TOO_MANY };
  const r = await requestCode(createAdminClient(), shop, digits);
  return r.ok ? { ok: true, needed: true } : r;
}

export async function bookAction(slug: string, input: BookingInput & { hp?: string; code?: string }): Promise<BookingResult> {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Pedido inválido.' };
  if (input.hp) return { ok: false, error: 'Não foi possível concluir o agendamento.' }; // campo-armadilha para robôs
  const ids = validIds(input.serviceIds);
  if (!ids || !validId(input.professionalId, true)) return { ok: false, error: 'Pedido inválido.' };
  if (await limited('booking')) return { ok: false, error: TOO_MANY };
  const shop = await shopBySlug(slug);
  if (!shop) return { ok: false, error: 'Página não encontrada.' };
  const admin = createAdminClient();
  const phone = String(input.phone ?? '');

  let verified = false;
  if (verificationRequired()) {
    if (await trusted(shop.id, phone)) verified = true;
    else {
      if (!input.code) return { ok: false, needCode: true, error: 'Confirme o código que enviamos no seu WhatsApp.' };
      const c = await checkCode(admin, shop.id, phone, String(input.code));
      if (!c.ok) return { ok: false, needCode: true, error: c.error };
      verified = true;
      const digits = normalizePhone(phone)!;
      (await cookies()).set(trustCookieName(shop.id), trustToken(shop.id, digits), {
        httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: TRUST_DAYS * 86_400,
      });
    }
  }

  return createBooking(
    admin,
    shop,
    {
      serviceIds: ids,
      professionalId: input.professionalId,
      date: String(input.date ?? ''),
      time: String(input.time ?? ''),
      name: String(input.name ?? ''),
      phone,
      consent: Boolean(input.consent),
    },
    { source: 'online', minLeadMin: shop.min_lead_min, maxDaysAhead: shop.booking_window_days - 1, verified },
  );
}

export async function joinWaitlistAction(slug: string, input: WaitlistInput): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Pedido inválido.' };
  const ids = validIds(input.serviceIds);
  if (!ids || !validId(input.professionalId, true)) return { ok: false, error: 'Pedido inválido.' };
  if (await limited('waitlist')) return { ok: false, error: TOO_MANY };
  const shop = await shopBySlug(slug);
  if (!shop) return { ok: false, error: 'Página não encontrada.' };
  return joinWaitlist(createAdminClient(), shop, {
    date: String(input.date ?? ''), serviceIds: ids, professionalId: input.professionalId,
    name: String(input.name ?? ''), phone: String(input.phone ?? ''),
  });
}
