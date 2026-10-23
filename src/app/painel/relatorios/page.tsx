import type { Metadata } from 'next';
import Link from 'next/link';
import { requireActiveShop } from '@/lib/auth';
import { buildReport, type Report } from '@/lib/reports';
import { loadReportRows, type ReportRow } from '@/lib/report-data';
import { STATUS_PT } from '@/lib/report-export';
import { currentLabel, isPeriodKind, PERIOD_KINDS, PERIOD_LABEL, periodOf, previousPeriod, weeksOf, type PeriodKind } from '@/lib/periods';
import { proWindow } from '@/lib/availability';
import { addDays, brl, dateOf, dayMonth, isValidDate, timeOf, todayLocal, toMin, weekday, weekdayShort } from '@/lib/time';
import { maskPhone } from '@/lib/phone';
import { PrintButton } from '@/components/print-button';
import { RevenueBars } from '@/components/revenue-bars';
import type { Professional } from '@/lib/types';

export const metadata: Metadata = { title: 'Relatórios' };

const LIST_LIMIT = 500; // acima disso a lista fica pesada na tela; a planilha traz todos
const pct = (x: number) => `${(x * 100).toFixed(x < 0.1 && x > 0 ? 1 : 0).replace('.', ',')}%`;
const reais = (c: number) => brl(c).replace(/,00$/, '');
const dm = (d: string) => `${weekdayShort(weekday(d))} ${dayMonth(d)}`;

function Change({ now, before, money }: { now: number; before: number; money?: boolean }) {
  if (!before && !now) return <small>igual ao período anterior</small>;
  if (!before) return <small>sem dados no período anterior</small>;
  const d = (now - before) / before;
  const diff = money ? reais(Math.abs(now - before)) : String(Math.abs(now - before));
  return <small>{d >= 0 ? '▲' : '▼'} {pct(Math.abs(d))} ({d >= 0 ? '+' : '−'}{diff}) vs. período anterior</small>;
}

