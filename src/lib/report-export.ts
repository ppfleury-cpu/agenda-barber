// Conteúdo das planilhas dos relatórios (agendamentos e faturamento). Funções puras.
import { toCsv, moneyCell, dateCell, type Cell } from './csv';
import { dateOf, timeOf } from './time';
import { weeksOf, type Period } from './periods';
import type { Report } from './reports';

export const STATUS_PT: Record<string, string> = { confirmed: 'Confirmado', done: 'Concluído', noshow: 'Faltou', cancelled: 'Cancelado' };

export type ExportRow = {
  starts_at: string;
  ends_at: string;
  service_name: string;
  price_cents: number;
  status: string;
  source: string;
  clients: { name: string; phone: string } | null;
  professionals: { name: string } | null;
};

export function appointmentsCsv(rows: ExportRow[], tz: string, period: Period): string {
  const body: Cell[][] = [
    [`Agendamentos · ${period.label}`],
    [],
    ['Data', 'Início', 'Fim', 'Cliente', 'WhatsApp', 'Serviço', 'Profissional', 'Situação', 'Origem', 'Valor (R$)'],
    ...rows.map((r) => [
      dateCell(dateOf(r.starts_at, tz)), timeOf(r.starts_at, tz), timeOf(r.ends_at, tz),
      r.clients?.name ?? '', r.clients?.phone ?? '', r.service_name, r.professionals?.name ?? '',
      STATUS_PT[r.status] ?? r.status, r.source === 'online' ? 'Online' : 'Painel', moneyCell(r.price_cents),
    ]),
  ];
  return toCsv(body);
}

export function revenueCsv(report: Report, period: Period, proName: (id: string) => string): string {
  const byWeek = period.kind === 'mes';
  const lines = byWeek
    ? weeksOf(report.days).map((w) => {
        const revenue = w.days.reduce((n, d) => n + d.revenue, 0);
        const count = w.days.reduce((n, d) => n + d.count, 0);
        const expected = w.days.reduce((n, d) => n + d.expected, 0);
        return [`${dateCell(w.from)} a ${dateCell(w.to)}`, count, moneyCell(revenue), moneyCell(count ? Math.round(revenue / count) : 0), moneyCell(expected)];
      })
    : report.days.map((d) => [dateCell(d.date), d.count, moneyCell(d.revenue), moneyCell(d.count ? Math.round(d.revenue / d.count) : 0), moneyCell(d.expected)]);
  const body: Cell[][] = [
    [`Faturamento · ${period.label}`],
    [],
    ['Faturado (concluídos)', moneyCell(report.revenue)],
    ['Atendimentos concluídos', report.done],
    ['Ticket médio', moneyCell(report.ticket)],
    ['A receber (confirmados)', moneyCell(report.expected)],
    ['Perdido com faltas', moneyCell(report.lostToNoshow)],
    [],
    [byWeek ? 'Semana' : 'Dia', 'Atendimentos', 'Faturado (R$)', 'Ticket médio (R$)', 'A receber (R$)'],
    ...lines,
    [],
    ['Profissional', 'Atendimentos', 'Faturado (R$)', 'Faltas'],
    ...report.byPro.map((p) => [proName(p.id), p.count, moneyCell(p.revenue), p.noshow]),
    [],
    ['Serviço', 'Quantidade', 'Faturado (R$)'],
    ...report.byService.map((s) => [s.name, s.count, moneyCell(s.revenue)]),
  ];
  return toCsv(body);
}
