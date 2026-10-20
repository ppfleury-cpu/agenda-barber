import 'server-only';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from './supabase/server';
import { accessOf } from './billing';
import type { Shop } from './types';

export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function requireUser() {
  const { supabase, user } = await getUser();
  if (!user) redirect('/login');
  return { supabase, user };
}

/** Usuário logado + a barbearia dele. Sem barbearia ainda, vai para o cadastro da barbearia. */
export async function requireShop() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from('shops').select('*').eq('owner_id', user.id).maybeSingle();
  if (!data) redirect('/onboarding');
  const shop = data as Shop;
  return { supabase, user, shop, access: accessOf(shop) };
}

/** Igual a requireShop, mas manda para a tela de assinatura se o teste/pagamento acabou. */
export async function requireActiveShop() {
  const ctx = await requireShop();
  if (!ctx.access.allowed) redirect('/painel/assinatura');
  return ctx;
}

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email?: string | null): boolean {
  return Boolean(email) && adminEmails().includes(String(email).toLowerCase());
}

export async function requireAdmin() {
  const { user } = await requireUser();
  if (!isAdminEmail(user.email)) redirect('/painel');
  return user;
}

/** Endereço do site, para montar links de confirmação de e-mail. */
export async function getOrigin(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}