type Tipo = 'agendamentos' | 'faturamento';
type SP = { tipo?: string; p?: string; d?: string };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { supabase, shop } = await requireActiveShop();
  const sp = await searchParams;
  const tz = shop.timezone;
  const today = todayLocal(new Date(), tz);
  const tipo: Tipo = sp.tipo === 'faturamento' ? 'faturamento' : 'agendamentos';
  const kind: PeriodKind = isPeriodKind(sp.p) ? sp.p : 'semana';
  const ref = sp.d && isValidDate(sp.d) ? sp.d : today;
  const period = periodOf(kind, ref);
  const prevPeriod = previousPeriod(period);

  const [{ rows: all, truncated }, prosRes] = await Promise.all([
    loadReportRows(supabase, tz, prevPeriod.from, period.to),
    supabase.from('professionals').select('*').order('created_at'),
  ]);
  const pros = (prosRes.data ?? []) as Professional[];
  const rows = all.filter((r) => dateOf(r.starts_at, tz) >= period.from);
  const r = buildReport(rows, period.from, period.to, tz);
  const prev = buildReport(all, prevPeriod.from, prevPeriod.to, tz);
  const proName = (id: string) => pros.find((p) => p.id === id)?.name ?? 'Profissional';

  const href = (o: Partial<{ tipo: Tipo; p: PeriodKind; d: string }>) => {
    const q = new URLSearchParams({ tipo, p: kind, d: ref, ...o });
    if (q.get('tipo') === 'agendamentos') q.delete('tipo');
    if (q.get('p') === 'semana') q.delete('p');
    if (q.get('d') === today) q.delete('d');
    const s = q.toString();
    return `/painel/relatorios${s ? `?${s}` : ''}`;
  };
  const exportHref = `/painel/relatorios/exportar?${new URLSearchParams({ tipo, p: kind, d: ref })}`;
  const isCurrent = today >= period.from && today <= period.to;

  return (
    <>
      <nav className="tabs no-print" aria-label="Tipo de relatório">
        <Link href={href({ tipo: 'agendamentos' })} aria-current={tipo === 'agendamentos' ? 'page' : undefined}>Agendamentos</Link>
        <Link href={href({ tipo: 'faturamento' })} aria-current={tipo === 'faturamento' ? 'page' : undefined}>Faturamento</Link>
      </nav>

      <div className="row no-print" style={{ justifyContent: 'space-between' }}>
        <div className="chips" role="group" aria-label="Período">
          {PERIOD_KINDS.map((k) => (
            <Link key={k} className="btn sm" aria-pressed={k === kind} href={href({ p: k })}>{PERIOD_LABEL[k]}</Link>
          ))}
        </div>
        <div className="row">
          <Link className="btn sm" href={href({ d: period.prev })} aria-label="Período anterior">←</Link>
          {!isCurrent ? <Link className="btn sm" href={href({ d: today })}>{currentLabel[kind]}</Link> : null}
          <Link className="btn sm" href={href({ d: period.next })} aria-label="Próximo período">→</Link>
          <form action="/painel/relatorios" method="get" className="row">
            {tipo !== 'agendamentos' ? <input type="hidden" name="tipo" value={tipo} /> : null}
            <input type="hidden" name="p" value={kind} />
            <label className="sr" htmlFor="rd">Ir para a data</label>
            <input id="rd" type="date" name="d" defaultValue={ref} style={{ width: 'auto' }} />
            <button className="btn sm">Ir</button>
          </form>
        </div>
      </div>

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <p className="hint">{tipo === 'agendamentos' ? 'Relatório de agendamentos' : 'Relatório de faturamento'} · {shop.name}</p>
          <h2 style={{ font: '700 28px/1.1 var(--f-display)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {kind === 'dia' && period.from === today ? `Hoje, ${period.label}` : period.label}
          </h2>
        </div>
        <div className="row no-print">
          <a className="btn sm" href={exportHref}>Baixar planilha</a>
          <PrintButton />
        </div>
      </div>
      {truncated ? <p className="flash warn">Período com muitos agendamentos: os números mostram só parte dele. Escolha um período menor.</p> : null}

      {tipo === 'agendamentos'
        ? <Appointments r={r} prev={prev} rows={rows} kind={kind} today={today} tz={tz} proName={proName} pros={pros} />
        : <Revenue r={r} prev={prev} rows={rows} kind={kind} today={today} tz={tz} proName={proName} pros={pros} shop={shop} from={period.from} to={period.to} />}

      <p className="note">Gerado em {dayMonth(today)}/{today.slice(0, 4)} às {timeOf(new Date(), tz)}. Horários no fuso {tz.replace('America/', '').replace('_', ' ')}.</p>
    </>
  );
}

type Common = {
  r: Report; prev: Report; rows: ReportRow[]; kind: PeriodKind; today: string; tz: string;
  proName: (id: string) => string; pros: Professional[];
};

function Appointments({ r, prev, rows, kind, today, tz, proName, pros }: Common) {
  const c = r.counts;
  const closed = c.done + c.noshow;
  const byPro = pros
    .map((p) => {
      const mine = rows.filter((x) => x.professional_id === p.id);
      const n = (s: string) => mine.filter((x) => x.status === s).length;
      return { p, booked: mine.filter((x) => x.status !== 'cancelled').length, confirmed: n('confirmed'), done: n('done'), noshow: n('noshow'), cancelled: n('cancelled') };
    })
    .filter((x) => x.p.active || x.booked || x.cancelled);
  const list = rows.slice(0, LIST_LIMIT);
  let lastDay = '';

  return (
    <>
      <div className="stats">
        <div className="stat"><span>Agendamentos</span><b>{c.booked}</b><Change now={c.booked} before={prev.counts.booked} /></div>
        <div className="stat"><span>Concluídos</span><b>{c.done}</b><small>{c.confirmed} confirmados a atender</small></div>
        <div className="stat"><span>Faltas</span><b>{c.noshow}</b><small>{closed ? `${pct(c.noshow / closed)} dos atendimentos encerrados` : 'nenhum atendimento encerrado'}</small></div>
        <div className="stat"><span>Cancelados</span><b>{c.cancelled}</b><small>{c.booked + c.cancelled ? `${pct(c.online / (c.booked + c.cancelled))} marcados online` : ' '}</small></div>
      </div>

      {kind !== 'dia' ? (
        <section className="card">
          <h3>Por dia</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Dia</th><th className="n">Agendados</th><th className="n">Concluídos</th><th className="n">Confirmados</th><th className="n">Faltas</th><th className="n">Cancelados</th></tr></thead>
              <tbody>
                {r.days.map((d) => (
                  <tr key={d.date} className={d.date === today ? 'today' : undefined}>
                    <td>{dm(d.date)}{d.date === today ? ' · hoje' : ''}</td>
                    <td className="n">{d.counts.booked}</td><td className="n">{d.counts.done}</td><td className="n">{d.counts.confirmed}</td>
                    <td className="n">{d.counts.noshow}</td><td className="n">{d.counts.cancelled}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td>Total</td><td className="n">{c.booked}</td><td className="n">{c.done}</td><td className="n">{c.confirmed}</td><td className="n">{c.noshow}</td><td className="n">{c.cancelled}</td></tr></tfoot>
            </table>
          </div>
        </section>
      ) : null}

      <section className="card">
        <h3>Por profissional</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Profissional</th><th className="n">Agendados</th><th className="n">Concluídos</th><th className="n">Confirmados</th><th className="n">Faltas</th><th className="n">Cancelados</th></tr></thead>
            <tbody>
              {byPro.map((x) => (
                <tr key={x.p.id}><td>{x.p.name}</td><td className="n">{x.booked}</td><td className="n">{x.done}</td><td className="n">{x.confirmed}</td><td className="n">{x.noshow}</td><td className="n">{x.cancelled}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h3>Lista de agendamentos <small className="hint" style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>{rows.length} no período</small></h3>
        {rows.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr>{kind !== 'dia' ? <th>Dia</th> : null}<th>Hora</th><th>Cliente</th><th>Serviço</th><th>Profissional</th><th>Situação</th><th className="n">Valor</th></tr></thead>
              <tbody>
                {list.map((a) => {
                  const d = dateOf(a.starts_at, tz);
                  const first = d !== lastDay;
                  lastDay = d;
                  return (
                    <tr key={a.id} className={first && kind !== 'dia' ? 'daystart' : undefined}>
                      {kind !== 'dia' ? <td>{first ? dm(d) : ''}</td> : null}
                      <td className="n" style={{ textAlign: 'left' }}>{timeOf(a.starts_at, tz)}</td>
                      <td>{a.clients?.name ?? 'Cliente'}<span className="sub">{a.clients?.phone ? maskPhone(a.clients.phone) : ''}</span></td>
                      <td>{a.service_name}</td>
                      <td>{a.professionals?.name ?? proName(a.professional_id)}</td>
                      <td><span className={`pill ${a.status}`}>{STATUS_PT[a.status]}</span></td>
                      <td className="n">{brl(a.price_cents)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="hint">Nenhum agendamento neste período.</p>}
        {rows.length > LIST_LIMIT ? <p className="note">Mostrando os primeiros {LIST_LIMIT}. Baixe a planilha para ver todos os {rows.length}.</p> : null}
      </section>
    </>
  );
}

function Revenue({ r, prev, rows, kind, today, tz, pros, shop, from, to }: Common & { shop: { open_time: string; close_time: string; open_days: number[]; slot_minutes: number }; from: string; to: string }) {
  const weeks = kind === 'mes' ? weeksOf(r.days) : [];
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
  const done = rows.filter((a) => a.status === 'done');

  return (
    <>
      <div className="stats">
        <div className="stat"><span>Faturado</span><b>{reais(r.revenue)}</b><Change now={r.revenue} before={prev.revenue} money /></div>
        <div className="stat"><span>Atendimentos concluídos</span><b>{r.done}</b><small>ticket médio {brl(r.ticket)}</small></div>
        <div className="stat"><span>A receber</span><b>{reais(r.expected)}</b><small>{r.counts.confirmed} confirmados ainda não concluídos</small></div>
        <div className="stat"><span>Perdido com faltas</span><b>{reais(r.lostToNoshow)}</b><small>{r.noshow} falta{r.noshow === 1 ? '' : 's'}</small></div>
      </div>
      {r.counts.confirmed && from <= today ? (
        <p className="hint">Dica: marque como "Concluído" na agenda os atendimentos já feitos. Só eles entram no faturado.</p>
      ) : null}

      {kind !== 'dia' ? (
        <section className="card">
          <h3>Faturado por dia</h3>
          <RevenueBars days={r.days} highlight={today} />
          <p className="note">Atendimentos concluídos em cada dia. Passe o mouse (ou toque) numa barra para ver o valor.</p>
        </section>
      ) : null}

      {kind === 'semana' ? (
        <section className="card">
          <h3>Por dia</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Dia</th><th className="n">Atendimentos</th><th className="n">Faturado</th><th className="n">Ticket médio</th><th className="n">A receber</th></tr></thead>
              <tbody>
                {r.days.map((d) => (
                  <tr key={d.date} className={d.date === today ? 'today' : undefined}>
                    <td>{dm(d.date)}{d.date === today ? ' · hoje' : ''}</td><td className="n">{d.count}</td><td className="n">{brl(d.revenue)}</td>
                    <td className="n">{d.count ? brl(Math.round(d.revenue / d.count)) : '—'}</td><td className="n">{brl(d.expected)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td>Total</td><td className="n">{r.done}</td><td className="n">{brl(r.revenue)}</td><td className="n">{brl(r.ticket)}</td><td className="n">{brl(r.expected)}</td></tr></tfoot>
            </table>
          </div>
        </section>
      ) : null}

      {kind === 'mes' ? (
        <section className="card">
          <h3>Por semana</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Semana</th><th className="n">Atendimentos</th><th className="n">Faturado</th><th className="n">Ticket médio</th><th className="n">A receber</th></tr></thead>
              <tbody>
                {weeks.map((w) => {
                  const rev = w.days.reduce((n, d) => n + d.revenue, 0);
                  const cnt = w.days.reduce((n, d) => n + d.count, 0);
                  return (
                    <tr key={w.from}>
                      <td>{dayMonth(w.from)} a {dayMonth(w.to)}</td><td className="n">{cnt}</td><td className="n">{brl(rev)}</td>
                      <td className="n">{cnt ? brl(Math.round(rev / cnt)) : '—'}</td><td className="n">{brl(w.days.reduce((n, d) => n + d.expected, 0))}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot><tr><td>Total do mês</td><td className="n">{r.done}</td><td className="n">{brl(r.revenue)}</td><td className="n">{brl(r.ticket)}</td><td className="n">{brl(r.expected)}</td></tr></tfoot>
            </table>
          </div>
        </section>
      ) : null}

      <div className="two-cards">
        <section className="card">
          <h3>Por profissional</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Profissional</th><th className="n">Atend.</th><th className="n">Faturado</th><th className="n">Ocupação</th></tr></thead>
              <tbody>
                {pros.map((p) => {
                  const s = r.byPro.find((x) => x.id === p.id) ?? { count: 0, revenue: 0, minutes: 0 };
                  if (!p.active && !s.count) return null;
                  const cap = capacity(p);
                  return (
                    <tr key={p.id}><td>{p.name}</td><td className="n">{s.count}</td><td className="n">{brl(s.revenue)}</td><td className="n">{cap ? pct(Math.min(1, s.minutes / cap)) : '—'}</td></tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="note">Ocupação = tempo dos atendimentos concluídos ÷ jornada no período (sem o almoço).</p>
        </section>
        <section className="card">
          <h3>Por serviço</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Serviço</th><th className="n">Qtd.</th><th className="n">Faturado</th></tr></thead>
              <tbody>
                {r.byService.map((s) => <tr key={s.name}><td>{s.name}</td><td className="n">{s.count}</td><td className="n">{brl(s.revenue)}</td></tr>)}
                {!r.byService.length ? <tr><td colSpan={3} className="hint">Nenhum atendimento concluído no período.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {kind === 'dia' ? (
        <section className="card">
          <h3>Atendimentos concluídos</h3>
          {done.length ? (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Hora</th><th>Cliente</th><th>Serviço</th><th>Profissional</th><th className="n">Valor</th></tr></thead>
                <tbody>
                  {done.map((a) => (
                    <tr key={a.id}><td>{timeOf(a.starts_at, tz)}</td><td>{a.clients?.name ?? 'Cliente'}</td><td>{a.service_name}</td><td>{a.professionals?.name ?? ''}</td><td className="n">{brl(a.price_cents)}</td></tr>
                  ))}
                </tbody>
                <tfoot><tr><td colSpan={4}>Total</td><td className="n">{brl(r.revenue)}</td></tr></tfoot>
              </table>
            </div>
          ) : <p className="hint">Nenhum atendimento concluído neste dia.</p>}
        </section>
      ) : null}
    </>
  );
}
