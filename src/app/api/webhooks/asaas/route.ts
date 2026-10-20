import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { decideWebhook } from '@/lib/asaas-webhook';
import { paidUntilFromPayment } from '@/lib/billing';
import type { AsaasWebhook } from '@/lib/asaas';

export const dynamic = 'force-dynamic';

function sameToken(received: string | null, expected: string | undefined): boolean {
  if (!received || !expected) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// O Asaas avisa aqui quando uma mensalidade é paga. Configure em: Asaas > Integrações > Webhooks.
export async function POST(request: NextRequest) {
  if (!sameToken(request.headers.get('asaas-access-token'), process.env.ASAAS_WEBHOOK_TOKEN)) {
    return NextResponse.json({ error: 'não autorizado' }, { status: 401 });
  }
  let body: AsaasWebhook;
  try {
    body = (await request.json()) as AsaasWebhook;
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const decision = decideWebhook(body);
  if (decision.action === 'ignore') return NextResponse.json({ ok: true, ignored: decision.reason });

  const admin = createAdminClient();

  // Já processamos este aviso? (o Asaas pode enviar o mesmo aviso mais de uma vez)
  const { error: dupErr } = await admin
    .from('billing_events')
    .insert({ event_id: decision.eventKey, event: body.event ?? '', payload: body as unknown as Record<string, unknown> });
  if (dupErr) {
    if (dupErr.code === '23505') return NextResponse.json({ ok: true, duplicate: true });
    return NextResponse.json({ error: 'falha ao registrar o evento' }, { status: 500 });
  }

  // Descobre a barbearia: pela assinatura, pelo cliente do Asaas ou pela referência que enviamos.
  let q = admin.from('shops').select('id, paid_until');
  if (decision.subscriptionId) q = q.eq('asaas_subscription_id', decision.subscriptionId);
  else if (decision.customerId) q = q.eq('asaas_customer_id', decision.customerId);
  else if (decision.shopId && UUID.test(decision.shopId)) q = q.eq('id', decision.shopId);
  else return NextResponse.json({ ok: true, ignored: 'sem como identificar a barbearia' });
  const { data: shop } = await q.maybeSingle();
  if (!shop) return NextResponse.json({ ok: true, ignored: 'barbearia não encontrada' });

  const paid_until = paidUntilFromPayment(decision.dueDate, shop.paid_until);
  const { error } = await admin.from('shops').update({ paid_until, suspended: false }).eq('id', shop.id);
  if (error) {
    // Libera o aviso para o Asaas tentar de novo.
    await admin.from('billing_events').delete().eq('event_id', decision.eventKey);
    return NextResponse.json({ error: 'falha ao atualizar a assinatura' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, paid_until });
}
