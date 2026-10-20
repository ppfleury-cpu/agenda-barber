import type { Metadata } from 'next';
import Link from 'next/link';
import { getOrigin, requireActiveShop } from '@/lib/auth';
import {
  addDays, brl, dateOf, dayLabel, dayMonth, fromMin, hourWord, isValidDate, localToDate, monthShort, timeOf, todayLocal, toMin, weekday,
  localParts,
} from '@/lib/time';
import { maskPhone, waLink } from '@/lib/phone';
import { confirmationText, reminderText } from '@/lib/whatsapp';
import { manageUrl } from '@/lib/notify';
import { proWindow } from '@/lib/availability';
import { CopyButton } from '@/components/copy-button';
import { AgendaColumn } from '@/components/agenda-column';
import { addBlock, deleteBlock, deleteWaitlist, setStatus } from './actions';
import type { AppointmentStatus, Professional, Service, TimeBlock, WaitlistEntry } from '@/lib/types';

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
  presence: 'yes' | 'no' | null;
  cancelled_by: 'client' | 'owner' | null;
  manage_token: string;
  confirmation_sent_at: string | null;
  reminder_sent_at: string | null;
  day_reminder_sent_at: string | null;
  clients: { name: string; phone: string } | null;
};

const STATUS_LABEL: Record<AppointmentStatus, string> = { confirmed: 'Confirmado', done: 'Concluído', noshow: 'Faltou', cancelled: 'Cancelado' };
const PX = 1.6; // pixels por minuto na grade

const timeOptions = (from: number, to: number) => {
  const out: string[] = [];
  for (let m = from; m <= to; m += 15) out.push(fromMin(m));
  return out;
};

type SP = { d?: string; ok?: string; err?: string; novo?: string; view?: string; a?: string };

