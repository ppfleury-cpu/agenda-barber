import type { Metadata } from 'next';
import Link from 'next/link';
import { getOrigin, requireActiveShop } from '@/lib/auth';
import { addDays, brl, dateOf, dayLabel, dayMonth, fromMin, isValidDate, localToDate, monthShort, timeOf, todayLocal, weekday } from '@/lib/time';
import { maskPhone, waLink } from '@/lib/phone';
import { confirmationText, reminderText } from '@/lib/whatsapp';
import { CopyButton } from '@/components/copy-button';
import { addBlock, deleteBlock, setStatus } from './actions';
import type { AppointmentStatus, Professional, TimeBlock } from '@/lib/types';

export const metadata: Metadata = { title: 'Agenda' };

type Row = {
  id: string;
  professional_id: string;
  service_name: string;
  price_cents: number;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  source: string;
  confirmation_sent_at: string | null;
  reminder_sent_at: string | null;
  clients: { name: string; phone: string } | null;
};

const STATUS_LABEL: Record<AppointmentStatus, string> = { confirmed: 'Confirmado', done: 'Concluído', noshow: 'Faltou', cancelled: 'Cancelado' };

const timeOptions = (from: number, to: number, selected: string) => {
  const out: { v: string; sel: boolean }[] = [];
  for (let m = from; m <= to; m += 15) out.push({ v: fromMin(m), sel: fromMin(m) === selected });
  return out;
};

