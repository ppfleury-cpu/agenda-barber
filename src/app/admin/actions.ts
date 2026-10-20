'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { extendPaidUntil, extendTrial } from '@/lib/billing';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Marcar pagamento manual (cliente pagou o Pix): soma dias ao período pago. */
export async function markPaid(fd: FormData) {
  await requireAdmin();
  const id = String(fd.get('id') ?? '');
  const days = Math.min(Math.max(Number(fd.get('days') ?? 30), 1), 366);
  if (!UUID.test(id)) redirect('/admin?err=Pedido inválido.');
  const admin = createAdminClient();
  const { data } = await admin.from('shops').select('paid_until').eq('id', id).maybeSingle();
  if (!data) redirect('/admin?err=Barbearia não encontrada.');
  const paid_until = extendPaidUntil(data.paid_until, days);
  await admin.from('shops').update({ paid_until, suspended: false }).eq('id', id);
  revalidatePath('/admin');
  redirect('/admin?ok=Pagamento registrado.');
}

export async function addTrial(fd: FormData) {
  await requireAdmin();
  const id = String(fd.get('id') ?? '');
  if (!UUID.test(id)) redirect('/admin?err=Pedido inválido.');
  const admin = createAdminClient();
  const { data } = await admin.from('shops').select('trial_ends_at').eq('id', id).maybeSingle();
  if (!data) redirect('/admin?err=Barbearia não encontrada.');
  await admin.from('shops').update({ trial_ends_at: extendTrial(data.trial_ends_at, 7) }).eq('id', id);
  revalidatePath('/admin');
  redirect('/admin?ok=Teste prorrogado em 7 dias.');
}

export async function setSuspended(fd: FormData) {
  await requireAdmin();
  const id = String(fd.get('id') ?? '');
  const suspended = String(fd.get('suspended')) === 'true';
  if (!UUID.test(id)) redirect('/admin?err=Pedido inválido.');
  await createAdminClient().from('shops').update({ suspended }).eq('id', id);
  revalidatePath('/admin');
  redirect(`/admin?ok=${suspended ? 'Conta suspensa.' : 'Conta reativada.'}`);
}
