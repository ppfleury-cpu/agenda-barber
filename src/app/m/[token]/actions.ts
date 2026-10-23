'use server';

import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { cancelByClient, confirmPresence, managedAvailability, rescheduleByClient, TOKEN_RE, type ManageResult } from '@/lib/manage';
import { LIMITS, withinLimit } from '@/lib/rate-limit';
import type { AvailabilityResult } from '@/lib/booking';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOO_MANY = 'Muitas tentativas seguidas. Espere alguns minutos.';

async function blocked(): Promise<boolean> {
  const h = await headers();
  const ip = (h.get('x-forwarded-for')?.split(',')[0] ?? h.get('x-real-ip') ?? 'desconhecido').trim();
  return !(await withinLimit(createAdminClient(), `manage:${ip}`, LIMITS.manage.windowSec, LIMITS.manage.max));
}

// Abertas ao mundo: o token de 64 caracteres no link é a única credencial.
export async function confirmPresenceAction(token: string): Promise<ManageResult> {
  if (!TOKEN_RE.test(String(token))) return { ok: false, error: 'Link inválido.' };
  if (await blocked()) return { ok: false, error: TOO_MANY };
  return confirmPresence(createAdminClient(), token);
}

export async function cancelAction(token: string): Promise<ManageResult> {
  if (!TOKEN_RE.test(String(token))) return { ok: false, error: 'Link inválido.' };
  if (await blocked()) return { ok: false, error: TOO_MANY };
  return cancelByClient(createAdminClient(), token);
}

export async function rescheduleAvailabilityAction(token: string, professionalId: string): Promise<AvailabilityResult> {
  if (!TOKEN_RE.test(String(token)) || !(professionalId === 'any' || UUID.test(String(professionalId)))) return { ok: false, error: 'Pedido inválido.' };
  if (await blocked()) return { ok: false, error: TOO_MANY };
  return managedAvailability(createAdminClient(), token, professionalId);
}

export async function rescheduleAction(token: string, input: { date: string; time: string; professionalId: string }): Promise<ManageResult> {
  if (!TOKEN_RE.test(String(token)) || !input || !(input.professionalId === 'any' || UUID.test(String(input.professionalId)))) {
    return { ok: false, error: 'Pedido inválido.' };
  }
  if (await blocked()) return { ok: false, error: TOO_MANY };
  return rescheduleByClient(createAdminClient(), token, { date: String(input.date), time: String(input.time), professionalId: input.professionalId });
}
