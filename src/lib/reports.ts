// Números da tela de relatórios. Função pura: recebe os agendamentos do período e devolve os totais.
import { addDays, dateOf } from './time';

export type ReportAppt = {
  professional_id: string;
  service_name: string;
  price_cents: number;
  starts_at: string;
  ends_at: string;
  status: 'confirmed' | 'done' | 'noshow' | 'cancelled';
  source: 'online' | 'painel' | string;
};

export type Report = {
  days: { date: string; revenue: number; count: number }[];
  revenue: number;
  done: number;
  ticket: number;
  noshow: number;
  noshowRate: number; // 0..1, sobre os horários que não foram cancelados
  lostToNoshow: number;
  cancelled: number;
  onlineShare: number; // 0..1
  byService: { name: string; count: number; revenue: number }[];
  byPro: { id: string; count: number; revenue: number; minutes: number; noshow: number }[];
};

/** Faturamento = atendimentos concluídos. Os dias vão de `from` até `to` (inclusive). */
export function buildReport(appts: ReportAppt[], from: string, to: string, tz?: string | null): Report {
  const days: Report['days'] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push({ date: d, revenue: 0, count: 0 });
  const dayIdx = new Map(days.map((d, i) => [d.date, i]));
  const bySvc = new Map<string, { name: string; count: number; revenue: number }>();
  const byPro = new Map<string, { id: string; count: number; revenue: number; minutes: number; noshow: number }>();
  let revenue = 0, done = 0, noshow = 0, lost = 0, cancelled = 0, online = 0, total = 0;

  for (const a of appts) {
    const i = dayIdx.get(dateOf(a.starts_at, tz));
    if (i === undefined) continue;
    total++;
    if (a.source === 'online') online++;
    const pro = byPro.get(a.professional_id) ?? { id: a.professional_id, count: 0, revenue: 0, minutes: 0, noshow: 0 };
    if (a.status === 'done') {
      done++;
      revenue += a.price_cents;
      days[i].revenue += a.price_cents;
      days[i].count++;
      pro.count++;
      pro.revenue += a.price_cents;
      pro.minutes += Math.round((new Date(a.ends_at).getTime() - new Date(a.starts_at).getTime()) / 60_000);
      // Vários serviços no mesmo horário aparecem juntos, pelo nome completo (ex.: "Corte + Barba").
      const s = bySvc.get(a.service_name) ?? { name: a.service_name, count: 0, revenue: 0 };
      s.count++;
      s.revenue += a.price_cents;
      bySvc.set(a.service_name, s);
    } else if (a.status === 'noshow') {
      noshow++;
      lost += a.price_cents;
      pro.noshow++;
    } else if (a.status === 'cancelled') cancelled++;
    byPro.set(a.professional_id, pro);
  }
  const notCancelled = total - cancelled;
  return {
    days, revenue, done,
    ticket: done ? Math.round(revenue / done) : 0,
    noshow,
    noshowRate: notCancelled ? noshow / notCancelled : 0,
    lostToNoshow: lost,
    cancelled,
    onlineShare: total ? online / total : 0,
    byService: [...bySvc.values()].sort((a, b) => b.revenue - a.revenue),
    byPro: [...byPro.values()].sort((a, b) => b.revenue - a.revenue),
  };
}