export default async function AgendaPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { supabase, shop } = await requireActiveShop();
  const sp = await searchParams;
  const tz = shop.timezone;
  const now = new Date();
  const today = todayLocal(now, tz);
  const date = sp.d && isValidDate(sp.d) ? sp.d : today;
  const view = sp.view === 'lista' ? 'lista' : 'grade';

  const dayStart = localToDate(date, 0, tz).toISOString();
  const dayEnd = localToDate(addDays(date, 1), 0, tz).toISOString();

  const [apptRes, prosRes, blocksRes, waitRes, svcRes] = await Promise.all([
    supabase
      .from('appointments')
      .select('id, professional_id, service_name, price_cents, starts_at, ends_at, status, source, presence, cancelled_by, manage_token, confirmation_sent_at, reminder_sent_at, day_reminder_sent_at, clients(name, phone)')
      .gte('starts_at', dayStart)
      .lt('starts_at', dayEnd)
      .order('starts_at'),
    supabase.from('professionals').select('*').order('created_at'),
    supabase.from('time_blocks').select('id, professional_id, starts_at, ends_at, reason').lt('starts_at', dayEnd).gt('ends_at', dayStart).order('starts_at'),
    supabase.from('waitlist').select('*').eq('date', date).order('created_at'),
    supabase.from('services').select('id, name'),
  ]);
  const appts = (apptRes.data ?? []) as unknown as Row[];
  const pros = (prosRes.data ?? []) as Professional[];
  const blocks = (blocksRes.data ?? []) as TimeBlock[];
  const waiting = (waitRes.data ?? []) as WaitlistEntry[];
  const svcName = (id: string) => ((svcRes.data ?? []) as Pick<Service, 'id' | 'name'>[]).find((s) => s.id === id)?.name ?? 'Serviço';

  const live = appts.filter((a) => a.status === 'confirmed' || a.status === 'done');
  const revenue = live.reduce((s, a) => s + a.price_cents, 0);
  const noshow = appts.filter((a) => a.status === 'noshow').length;
  const presenceOk = appts.filter((a) => a.status === 'confirmed' && a.presence === 'yes').length;
  const nowMs = now.getTime();
  const next = appts.find((a) => a.status === 'confirmed' && new Date(a.ends_at).getTime() > nowMs);

  const chips = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const origin = await getOrigin();
  const link = `${origin}/${shop.slug}`;

  const sections = pros.filter((p) => p.active || appts.some((a) => a.professional_id === p.id));
  const openMin = toMin(shop.open_time);
  const closeMin = toMin(shop.close_time);
  const proName = (id: string | null) => (id ? pros.find((p) => p.id === id)?.name ?? 'Profissional' : 'Todos');
  const closedDay = !shop.open_days.includes(weekday(date));
  const worksToday = (p: Professional) => !closedDay && p.work_days.includes(weekday(date)) ? proWindow(shop, p) : null;
  const q = (extra: Record<string, string>) => `/painel?${new URLSearchParams({ d: date, ...(view === 'lista' ? { view } : {}), ...extra })}`;
  const selected = sp.a ? appts.find((a) => a.id === sp.a) : undefined;
  const minOf = (iso: string) => {
    const lp = localParts(new Date(iso), tz);
    return lp.date < date ? 0 : lp.date > date ? 24 * 60 : lp.minutes;
  };

  function Actions({ a }: { a: Row }) {
    const phone = a.clients?.phone ?? '';
    const data = {
      clientName: a.clients?.name ?? '', shopName: shop.name, serviceName: a.service_name, proName: proName(a.professional_id),
      date: dateOf(a.starts_at, tz), time: timeOf(a.starts_at, tz), today, manageUrl: manageUrl(a.manage_token),
    };
    return (
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
                <input type="hidden" name="view" value={view} />
                <button className="btn sm">{to === 'done' ? 'Concluir' : to === 'noshow' ? 'Faltou' : 'Cancelar'}</button>
              </form>
            ))}
          </>
        ) : (
          <form action={setStatus}>
            <input type="hidden" name="id" value={a.id} />
            <input type="hidden" name="to" value="confirmed" />
            <input type="hidden" name="d" value={date} />
            <input type="hidden" name="view" value={view} />
            <button className="btn sm">Desfazer</button>
          </form>
        )}
      </div>
    );
  }

  function Status({ a }: { a: Row }) {
    return (
      <span className="row" style={{ gap: 6 }}>
        <span className={`pill ${a.status}`}>{STATUS_LABEL[a.status]}{a.status === 'cancelled' && a.cancelled_by === 'client' ? ' pelo cliente' : ''}</span>
        {a.status === 'confirmed' && a.presence === 'yes' ? <span className="pill done">Presença confirmada</span> : null}
      </span>
    );
  }

  function Detail({ a }: { a: Row }) {
    const phone = a.clients?.phone ?? '';
    return (
      <div className="who">
        <b>{a.clients?.name ?? 'Cliente'}</b>
        <span>
          {a.service_name} · {brl(a.price_cents)}{phone ? ` · ${maskPhone(phone)}` : ''}
          {a.source === 'painel' ? ' · marcado no painel' : ''}
        </span>
        {a.status === 'confirmed' ? (
          <span style={{ display: 'block' }}>
            {a.confirmation_sent_at ? 'Confirmação enviada' : 'Confirmação não enviada'}
            {a.day_reminder_sent_at ? ' · lembrete da véspera enviado' : ''}
            {a.reminder_sent_at ? ' · lembrete do dia enviado' : ''}
          </span>
        ) : null}
      </div>
    );
  }

  const hours: number[] = [];
  for (let m = Math.ceil(openMin / 60) * 60; m <= closeMin; m += 60) hours.push(m);
  const H = (closeMin - openMin) * PX;
  const nowLocal = localParts(now, tz);
  const activePros = sections.filter((p) => p.active);

  return (
    <>
      {sp.ok ? <p className="flash ok" role="status">{sp.ok}</p> : null}
      {sp.err ? <p className="flash bad" role="alert">{sp.err}</p> : null}

      {sp.novo ? (
        <section className="card">
          <h2>Sua agenda está criada</h2>
          <p>Já deixamos serviços e 1 profissional de exemplo. Falta pouco para receber clientes:</p>
          <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 4 }}>
            <li>Ajuste seus <Link href="/painel/servicos">serviços e preços</Link>.</li>
            <li>Cadastre sua <Link href="/painel/equipe">equipe, horários, almoço e folgas</Link>.</li>
            <li>Confira o <Link href="/painel/configuracoes">horário de funcionamento e as regras</Link>.</li>
            <li>Coloque o link abaixo no Instagram e no WhatsApp.</li>
          </ol>
          <div className="linkbox"><code>{link}</code><CopyButton text={link} /></div>
        </section>
      ) : null}

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="days" role="group" aria-label="Escolha o dia" style={{ flex: 1, minWidth: 0 }}>
          {chips.map((d) => (
            <Link key={d} href={`/painel?${new URLSearchParams({ d, ...(view === 'lista' ? { view } : {}) })}`} className="day" aria-pressed={d === date}>
              <span className="wd">{dayLabel(d, today)}</span>
              <span className="dn">{d.slice(8)}</span>
              <span className="mo">{monthShort(d)}</span>
            </Link>
          ))}
        </div>
      </div>
      <div className="row">
        <Link className="btn sm" href={q({ d: addDays(date, -1) })}>← Dia anterior</Link>
        <Link className="btn sm" href={q({ d: addDays(date, 1) })}>Próximo dia →</Link>
        <form action="/painel" method="get" className="row">
          <label className="sr" htmlFor="goto">Ir para a data</label>
          <input id="goto" type="date" name="d" defaultValue={date} style={{ width: 'auto' }} />
          {view === 'lista' ? <input type="hidden" name="view" value="lista" /> : null}
          <button className="btn sm">Ir</button>
        </form>
        <span className="seg" role="group" aria-label="Visualização">
          <Link className="btn sm" aria-pressed={view === 'grade'} href={`/painel?d=${date}`}>Grade</Link>
          <Link className="btn sm" aria-pressed={view === 'lista'} href={`/painel?d=${date}&view=lista`}>Lista</Link>
        </span>
        <Link className="btn primary sm" href={`/painel/novo?d=${date >= today ? date : today}`}>Novo agendamento</Link>
      </div>
      <h2 style={{ font: '700 26px var(--f-display)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {dayLabel(date, today)} · {dayMonth(date)}
      </h2>
      {closedDay ? <p className="hint">Não há atendimento neste dia.</p> : null}

      <div className="stats">
        <div className="stat"><span>Agendamentos</span><b>{live.length}</b><small>{presenceOk} com presença confirmada</small></div>
        <div className="stat"><span>Faturamento previsto</span><b>{brl(revenue)}</b></div>
        <div className="stat"><span>Faltas</span><b>{noshow}</b></div>
        <div className="stat"><span>Próximo cliente</span><b>{next ? timeOf(next.starts_at, tz) : '—'}</b></div>
      </div>

      {view === 'grade' && selected ? (
        <section className="card" aria-label="Agendamento selecionado">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <b style={{ font: '700 22px var(--f-display)' }}>{timeOf(selected.starts_at, tz)} até {timeOf(selected.ends_at, tz)} · {proName(selected.professional_id)}</b>
            <Link className="btn sm" href={q({})}>Fechar</Link>
          </div>
          <Status a={selected} />
          <Detail a={selected} />
          <Actions a={selected} />
        </section>
      ) : null}

      {view === 'grade' ? (
        activePros.length ? (
          <>
            <div className="grid-wrap">
              <div className="tl" style={{ gridTemplateColumns: `52px repeat(${activePros.length}, minmax(150px, 1fr))` }}>
                <div className="tl-h" />
                {activePros.map((p) => {
                  const n = appts.filter((a) => a.professional_id === p.id && a.status !== 'cancelled').length;
                  return (
                    <div className="tl-h" key={p.id}>
                      <span className="av" aria-hidden="true">{p.name.charAt(0).toUpperCase()}</span>
                      <span>{p.name}<small>{worksToday(p) ? `${n} atendimento${n === 1 ? '' : 's'}` : 'Folga'}</small></span>
                    </div>
                  );
                })}
                <div className="tl-hours" style={{ height: H }}>
                  {hours.map((m) => <span key={m} style={{ top: Math.max(8, (m - openMin) * PX) }}>{hourWord(fromMin(m))}</span>)}
                </div>
                {activePros.map((p) => {
                  const win = worksToday(p);
                  const brk = p.break_start && p.break_end ? [toMin(p.break_start), toMin(p.break_end)] : null;
                  return (
                    <AgendaColumn key={p.id} date={date} proId={p.id} openMin={openMin} step={shop.slot_minutes} px={PX} height={H} off={!win || date < today}>
                      <div className="tl-lines" aria-hidden="true">{hours.map((m) => <i key={m} style={{ top: (m - openMin) * PX }} />)}</div>
                      {win ? (
                        <>
                          {win[0] > openMin ? <div className="blk" style={{ top: 0, height: (win[0] - openMin) * PX }}>Fora do horário</div> : null}
                          {win[1] < closeMin ? <div className="blk" style={{ top: (win[1] - openMin) * PX, height: (closeMin - win[1]) * PX }}>Fora do horário</div> : null}
                          {brk ? <div className="blk" style={{ top: (brk[0] - openMin) * PX, height: (brk[1] - brk[0]) * PX }}>Almoço</div> : null}
                        </>
                      ) : null}
                      {blocks.filter((b) => b.professional_id === null || b.professional_id === p.id).map((b) => {
                        const s = Math.max(minOf(b.starts_at), openMin), e = Math.min(minOf(b.ends_at), closeMin);
                        return e > s ? <div key={b.id} className="blk" style={{ top: (s - openMin) * PX, height: (e - s) * PX }}>{b.reason || 'Bloqueado'}</div> : null;
                      })}
                      {appts.filter((a) => a.professional_id === p.id).map((a) => {
                        const s = minOf(a.starts_at), e = minOf(a.ends_at);
                        if (e <= openMin || s >= closeMin) return null;
                        return (
                          <Link key={a.id} href={q({ a: a.id })} className={`ev ${a.status}`} aria-current={sp.a === a.id ? 'true' : undefined}
                            style={{ top: (Math.max(s, openMin) - openMin) * PX + 1, height: Math.max((Math.min(e, closeMin) - Math.max(s, openMin)) * PX - 2, 22), zIndex: a.status === 'cancelled' ? 0 : 1 }}>
                            {a.status === 'confirmed' && a.presence === 'yes' ? <i className="dot" title="Presença confirmada" /> : null}
                            <b>{timeOf(a.starts_at, tz)} {a.clients?.name ?? 'Cliente'}</b>
                            {e - s >= 25 ? <span>{a.service_name}</span> : null}
                          </Link>
                        );
                      })}
                      {date === today && nowLocal.minutes > openMin && nowLocal.minutes < closeMin ? (
                        <div className="nowline" style={{ top: (nowLocal.minutes - openMin) * PX }} />
                      ) : null}
                    </AgendaColumn>
                  );
                })}
              </div>
            </div>
            <p className="note">Clique num horário para ver as ações, ou num espaço vazio para encaixar um cliente. A bolinha verde indica presença confirmada pelo cliente.</p>
          </>
        ) : <p className="hint">Cadastre um profissional ativo em <Link href="/painel/equipe">Equipe</Link>.</p>
      ) : (
        sections.map((p) => {
          const list = appts.filter((a) => a.professional_id === p.id);
          const act = list.filter((a) => a.status === 'confirmed' || a.status === 'done');
          const works = Boolean(worksToday(p));
          return (
            <section className="prosec" key={p.id}>
              <h3>
                {p.name}
                <small>{act.length} atendimento{act.length === 1 ? '' : 's'} · {brl(act.reduce((s, a) => s + a.price_cents, 0))}</small>
                {works ? null : <span className="pill warn">Folga</span>}
                {p.active ? null : <span className="pill cancelled">Desativado</span>}
              </h3>
              {list.length ? list.map((a) => (
                <div className={`appt${a.status === 'cancelled' || a.status === 'noshow' ? ' off' : ''}`} key={a.id}>
                  <div className="t">{timeOf(a.starts_at, tz)}<small>até {timeOf(a.ends_at, tz)}</small></div>
                  <Detail a={a} />
                  <div className="st"><Status a={a} /></div>
                  <Actions a={a} />
                </div>
              )) : <div className="empty">{works ? 'Nenhum agendamento neste dia.' : `${p.name} não trabalha neste dia.`}</div>}
            </section>
          );
        })
      )}

      {waiting.length ? (
        <section className="prosec">
          <h3>Lista de espera <small>{waiting.length} pessoa{waiting.length === 1 ? '' : 's'} querem uma vaga neste dia</small></h3>
          {waiting.map((w) => (
            <div className="appt" key={w.id}>
              <div className="t" style={{ fontSize: 16 }}>{timeOf(w.created_at, tz)}<small>entrou</small></div>
              <div className="who">
                <b>{w.name}</b>
                <span>{w.service_ids.map(svcName).join(' + ')}{w.professional_id ? ` · com ${proName(w.professional_id)}` : ''} · {maskPhone(w.phone)}</span>
              </div>
              <div className="acts" style={{ gridColumn: 'auto' }}>
                <a className="btn sm" target="_blank" rel="noopener" href={waLink(w.phone, `Oi, ${w.name.split(' ')[0]}! Abriu uma vaga ${dayLabel(date, today).toLowerCase()} (${dayMonth(date)}) em ${shop.name}. Quer o horário? Agende aqui: ${link}`)}>Avisar no WhatsApp</a>
                <form action={deleteWaitlist}>
                  <input type="hidden" name="id" value={w.id} />
                  <input type="hidden" name="d" value={date} />
                  <button className="btn sm">Remover</button>
                </form>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {blocks.length ? (
        <section className="prosec">
          <h3>Horários bloqueados</h3>
          {blocks.map((b) => (
            <div className="appt" key={b.id}>
              <div className="t">{timeOf(b.starts_at, tz)}<small>até {timeOf(b.ends_at, tz)}</small></div>
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
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Bloquear horário (compromisso, folga pontual)</summary>
        <p className="hint" style={{ marginTop: 10 }}>O almoço de cada profissional já é bloqueado sozinho todo dia: ajuste em <Link href="/painel/equipe">Equipe</Link>.</p>
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
              <select id="b-from" name="from" defaultValue="15:00">
                {timeOptions(openMin, closeMin).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="b-to">Até</label>
              <select id="b-to" name="to" defaultValue="16:00">
                {timeOptions(openMin, closeMin).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="b-reason">Motivo (opcional)</label>
            <input id="b-reason" name="reason" maxLength={80} placeholder="Médico" />
          </div>
          <div><button className="btn primary">Bloquear</button></div>
        </form>
      </details>
    </>
  );
}
