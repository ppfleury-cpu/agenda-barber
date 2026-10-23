'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AvailabilityResult, BookingInput, BookingResult } from '@/lib/booking';
import { brl, dayLabel, longDayLabel, monthShort, weekday } from '@/lib/time';
import { maskPhone } from '@/lib/phone';
import { groupTimes } from './slot-groups';

export type FlowService = { id: string; name: string; duration_min: number; price_cents: number };
export type FlowPro = { id: string; name: string; off: string; serviceIds: string[] | null };

type CodeResult = { ok: true; needed: boolean } | { ok: false; error: string };
type WaitInput = { date: string; serviceIds: string[]; professionalId: string; name: string; phone: string };

type Props = {
  mode: 'public' | 'owner';
  services: FlowService[];
  pros: FlowPro[];
  whatsappEnabled: boolean;
  initialDate?: string;
  initialPro?: string;
  initialTime?: string;
  cancelHours?: number;
  openDays?: number[];
  loadAvailability: (serviceIds: string[], professionalId: string) => Promise<AvailabilityResult>;
  submit: (input: BookingInput & { hp: string; code?: string }) => Promise<BookingResult>;
  requestCode?: (phone: string) => Promise<CodeResult>;
  joinWaitlist?: (input: WaitInput) => Promise<{ ok: true } | { ok: false; error: string }>;
};

type Done = Extract<BookingResult, { ok: true }>;
const MAX_SERVICES = 5;
const doesAll = (p: FlowPro, ids: string[]) => !p.serviceIds || p.serviceIds.length === 0 || ids.every((id) => p.serviceIds!.includes(id));

