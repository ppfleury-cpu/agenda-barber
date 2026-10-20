'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AvailabilityResult } from '@/lib/booking';
import type { ManageResult } from '@/lib/manage';
import { dayLabel, monthShort } from '@/lib/time';
import { groupTimes } from './slot-groups';

type Props = {
  presence: 'yes' | 'no' | null;
  canChange: boolean;
  cancelHours: number;
  proId: string;
  proName: string;
  confirm: () => Promise<ManageResult>;
  cancel: () => Promise<ManageResult>;
  loadAvailability: (professionalId: string) => Promise<AvailabilityResult>;
  reschedule: (input: { date: string; time: string; professionalId: string }) => Promise<ManageResult>;
};

export function ManageFlow({ presence, canChange, cancelHours, proId, proName, confirm, cancel, loadAvailability, reschedule }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<'idle' | 'cancel' | 'move'>('idle');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [who, setWho] = useState(proId);
  const [avail, setAvail] = useState<Record<string, string[]> | null>(null);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');

  useEffect(() => {
    if (mode !== 'move') return;
    let live = true;
    setAvail(null);
    loadAvailability(who).then((r) => {
      if (!live) return;
      if (!r.ok) { setMsg({ ok: false, text: r.error }); setAvail({}); return; }
      setAvail(r.days);
      const first = Object.keys(r.days).sort().find((d) => r.days[d].length);
      setDate(first ?? '');
      setTime('');
    });
    return () => { live = false; };
  }, [mode, who, loadAvailability]);

  async function run(fn: () => Promise<ManageResult>) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
      if (r.ok) { setMode('idle'); router.refresh(); }
    } catch {
      setMsg({ ok: false, text: 'Não foi possível concluir. Verifique sua conexão e tente de novo.' });
    } finally {
      setBusy(false);
    }
  }

  const dates = avail ? Object.keys(avail).sort() : [];
  const today = dates[0] ?? '';
  const times = avail?.[date] ?? [];

  return (
    <section className="stack" style={{ gap: 14 }}>
      {msg ? <p className={`flash ${msg.ok ? 'ok' : 'bad'}`} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p> : null}
      {mode === 'idle' ? (
        <div className="row">
          {presence !== 'yes' ? <button className="btn primary" disabled={busy} onClick={() => run(confirm)}>Confirmar presença</button> : null}
          <button className="btn" disabled={busy || !canChange} onClick={() => { setMsg(null); setMode('move'); }}>Remarcar</button>
          <button className="btn danger" disabled={busy || !canChange} onClick={() => { setMsg(null); setMode('cancel'); }}>Cancelar horário</button>
        </div>
      ) : null}
      {!canChange ? <p className="hint">Remarcar ou cancelar por aqui só até {cancelHours}h antes do horário.</p> : null}

      {mode === 'cancel' ? (
        <div className="card">
          <h3>Cancelar este horário?</h3>
          <p className="hint">O horário fica livre para outra pessoa.</p>
          <div className="row">
            <button className="btn danger" disabled={busy} onClick={() => run(cancel)}>{busy ? 'Cancelando...' : 'Sim, cancelar'}</button>
            <button className="btn" onClick={() => setMode('idle')}>Voltar</button>
          </div>
        </div>
      ) : null}

      {mode === 'move' ? (
        <div className="card">
          <h3>Escolha o novo horário</h3>
          <div className="chips" role="radiogroup" aria-label="Profissional">
            <button type="button" className="btn sm" aria-pressed={who === proId} onClick={() => setWho(proId)}>Com {proName}</button>
            <button type="button" className="btn sm" aria-pressed={who === 'any'} onClick={() => setWho('any')}>Qualquer profissional</button>
          </div>
          {!avail ? <p className="hint">Carregando horários...</p> : (
            <>
              <div className="days">
                {dates.map((d) => (
                  <button key={d} type="button" className="day" aria-pressed={d === date} disabled={!avail[d].length} onClick={() => { setDate(d); setTime(''); }}>
                    <span className="wd">{dayLabel(d, today)}</span>
                    <span className="dn">{d.slice(8)}</span>
                    <span className="mo">{avail[d].length ? monthShort(d) : 'sem vaga'}</span>
                  </button>
                ))}
              </div>
              {times.length ? groupTimes(times).map(([label, list]) => (
                <div className="slotgroup" key={label}>
                  <h4>{label}</h4>
                  <div className="slots">
                    {list.map((t) => <button key={t} type="button" className="slot" aria-pressed={t === time} onClick={() => setTime(t)}>{t}</button>)}
                  </div>
                </div>
              )) : <p className="hint">Sem horários livres neste dia.</p>}
            </>
          )}
          <div className="row">
            <button className="btn primary" disabled={busy || !date || !time} onClick={() => run(() => reschedule({ date, time, professionalId: who }))}>
              {busy ? 'Remarcando...' : 'Confirmar novo horário'}
            </button>
            <button className="btn" onClick={() => setMode('idle')}>Voltar</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
