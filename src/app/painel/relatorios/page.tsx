import type { Metadata } from 'next';
import Link from 'next/link';
import { requireActiveShop } from '@/lib/auth';
import { buildReport, type ReportAppt } from '@/lib/reports';
import { proWindow } from '@/lib/availability';
import { addDays, brl, dayMonth, localToDate, todayLocal, toMin, weekday, weekdayShort } from '@/lib/time';
import type { Professional } from '@/lib/types';

export const metadata: Metadata = { title: 'Relatórios' };

const RANGES = [7, 14, 30, 90] as const;
const PAGE_ROWS = 1000;
const MAX_PAGES = 30;
const pct = (x: number) => `${(x * 100).toFixed(x < 0.1 && x > 0 ? 1 : 0).replace('.', ',')}%`;
const reais = (c: number) => brl(c).replace(/,00$/, '');

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const { supabase, shop } = await requireActiveShop();
  const sp = await searchParams;
  const range = (RANGES as readonly number[]).includes(Number(sp.r)) ? Number(sp.r) : 30;
  const tz = shop.timezone;
  const to = todayLocal(new Date(), tz);
  const from = addDays(to, -(range - 1));
  const prevFrom = addDays(from, -range);

  // O Supabase devolve no máximo 1.000 linhas por consulta: busca em páginas para não cortar o período.
  const appts: ReportAppt[] = [];
  let truncated = false;
  for (let page = 0; ; page++) {
    const { data } = await supabase
      .from('appointments')
      .select('id, professional_id, service_name, price_cents, starts_at, ends_at, status, source')
      .gte('starts_at', localToDate(prevFrom, 0, tz).toISOString())
      .lt('starts_at', localToDate(addDays(to, 1), 0, tz).toISOString())
      .order('starts_at')
      .order('id')
      .range(page * PAGE_ROWS, page * PAGE_ROWS + PAGE_ROWS - 1);
    const rows = (data ?? []) as ReportAppt[];
    appts.push(...rows);
    if (rows.length < PAGE_ROWS) break;
    if (page + 1 >= MAX_PAGES) { truncated = true; break; }
  }
  const prosRes = await supabase.from('professionals').select('*').order('created_at');
  const pros = (prosRes.data ?? []) as Professional[];
  const r = buildReport(appts, from, to, tz);
  const prev = buildReport(appts, prevFrom, addDays(from, -1), tz);
  const diff = prev.revenue ? (r.revenue - prev.revenue) / prev.revenue : null;

  // Capacidade de cada profissional no período (jornada menos almoço), para a ocupação.
  const capacity = (p: Professional) => {
    let min = 0;
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (!shop.open_days.includes(weekday(d)) || !p.work_days.includes(weekday(d))) continue;
      const w = proWindow(shop, p);
      if (!w) continue;
      min += w[1] - w[0];
      if (p.break_start && p.break_end) min -= Math.max(0, Math.min(w[1], toMin(p.break_end)) - Math.max(w[0], toMin(p.break_start)));
    }
    return min;
  };

  // Gráfico de barras: faturamento por dia
  const W = 720, H = 220, L = 56, B = 26, T = 12;
  const max = Math.max(1, ...r.days.map((d) => d.revenue));
  const step = [5000, 10000, 20000, 50000, 100000, 200000, 500000].find((s) => max / s <= 5) ?? 1000000;
  const top = Math.ceil(max / step) * step;
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  const bw = (W - L) / r.days.length;
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  const labelEvery = r.days.length <= 14 ? 1 : r.days.length <= 30 ? 3 : 7;

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ font: '700 26px var(--f-display)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Últimos {range} dias</h2>
        <div className="chips" role="group" aria-label="Período">
          {RANGES.map((n) => <Link key={n} className="btn sm" aria-pressed={n === range} href={`/painel/relatorios?r=${n}`}>{n} dias</Link>)}
        </div>
      </div>

      {truncated ? <p className="flash warn">Período com muitos agendamentos: os números mostram só parte dele. Escolha um período menor.</p> : null}
      <div className="stats">
        <div className="stat"><span>Faturamento</span><b>{reais(r.revenue)}</b><small>{diff === null ? 'concluídos no período' : `${diff >= 0 ? '▲' : '▼'} ${pct(Math.abs(diff))} vs. ${range} dias anteriores`}</small></div>
        <div className="stat"><span>Atendimentos</span><b>{r.done}</b><small>ticket médio {brl(r.ticket)}</small></div>
        <div className="stat"><span>Taxa de faltas</span><b>{pct(r.noshowRate)}</b><small>{r.noshow} falta{r.noshow === 1 ? '' : 's'} · {reais(r.lostToNoshow)} perdidos</small></div>
        <div className="stat"><span>Marcados online</span><b>{pct(r.onlineShare)}</b><small>{r.cancelled} cancelamento{r.cancelled === 1 ? '' : 's'}</small></div>
      </div>

      <section className="card">
        <h3>Faturamento por dia</h3>
        <div className="chart">
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Faturamento diário dos últimos ${range} dias. Maior dia: ${reais(max)}.`}>
            {ticks.map((v) => (
              <g key={v}>
                <line x1={L} x2={W} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={1} />
                <text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">{v ? reais(v) : '0'}</text>
              </g>
            ))}
            {r.days.map((d, i) => {
              const x = L + i * bw + 2, w = Math.max(2, bw - 4), h = H - B - y(d.revenue);
              const rad = Math.min(4, w / 2, h);
              const path = h > 0
                ? `M${x},${H - B} V${y(d.revenue) + rad} Q${x},${y(d.revenue)} ${x + rad},${y(d.revenue)} H${x + w - rad} Q${x + w},${y(d.revenue)} ${x + w},${y(d.revenue) + rad} V${H - B} Z`
                : '';
              return (
                <g key={d.date} className="bar-g">
                  <title>{`${weekdayShort(weekday(d.date))} ${dayMonth(d.date)}: ${brl(d.revenue)} · ${d.count} atendimento${d.count === 1 ? '' : 's'}`}</title>
                  <rect x={L + i * bw} y={T} width={bw} height={H - T - B} fill="transparent" />
                  {path ? <path d={path} fill="var(--accent)" /> : null}
                  {i % labelEvery === (r.days.length - 1) % labelEvery ? (
                    <text x={x + w / 2} y={H - 8} textAnchor="middle" fontSize={11} fill={d.date === to ? 'var(--ink)' : 'var(--muted)'} fontWeight={d.date === to ? 700 : 400}>
                      {range <= 7 ? weekdayShort(weekday(d.date)) : d.date.slice(8)}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>
        </div>
        <p className="note">Atendimentos concluídos em cada dia. Passe o mouse (ou toque) numa barra para ver o valor.</p>
      </section>

      <div className="two-cards">
        <section className="card">
          <h3>Serviços</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Serviço</th><th className="n">Qtd.</th><th className="n">Receita</th></tr></thead>
              <tbody>
                {r.byService.map((s) => <tr key={s.name}><td>{s.name}</td><td className="n">{s.count}</td><td className="n">{reais(s.revenue)}</td></tr>)}
                {!r.byService.length ? <tr><td colSpan={3} className="hint">Nenhum atendimento concluído no período.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
        <section className="card">
          <h3>Equipe</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Profissional</th><th className="n">Atend.</th><th className="n">Receita</th><th className="n">Ocupação</th><th className="n">Faltas</th></tr></thead>
              <tbody>
                {pros.map((p) => {
                  const s = r.byPro.find((x) => x.id === p.id) ?? { count: 0, revenue: 0, minutes: 0, noshow: 0 };
                  const cap = capacity(p);
                  if (!p.active && !s.count) return null;
                  return (
                    <tr key={p.id}>
                      <td>{p.name}</td><td className="n">{s.count}</td><td className="n">{reais(s.revenue)}</td>
                      <td className="n">{cap ? pct(Math.min(1, s.minutes / cap)) : '—'}</td><td className="n">{s.noshow}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="note">Ocupação = tempo de atendimentos concluídos ÷ jornada no período (sem o almoço).</p>
        </section>
      </div>
    </>
  );
}