export function BookingFlow(props: Props) {
  const { mode, services, pros, whatsappEnabled, initialDate, initialPro, initialTime, cancelHours, openDays, loadAvailability, submit, requestCode, joinWaitlist } = props;
  // Começa pelo primeiro serviço que o profissional pré-escolhido faz (vindo da grade da agenda).
  const startPro = pros.find((p) => p.id === initialPro);
  const firstService = services.find((s) => !startPro || doesAll(startPro, [s.id])) ?? services[0];
  const [serviceIds, setServiceIds] = useState<string[]>(firstService ? [firstService.id] : []);
  const [proId, setProId] = useState(initialPro && pros.some((p) => p.id === initialPro) ? initialPro : 'any');
  const [avail, setAvail] = useState<Record<string, string[]> | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(true);
  const [hp, setHp] = useState('');
  const [formError, setFormError] = useState('');
  const [sending, setSending] = useState(false);
  const [codeStep, setCodeStep] = useState(false);
  const [code, setCode] = useState('');
  const [done, setDone] = useState<Done | null>(null);
  const [wait, setWait] = useState<'idle' | 'sending' | 'ok'>('idle');
  const reqId = useRef(0);
  const topRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const wantedTime = useRef(initialTime ?? '');

  const chosen = useMemo(() => serviceIds.map((id) => services.find((s) => s.id === id)).filter(Boolean) as FlowService[], [serviceIds, services]);
  const duration = chosen.reduce((n, s) => n + s.duration_min, 0);
  const price = chosen.reduce((n, s) => n + s.price_cents, 0);
  const serviceName = chosen.map((s) => s.name).join(' + ');
  const key = serviceIds.join(',');

  const refresh = useCallback(
    async (keepDate?: string) => {
      if (!key) { setAvail({}); setLoading(false); return; }
      const id = ++reqId.current;
      setLoading(true);
      setLoadError('');
      try {
        const r = await loadAvailability(key.split(','), proId);
        if (id !== reqId.current) return;
        if (!r.ok) {
          setAvail({});
          setLoadError(r.error);
          return;
        }
        setAvail(r.days);
        const dates = Object.keys(r.days).sort();
        const withTimes = dates.filter((d) => r.days[d].length > 0);
        const wanted = keepDate && r.days[keepDate] ? keepDate : initialDate && r.days[initialDate]?.length ? initialDate : withTimes[0] ?? dates[0] ?? '';
        setDate(wanted);
        const t = wantedTime.current;
        wantedTime.current = '';
        setTime((cur) => (r.days[wanted]?.includes(t) ? t : r.days[wanted]?.includes(cur) ? cur : ''));
      } catch {
        if (id === reqId.current) setLoadError('Não foi possível carregar os horários. Tente de novo.');
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [key, proId, loadAvailability, initialDate],
  );

  useEffect(() => {
    void refresh(date || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  // Profissional escolhido que não faz algum dos serviços: volta para "qualquer um".
  useEffect(() => {
    const p = pros.find((x) => x.id === proId);
    if (p && !doesAll(p, serviceIds)) setProId('any');
  }, [serviceIds, proId, pros]);

  const dates = useMemo(() => (avail ? Object.keys(avail).sort() : []), [avail]);
  const today = dates[0] ?? '';
  const times = avail?.[date] ?? [];
  const proName = proId === 'any' ? 'Primeiro livre' : pros.find((p) => p.id === proId)?.name ?? '';
  const nobody = pros.every((p) => !doesAll(p, serviceIds));

  function toggleService(id: string) {
    setTime('');
    setCodeStep(false);
    setServiceIds((list) => (list.includes(id) ? (list.length > 1 ? list.filter((x) => x !== id) : list) : list.length >= MAX_SERVICES ? list : [...list, id]));
  }

  async function send(withCode?: string) {
    const r = await submit({ serviceIds, professionalId: proId, date, time, name, phone, consent: whatsappEnabled && consent, hp, code: withCode });
    if (r.ok) {
      setDone(r);
      setCodeStep(false);
      topRef.current?.scrollIntoView({ block: 'start' });
      return;
    }
    setFormError(r.error);
    if (r.needCode) {
      setCodeStep(true);
      setTimeout(() => codeRef.current?.focus(), 30);
    }
    if (r.conflict) {
      setTime('');
      setCodeStep(false);
      await refresh(date);
    }
  }

  async function onConfirm() {
    if (!chosen.length || !date || !time) return;
    setSending(true);
    setFormError('');
    try {
      if (codeStep) {
        await send(code);
      } else if (requestCode) {
        const c = await requestCode(phone);
        if (!c.ok) setFormError(c.error);
        else if (c.needed) {
          setCodeStep(true);
          setCode('');
          setTimeout(() => codeRef.current?.focus(), 30);
        } else await send();
      } else await send();
    } catch {
      setFormError('Não foi possível concluir. Verifique sua conexão e tente de novo.');
    } finally {
      setSending(false);
    }
  }

  async function onResend() {
    if (!requestCode) return;
    setFormError('');
    const c = await requestCode(phone);
    setFormError(c.ok ? 'Enviamos um novo código.' : c.error);
  }

  async function onWait() {
    if (!joinWaitlist) return;
    setWait('sending');
    setFormError('');
    const r = await joinWaitlist({ date, serviceIds, professionalId: proId, name, phone }).catch(() => ({ ok: false as const, error: 'Verifique sua conexão.' }));
    if (r.ok) setWait('ok');
    else { setWait('idle'); setFormError(r.error); }
  }

  function again() {
    setDone(null);
    setTime('');
    setFormError('');
    setCode('');
    void refresh();
  }

  if (done) {
    const a = done.appointment;
    return (
      <section className="done" ref={topRef as React.RefObject<HTMLElement>}>
        <div className="ck" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </div>
        <h2>Horário confirmado</h2>
        <p>
          <b>{a.serviceName}</b> com {a.proName}, {longDayLabel(a.date, today || a.date)} às <b>{a.time}</b> ({a.durationMin} min).
          Total: {brl(a.priceCents)}.
        </p>
        {done.whatsapp === 'sent' ? (
          <p className="flash ok">Enviamos a confirmação para o WhatsApp informado, com o link para confirmar presença, remarcar ou cancelar.</p>
        ) : done.whatsapp === 'pending' ? (
          <p className="flash warn">Vamos enviar a confirmação para o WhatsApp em instantes.</p>
        ) : null}
        <div className="row">
          {mode === 'public' ? <a className="btn" href={`/m/${a.manageToken}`}>Remarcar ou cancelar</a> : null}
          <button className="btn primary" onClick={again}>{mode === 'owner' ? 'Novo agendamento' : 'Fazer outro agendamento'}</button>
          {mode === 'owner' ? <a className="btn" href={`/painel?d=${a.date}`}>Ver na agenda</a> : null}
        </div>
        {mode === 'public' && cancelHours !== undefined ? (
          <p className="hint">Guarde o link acima: por ele você remarca ou cancela sozinho até {cancelHours}h antes.</p>
        ) : null}
      </section>
    );
  }

  const fullDay = !loading && !loadError && date && times.length === 0 && avail && date in avail && (!openDays || openDays.includes(weekday(date)));

  return (
    <div className="book" ref={topRef}>
      <div className="steps">
        <section className="step" aria-labelledby="h-svc">
          <h2 id="h-svc"><span className="n">1</span>Serviço<span className="aside">pode escolher mais de um</span></h2>
          <div className="opts">
            {services.map((s) => (
              <button key={s.id} type="button" className="opt" aria-pressed={serviceIds.includes(s.id)} onClick={() => toggleService(s.id)}>
                <span className="nm">{s.name}</span>
                <span className="pr">{brl(s.price_cents)}</span>
                <span className="meta">{s.duration_min} min</span>
              </button>
            ))}
          </div>
        </section>

        <section className="step" aria-labelledby="h-pro">
          <h2 id="h-pro"><span className="n">2</span>Profissional</h2>
          <div className="pros">
            <button type="button" className="pro" aria-pressed={proId === 'any'} onClick={() => { setProId('any'); setTime(''); }}>
              <span className="av" aria-hidden="true">★</span>
              <span className="nm">Qualquer um<span className="sub">Primeiro horário livre</span></span>
            </button>
            {pros.map((p) => {
              const ok = doesAll(p, serviceIds);
              return (
                <button key={p.id} type="button" className="pro" disabled={!ok} aria-pressed={proId === p.id} onClick={() => { setProId(p.id); setTime(''); }}>
                  <span className="av" aria-hidden="true">{p.name.charAt(0).toUpperCase()}</span>
                  <span className="nm">{p.name}<span className="sub">{ok ? p.off : 'Não faz este serviço'}</span></span>
                </button>
              );
            })}
          </div>
          {nobody ? <p className="flash warn" style={{ marginTop: 10 }}>Nenhum profissional faz todos esses serviços juntos. Tire um deles.</p> : null}
        </section>

        <section className="step" aria-labelledby="h-day">
          <h2 id="h-day"><span className="n">3</span>Dia</h2>
          {loadError ? <p className="flash bad" role="alert">{loadError}</p> : null}
          {loading && !avail ? <p className="hint">Carregando horários...</p> : (
            <div className="days" aria-busy={loading}>
              {dates.map((d) => {
                const has = (avail?.[d] ?? []).length > 0;
                const closed = openDays ? !openDays.includes(weekday(d)) : false;
                return (
                  <button key={d} type="button" className="day" aria-pressed={d === date} disabled={closed || (!has && !joinWaitlist)} onClick={() => { setDate(d); setTime(''); setWait('idle'); }}>
                    <span className="wd">{dayLabel(d, today)}</span>
                    <span className="dn">{d.slice(8)}</span>
                    <span className="mo">{closed ? 'fechado' : has ? monthShort(d) : 'lotado'}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="step" aria-labelledby="h-slot">
          <h2 id="h-slot">
            <span className="n">4</span>Horário
            {times.length ? <span className="aside">{times.length} livres · {duration} min</span> : null}
          </h2>
          {times.length ? (
            groupTimes(times).map(([label, list]) => (
              <div className="slotgroup" key={label}>
                <h4>{label}</h4>
                <div className="slots">
                  {list.map((t) => (
                    <button key={t} type="button" className="slot" aria-pressed={t === time} onClick={() => setTime(t)}>{t}</button>
                  ))}
                </div>
              </div>
            ))
          ) : loading ? (
            <p className="hint">Carregando...</p>
          ) : fullDay && joinWaitlist ? (
            <div className="card">
              <h3>Dia sem vaga</h3>
              {wait === 'ok' ? (
                <p className="flash ok">Pronto! Você está na lista de espera de {longDayLabel(date, today)}. Se alguém cancelar, o estabelecimento chama você no WhatsApp.</p>
              ) : (
                <>
                  <p className="hint">Preencha seu nome e WhatsApp no passo 5 e entre na lista de espera: se alguém cancelar, você é avisado.</p>
                  <div>
                    <button className="btn" type="button" disabled={wait === 'sending' || name.trim().length < 2 || phone.replace(/\D/g, '').length < 10} onClick={onWait}>
                      {wait === 'sending' ? 'Enviando...' : 'Entrar na lista de espera'}
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <p className="hint">Sem horários livres neste dia. Escolha outro dia ou outro profissional.</p>
          )}
        </section>

        <section className="step" aria-labelledby="h-me">
          <h2 id="h-me"><span className="n">5</span>{mode === 'owner' ? 'Dados do cliente' : 'Seus dados'}</h2>
          <div className="fields">
            <div className="field">
              <label htmlFor="cName">Nome</label>
              <input id="cName" autoComplete={mode === 'public' ? 'name' : 'off'} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder={mode === 'public' ? 'Como você se chama?' : 'Nome do cliente'} />
            </div>
            <div className="field">
              <label htmlFor="cPhone">WhatsApp</label>
              <input id="cPhone" type="tel" inputMode="tel" autoComplete={mode === 'public' ? 'tel' : 'off'} value={phone} onChange={(e) => { setPhone(maskPhone(e.target.value)); setCodeStep(false); }} placeholder="(62) 91234-5678" />
            </div>
          </div>
          <input className="hp" tabIndex={-1} autoComplete="off" aria-hidden="true" name="website" value={hp} onChange={(e) => setHp(e.target.value)} />
          {whatsappEnabled ? (
            <label className="check" style={{ marginTop: 12 }}>
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>
                {mode === 'public'
                  ? 'Quero receber a confirmação e os lembretes do horário no WhatsApp.'
                  : 'O cliente aceita receber a confirmação e os lembretes no WhatsApp.'}
              </span>
            </label>
          ) : null}
          {mode === 'public' && cancelHours !== undefined ? (
            <p className="note" style={{ marginTop: 10 }}>Você poderá remarcar ou cancelar sozinho até {cancelHours}h antes do horário.</p>
          ) : null}
        </section>
      </div>

      <aside className="summary" aria-label="Resumo do agendamento">
        <h2>{mode === 'owner' ? 'Novo horário' : 'Seu horário'}</h2>
        <dl>
          <div className="r"><dt>Serviço</dt><dd>{serviceName || '—'}</dd></div>
          <div className="r"><dt>Profissional</dt><dd>{proName || '—'}</dd></div>
          <div className="r"><dt>Quando</dt><dd>{time && date ? `${longDayLabel(date, today)}, ${time}` : '—'}</dd></div>
          <div className="r"><dt>Duração</dt><dd>{duration ? `${duration} min` : '—'}</dd></div>
        </dl>
        <div className="total"><span>Total</span><b>{brl(price)}</b></div>
        {codeStep ? (
          <div className="field">
            <label htmlFor="cCode">Código que chegou no WhatsApp</label>
            <input id="cCode" ref={codeRef} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" />
            <span className="note">Só no primeiro agendamento com este número. <button type="button" className="linkbtn" onClick={onResend}>Reenviar código</button></span>
          </div>
        ) : null}
        <p className="err" role="alert">{formError}</p>
        <button className="btn primary" type="button" disabled={!chosen.length || !time || sending || (codeStep && code.length !== 6)} onClick={onConfirm}>
          {sending ? 'Confirmando...' : codeStep ? 'Confirmar código e agendar' : 'Confirmar agendamento'}
        </button>
        {mode === 'public' ? <p className="note">Ao confirmar, o estabelecimento guarda seu nome e WhatsApp para atender você.</p> : null}
      </aside>
    </div>
  );
}