export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ d?: string; ok?: string; err?: string; novo?: string }> }) {
  const { supabase, shop } = await requireActiveShop();
  const sp = await searchParams;
  const now = new Date();
  const today = todayLocal(now);
  const date = sp.d && isValidDate(sp.d) ? sp.d : today;

  const dayStart = localToDate(date, 0).toISOString();
  const dayEnd = localToDate(addDays(date, 1), 0).toISOString();

  const [apptRes, prosRes, blocksRes] = await Promise.all([
    supabase
      .from('appointments')
      .select('id, professional_id, service_name, price_cents, starts_at, ends_at, status, source, confirmation_sent_at, reminder_sent_at, clients(name, phone)')
      .gte('starts_at', dayStart)
      .lt('starts_at', dayEnd)
      .order('starts_at'),
    supabase.from('professionals').select('id, name, work_days, active').order('created_at'),
    supabase.from('time_blocks').select('id, professional_id, starts_at, ends_at, reason').lt('starts_at', dayEnd).gt('ends_at', dayStart).order('starts_at'),
  ]);
  const appts = (apptRes.data ?? []) as unknown as Row[];
  const pros = (prosRes.data ?? []) as Professional[];
  const blocks = (blocksRes.data ?? []) as TimeBlock[];

  const live = appts.filter((a) => a.status === 'confirmed' || a.status === 'done');
  const revenue = live.reduce((s, a) => s + a.price_cents, 0);
  const noshow = appts.filter((a) => a.status === 'noshow').length;
  const nowMs = now.getTime();
  const next = appts.find((a) => a.status === 'confirmed' && new Date(a.ends_at).getTime() > nowMs);

  const chips = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const origin = await getOrigin();
  const link = `${origin}/${shop.slug}`;

  const sections = pros.filter((p) => p.active || appts.some((a) => a.professional_id === p.id));
  const openMin = Number(shop.open_time.slice(0, 2)) * 60 + Number(shop.open_time.slice(3, 5));
  const closeMin = Number(shop.close_time.slice(0, 2)) * 60 + Number(shop.close_time.slice(3, 5));
  const proName = (id: string | null) => (id ? pros.find((p) => p.id === id)?.name ?? 'Profissional' : 'Todos');
  const closedDay = !shop.open_days.includes(weekday(date));

  return (
    <>
      {sp.ok ? <p className="flash ok" role="status">{sp.ok}</p> : null}
      {sp.err ? <p className="flash bad" role="alert">{sp.err}</p> : null}

      {sp.novo ? (
        <section className="card">
          <h2>Sua agenda está criada</h2>
          <p>Já deixamos 3 serviços e 1 profissional de exemplo. Falta pouco para receber clientes:</p>
          <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 4 }}>
            <li>Ajuste seus <Link href="/painel/servicos">serviços e preços</Link>.</li>
            <li>Cadastre sua <Link href="/painel/equipe">equipe e folgas</Link>.</li>
            <li>Confira o <Link href="/painel/configuracoes">horário de funcionamento</Link>.</li>
            <li>Coloque o link abaixo no Instagram e no WhatsApp.</li>
          </ol>
          <div className="linkbox"><code>{link}</code><CopyButton text={link} /></div>
        </section>
      ) : null}

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="days" role="group" aria-label="Escolha o dia" style={{ flex: 1, minWidth: 0 }}>
          {chips.map((d) => (
            <Link key={d} href={`/painel?d=${d}`} className="day" aria-pressed={d === date}>
              <span className="wd">{dayLabel(d, today)}</span>
              <span className="dn">{d.slice(8)}</span>
              <span className="mo">{monthShort(d)}</span>
            </Link>
          ))}
        </div>
      </div>
      <div className="row">
        <Link className="btn sm" href={`/painel?d=${addDays(date, -1)}`}>← Dia anterior</Link>
        <Link className="btn sm" href={`/painel?d=${addDays(date, 1)}`}>Próximo dia →</Link>
        <form action="/painel" method="get" className="row">
          <label className="sr" htmlFor="goto">Ir para a data</label>
          <input id="goto" type="date" name="d" defaultValue={date} style={{ width: 'auto' }} />
          <button className="btn sm">Ir</button>
        </form>
        <Link className="btn primary sm" href={`/painel/novo?d=${date >= today ? date : today}`}>Novo agendamento</Link>
      </div>
      <h2 style={{ font: '700 26px var(--f-display)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {dayLabel(date, today)} · {dayMonth(date)}
      </h2>
      {closedDay ? <p className="hint">Não há atendimento neste dia.</p> : null}

      <div className="stats">
        <div className="stat"><span>Agendamentos</span><b>{live.length}</b></div>
        <div className="stat"><span>Faturamento previsto</span><b>{brl(revenue)}</b></div>
        <div className="stat"><span>Faltas</span><b>{noshow}</b></div>
        <div className="stat"><span>Próximo cliente</span><b>{next ? timeOf(next.starts_at) : '—'}</b></div>
      </div>

      {sections.map((p) => {
        const list = appts.filter((a) => a.professional_id === p.id);
        const act = list.filter((a) => a.status === 'confirmed' || a.status === 'done');
        const works = p.work_days.includes(weekday(date)) && !closedDay;
        return (
          <section className="prosec" key={p.id}>
            <h3>
              {p.name}
              <small>{act.length} atendimento{act.length === 1 ? '' : 's'} · {brl(act.reduce((s, a) => s + a.price_cents, 0))}</small>
              {works ? null : <span className="pill warn">Folga</span>}
              {p.active ? null : <span className="pill cancelled">Desativado</span>}
            </h3>
            {list.length ? list.map((a) => {
              const inactive = a.status === 'cancelled' || a.status === 'noshow';
              const phone = a.clients?.phone ?? '';
              const data = {
                clientName: a.clients?.name ?? '', shopName: shop.name, serviceName: a.service_name, proName: p.name,
                date: dateOf(a.starts_at), time: timeOf(a.starts_at), today,
              };
              return (
                <div className={`appt${inactive ? ' off' : ''}`} key={a.id}>
                  <div className="t">{timeOf(a.starts_at)}<small>até {timeOf(a.ends_at)}</small></div>
                  <div className="who">
                    <b>{a.clients?.name ?? 'Cliente'}</b>
                    <span>
                      {a.service_name} · {brl(a.price_cents)}{phone ? ` · ${maskPhone(phone)}` : ''}
                      {a.source === 'painel' ? ' · marcado no painel' : ''}
                    </span>
                    {a.status === 'confirmed' ? (
                      <span style={{ display: 'block' }}>
                        {a.confirmation_sent_at ? 'Confirmação enviada' : 'Confirmação não enviada'}
                        {a.reminder_sent_at ? ' · lembrete enviado' : ''}
                      </span>
                    ) : null}
                  </div>
                  <div className="st"><span className={`pill ${a.status}`}>{STATUS_LABEL[a.status]}</span></div>
                  <div className="acts">
                    {a.status === 'confirmed' ? (
                      <>
                        {phone ? (
                          <>
                            <a className="btn sm" target="_blank" rel="noopener" href={waLink(phone, reminderText(data))}>Lembrar no WhatsApp</a>
                            {!a.confirmation_sent_at ? (
                              <a className="btn sm" target="_blank" rel="noopener" href={waLink(phone, confirmationText(data))}>Confirmar no WhatsApp</a>
                            ) : null}
                          </>
                        ) : null}
                        {(['done', 'noshow', 'cancelled'] as const).map((to) => (
                          <form action={setStatus} key={to}>
                            <input type="hidden" name="id" value={a.id} />
                            <input type="hidden" name="to" value={to} />
                            <input type="hidden" name="d" value={date} />
                            <button className="btn sm">{to === 'done' ? 'Concluir' : to === 'noshow' ? 'Faltou' : 'Cancelar'}</button>
                          </form>
                        ))}
                      </>
                    ) : (
                      <form action={setStatus}>
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="to" value="confirmed" />
                        <input type="hidden" name="d" value={date} />
                        <button className="btn sm">Desfazer</button>
                      </form>
                    )}
                  </div>
                </div>
              );
            }) : <div className="empty">{works ? 'Nenhum agendamento neste dia.' : `${p.name} não trabalha neste dia.`}</div>}
          </section>
        );
      })}

      {blocks.length ? (
        <section className="prosec">
          <h3>Horários bloqueados</h3>
          {blocks.map((b) => (
            <div className="appt" key={b.id}>
              <div className="t">{timeOf(b.starts_at)}<small>até {timeOf(b.ends_at)}</small></div>
              <div className="who"><b>{proName(b.professional_id)}</b><span>{b.reason || 'Bloqueado'}</span></div>
              <div className="acts" style={{ gridColumn: 'auto' }}>
                <form action={deleteBlock}>
                  <input type="hidden" name="id" value={b.id} />
                  <input type="hidden" name="d" value={date} />
                  <button className="btn sm">Remover</button>
                </form>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      <details className="card">
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Bloquear horário (almoço, compromisso, folga)</summary>
        <form action={addBlock} className="stack" style={{ gap: 14, marginTop: 14 }}>
          <input type="hidden" name="d" value={date} />
          <div className="fields">
            <div className="field">
              <label htmlFor="b-pro">Quem</label>
              <select id="b-pro" name="pro" defaultValue="all">
                <option value="all">Todos os profissionais</option>
                {pros.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="b-date">Dia</label>
              <input id="b-date" type="date" name="date" defaultValue={date} min={today} required />
            </div>
          </div>
          <div className="fields">
            <div className="field">
              <label htmlFor="b-from">Das</label>
              <select id="b-from" name="from" defaultValue="12:00">
                {timeOptions(openMin, closeMin, '12:00').map((o) => <option key={o.v} value={o.v}>{o.v}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="b-to">Até</label>
              <select id="b-to" name="to" defaultValue="13:00">
                {timeOptions(openMin, closeMin, '13:00').map((o) => <option key={o.v} value={o.v}>{o.v}</option>)}
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="b-reason">Motivo (opcional)</label>
            <input id="b-reason" name="reason" maxLength={80} placeholder="Almoço" />
          </div>
          <div><button className="btn primary">Bloquear</button></div>
        </form>
      </details>
    </>
  );
}
