import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runReminders } from '@/lib/reminder-run';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Roda a cada 5 minutos (veja vercel.json). Envia os lembretes que venceram, refaz confirmações que falharam
// e limpa registros velhos de limite de tentativas. Sem WhatsApp configurado, nenhuma mensagem sai.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET não configurado' }, { status: 500 });
  const received = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ error: 'não autorizado' }, { status: 401 });
  return NextResponse.json({ ok: true, ...(await runReminders(createAdminClient())) });
}
