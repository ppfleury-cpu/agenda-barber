import 'server-only';
// Verificação do WhatsApp por código, no primeiro agendamento online de cada número.
// Impede que alguém use o número de outra pessoa: sem o código, nada é marcado e nenhuma mensagem
// sai para aquele número além do próprio código (com limite de quantidade).
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizePhone } from './phone';
import { sendTemplate, templateNames, whatsappConfigured } from './whatsapp';

export const CODE_TTL_MIN = 10;
export const MAX_CODE_ATTEMPTS = 5;
export const MAX_CODES_PER_HOUR = 3;
export const TRUST_DAYS = 180;

function secret(): string {
  const s = process.env.BOOKING_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error('BOOKING_SECRET não configurado');
  return s;
}
const hmac = (msg: string) => createHmac('sha256', secret()).update(msg).digest('hex');
const sameHex = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Sem WhatsApp configurado não há como mandar código, e também não sai nenhuma mensagem: não pede. */
export const verificationRequired = () => whatsappConfigured();

export type VerifyResult = { ok: true } | { ok: false; error: string };

export async function requestCode(
  admin: SupabaseClient, shop: { id: string }, phoneRaw: string, now: Date = new Date(),
): Promise<VerifyResult> {
  const phone = normalizePhone(phoneRaw);
  if (!phone) return { ok: false, error: 'Digite um WhatsApp válido com DDD, por exemplo (62) 91234-5678.' };
  const { count } = await admin
    .from('phone_verifications')
    .select('id', { count: 'exact', head: true })
    .eq('shop_id', shop.id)
    .eq('phone', phone)
    .gte('created_at', new Date(now.getTime() - 3_600_000).toISOString());
  if ((count ?? 0) >= MAX_CODES_PER_HOUR) {
    return { ok: false, error: 'Já enviamos vários códigos para este número. Espere um pouco e tente de novo.' };
  }
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const { error } = await admin.from('phone_verifications').insert({
    shop_id: shop.id,
    phone,
    code_hash: hmac(`code:${shop.id}:${phone}:${code}`),
    expires_at: new Date(now.getTime() + CODE_TTL_MIN * 60_000).toISOString(),
    created_at: now.toISOString(),
  });
  if (error) return { ok: false, error: 'Não foi possível gerar o código. Tente de novo.' };
  const sent = await sendTemplate(phone, templateNames().code, [code], { buttonUrlParam: code });
  if (!sent.ok) return { ok: false, error: 'Não conseguimos enviar o código para esse WhatsApp. Confira o número.' };
  return { ok: true };
}

export async function checkCode(
  admin: SupabaseClient, shopId: string, phoneRaw: string, codeRaw: string, now: Date = new Date(),
): Promise<VerifyResult> {
  const phone = normalizePhone(phoneRaw);
  const code = String(codeRaw ?? '').replace(/\D/g, '');
  if (!phone || code.length !== 6) return { ok: false, error: 'Digite o código de 6 números que chegou no WhatsApp.' };
  const { data } = await admin
    .from('phone_verifications')
    .select('id, code_hash, attempts, expires_at, verified_at')
    .eq('shop_id', shopId)
    .eq('phone', phone)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = data as { id: string; code_hash: string; attempts: number; expires_at: string; verified_at: string | null } | null;
  if (!row || row.verified_at || new Date(row.expires_at).getTime() <= now.getTime()) {
    return { ok: false, error: 'O código expirou. Peça um novo.' };
  }
  if (row.attempts >= MAX_CODE_ATTEMPTS) return { ok: false, error: 'Muitas tentativas erradas. Peça um novo código.' };
  if (!sameHex(row.code_hash, hmac(`code:${shopId}:${phone}:${code}`))) {
    await admin.from('phone_verifications').update({ attempts: row.attempts + 1 }).eq('id', row.id);
    return { ok: false, error: 'Código incorreto. Confira a mensagem e digite de novo.' };
  }
  await admin.from('phone_verifications').update({ verified_at: now.toISOString() }).eq('id', row.id);
  return { ok: true };
}

/** Lembra no navegador que este número já foi confirmado nesta barbearia (cookie assinado). */
export const trustCookieName = (shopId: string) => `ab_ok_${shopId.replace(/-/g, '').slice(0, 12)}`;

export function trustToken(shopId: string, phone: string): string {
  return `${phone}.${hmac(`trust:${shopId}:${phone}`).slice(0, 40)}`;
}

export function isTrusted(token: string | undefined, shopId: string, phoneRaw: string): boolean {
  const phone = normalizePhone(phoneRaw);
  if (!token || !phone) return false;
  return sameHex(token, trustToken(shopId, phone));
}
