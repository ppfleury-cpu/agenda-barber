import { requireActiveShop } from '@/lib/auth';
import { buildReport } from '@/lib/reports';
import { loadReportRows } from '@/lib/report-data';
import { appointmentsCsv, revenueCsv } from '@/lib/report-export';
import { isPeriodKind, periodOf } from '@/lib/periods';
import { isValidDate, todayLocal } from '@/lib/time';

export const dynamic = 'force-dynamic';

// Baixa o relatório em planilha: /painel/relatorios/exportar?tipo=agendamentos|faturamento&p=dia|semana|mes&d=AAAA-MM-DD
export async function GET(request: Request) {
  const { supabase, shop } = await requireActiveShop();
  const url = new URL(request.url);
  const tipo = url.searchParams.get('tipo') === 'faturamento' ? 'faturamento' : 'agendamentos';
  const kindParam = url.searchParams.get('p');
  const kind = isPeriodKind(kindParam) ? kindParam : 'semana';
  const dParam = url.searchParams.get('d') ?? '';
  const ref = isValidDate(dParam) ? dParam : todayLocal(new Date(), shop.timezone);
  const period = periodOf(kind, ref);

  const { rows } = await loadReportRows(supabase, shop.timezone, period.from, period.to);
  const names = new Map(rows.map((r) => [r.professional_id, r.professionals?.name ?? 'Profissional']));
  const csv = tipo === 'agendamentos'
    ? appointmentsCsv(rows, shop.timezone, period)
    : revenueCsv(buildReport(rows, period.from, period.to, shop.timezone), period, (id) => names.get(id) ?? 'Profissional');

  const file = `${tipo}-${kind}-${period.from}${period.to !== period.from ? `_a_${period.to}` : ''}.csv`;
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${file}"`,
      'Cache-Control': 'no-store',
    },
  });
}
