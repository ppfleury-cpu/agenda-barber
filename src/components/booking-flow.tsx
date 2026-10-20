'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AvailabilityResult, BookingInput, BookingResult } from '@/lib/booking';
import { brl, dayLabel, longDayLabel, monthShort } from '@/lib/time';
import { maskPhone } from '@/lib/phone';

export type FlowService = { id: string; name: string; duration_min: number; price_cents: number };
export type FlowPro = { id: string; name: string; off: string };

type Props = {
  mode: 'public' | 'owner';
  services: FlowService[];
  pros: FlowPro[];
  whatsappEnabled: boolean;
  initialDate?: string;
  loadAvailability: (serviceId: string, professionalId: string) => Promise<AvailabilityResult>;
  submit: (input: BookingInput & { hp: string }) => Promise<BookingResult>;
};

type Done = Extract<BookingResult, { ok: true }>;

export function BookingFlow({ mode, services, pros, whatsappEnabled, initialDate, loadAvailability, submit }: Props) {
  const [serviceId, setServiceId] = useState(services[0]?.id ?? '');
  const [proId, setProId] = useState('any');
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
  const [done, setDone] = useState<Done | null>(null);
  const reqId = useRef(0);
  const topRef = useRef<HTMLDivElement>(null);

  const service = services.find((s) => s.id === serviceId);

  const refresh = useCallback(
    async (keepDate?: string) => {
      if (!serviceId) return;
      const id = ++reqId.current;
      setLoading(true);
      setLoadError('');
      try {
        const r = await loadAvailability(serviceId, proId);
        if (id !== reqId.current) return;
        if (!r.ok) {
          setAvail({});
          setLoadError(r.error);
          setLoading(false);
          return;
        }
        setAvail(r.days);
        const dates = Object.keys(r.days).sort();
        const withTimes = dates.filter((d) => r.days[d].length > 0);
        const wanted = keepDate && r.days[keepDate]?.length ? keepDate : initialDate && r.days[initialDate]?.length ? initialDate : withTimes[0] ?? dates[0] ?? '';
        setDate(wanted);
        setTime((t) => (r.days[wanted]?.includes(t) ? t : ''));
      } catch {
        if (id === reqId.current) setLoadError('Não foi possível carregar os horários. Tente de novo.');
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [serviceId, proId, loadAvailability, initialDate],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const dates = useMemo(() => (avail ? Object.keys(avail).sort() : []), [avail]);
  const today = dates[0] ?? '';
  const times = avail?.[date] ?? [];
  const proName = proId === 'any' ? 'Primeiro livre' : pros.find((p) => p.id === proId)?.name ?? '';

  async function onConfirm() {
    if (!service || !date || !time) return;
    setSending(true);
    setFormError('');
    try {
      const r = await submit({ serviceId, professionalId: proId, date, time, name, phone, consent: whatsappEnabled && consent, hp });
      if (r.ok) {
        setDone(r);
        topRef.current?.scrollIntoView({ block: 'start' });
      } else {
        setFormError(r.error);
        if (r.conflict) {
          setTime('');
          await refresh(date);
        }
      }
    } catch {
      setFormError('Não foi possível concluir. Verifique sua conexão e tente de novo.');
    } finally {
      setSending(false);
    }
  }

  function again() {
    setDone(null);
    setTime('');
    setFormError('');
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
          <p className="flash ok">Enviamos a confirmação para o WhatsApp informado. Você também recebe um lembrete antes do horário.</p>
        ) : done.whatsapp === 'pending' ? (
          <p className="flash warn">Vamos enviar a confirmação para o WhatsApp em instantes.</p>
        ) : null}
        <div className="row">
          <button className="btn primary" onClick={again}>{mode === 'owner' ? 'Novo agendamento' : 'Fazer outro agendamento'}</button>
          {mode === 'owner' ? <a className="btn" href={`/painel?d=${a.date}`}>Ver na agenda</a> : null}
        </div>
      </section>
    );
  }

  return (
    <div className="book" ref={topRef}>
      <div className="steps">
        <section className="step" aria-labelledby="h-svc">
          <h2 id="h-svc"><span className="n">1</span>Serviço</h2>
          <div className="opts">
            {services.map((s) => (
              <button key={s.id} type="button" className="opt" aria-pressed={s.id === serviceId} onClick={() => { setServiceId(s.id); setTime(''); }}>
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
            {pros.map((p) => (
              <button key={p.id} type="button" className="pro" aria-pressed={proId === p.id} onClick={() => { setProId(p.id); setTime(''); }}>
                <span className="av" aria-hidden="true">{p.name.charAt(0).toUpperCase()}</span>
                <span className="nm">{p.name}{p.off ? <span className="sub">{p.off}</span> : null}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="step" aria-labelledby="h-day">
          <h2 id="h-day"><span className="n">3</span>Dia</h2>
          {loadError ? <p className="flash bad" role="alert">{loadError}</p> : null}
          {loading && !avail ? <p className="hint">Carregando horários...</p> : (
            <div className="days" aria-busy={loading}>
              {dates.map((d) => {
                const has = (avail?.[d] ?? []).length > 0;
                return (
                  <button key={d} type="button" className="day" aria-pressed={d === date} disabled={!has} onClick={() => { setDate(d); setTime(''); }}>
                    <span className="wd">{dayLabel(d, today)}</span>
                    <span className="dn">{d.slice(8)}</span>
                    <span className="mo">{has ? monthShort(d) : 'sem vaga'}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="step" aria-labelledby="h-slot">
          <h2 id="h-slot">
            <span className="n">4</span>Horário
            {times.length ? <span className="aside">{times.length} livres · {service?.duration_min} min</span> : null}
          </h2>
          {times.length ? (
            <div className="slots">
              {times.map((t) => (
                <button key={t} type="button" className="slot" aria-pressed={t === time} onClick={() => setTime(t)}>{t}</button>
              ))}
            </div>
          ) : (
            <p className="hint">{loading ? 'Carregando...' : 'Sem horários livres neste dia. Escolha outro dia ou outro profissional.'}</p>
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
              <input id="cPhone" type="tel" inputMode="tel" autoComplete={mode === 'public' ? 'tel' : 'off'} value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} placeholder="(62) 91234-5678" />
            </div>
          </div>
          <input className="hp" tabIndex={-1} autoComplete="off" aria-hidden="true" name="website" value={hp} onChange={(e) => setHp(e.target.value)} />
          {whatsappEnabled ? (
            <label className="check" style={{ marginTop: 12 }}>
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>
                {mode === 'public'
                  ? 'Quero receber a confirmação e o lembrete do horário no WhatsApp.'
                  : 'O cliente aceita receber a confirmação e o lembrete no WhatsApp.'}
              </span>
            </label>
          ) : null}
        </section>
      </div>

      <aside className="summary" aria-label="Resumo do agendamento">
        <h2>{mode === 'owner' ? 'Novo horário' : 'Seu horário'}</h2>
        <dl>
          <div className="r"><dt>Serviço</dt><dd>{service?.name ?? '—'}</dd></div>
          <div className="r"><dt>Profissional</dt><dd>{proName || '—'}</dd></div>
          <div className="r"><dt>Quando</dt><dd>{time && date ? `${longDayLabel(date, today)}, ${time}` : '—'}</dd></div>
          <div className="r"><dt>Duração</dt><dd>{service ? `${service.duration_min} min` : '—'}</dd></div>
        </dl>
        <div className="total"><span>Total</span><b>{brl(service?.price_cents ?? 0)}</b></div>
        <p className="err" role="alert">{formError}</p>
        <button className="btn primary" type="button" disabled={!service || !time || sending} onClick={onConfirm}>
          {sending ? 'Confirmando...' : 'Confirmar agendamento'}
        </button>
        {mode === 'public' ? <p className="note">Ao confirmar, o estabelecimento guarda seu nome e WhatsApp para atender você.</p> : null}
      </aside>
    </div>
  );
}
