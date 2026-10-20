import type { Metadata } from 'next';
import { requireActiveShop } from '@/lib/auth';
import { weekdayShort } from '@/lib/time';
import type { Professional } from '@/lib/types';
import { addProfessional, saveProfessional, toggleProfessional } from '../actions';

export const metadata: Metadata = { title: 'Equipe' };

const ORDER = [1, 2, 3, 4, 5, 6, 0];

function DayChips({ selected }: { selected: number[] }) {
  return (
    <div className="chips" role="group" aria-label="Dias de trabalho">
      {ORDER.map((d) => (
        <label className="chip" key={d}>
          <input type="checkbox" name="days" value={d} defaultChecked={selected.includes(d)} />
          <span>{weekdayShort(d)}</span>
        </label>
      ))}
    </div>
  );
}

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { supabase } = await requireActiveShop();
  const sp = await searchParams;
  const { data } = await supabase.from('professionals').select('*').order('created_at');
  const pros = (data ?? []) as Professional[];

  return (
    <>
      {sp.ok ? <p className="flash ok" role="status">{sp.ok}</p> : null}
      {sp.err ? <p className="flash bad" role="alert">{sp.err}</p> : null}
      <p className="hint">Marque os dias em que cada profissional trabalha. Nos outros dias ele aparece de folga e ninguém consegue agendar com ele.</p>

      {pros.map((p) => (
        <div key={p.id} className="card" style={{ opacity: p.active ? 1 : 0.65 }}>
          <form action={saveProfessional} className="stack" style={{ gap: 14 }}>
            <input type="hidden" name="id" value={p.id} />
            <div className="field"><label htmlFor={`pn-${p.id}`}>Nome</label><input id={`pn-${p.id}`} name="name" defaultValue={p.name} maxLength={60} required /></div>
            <div><span className="lbl">Dias em que trabalha</span><DayChips selected={p.work_days} /></div>
            <div><button className="btn sm primary">Salvar</button></div>
          </form>
          <form action={toggleProfessional} className="row">
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="active" value={String(!p.active)} />
            <button className="btn sm">{p.active ? 'Desativar profissional' : 'Ativar de novo'}</button>
            {p.active ? null : <span className="pill cancelled">Desativado</span>}
          </form>
        </div>
      ))}

      <form action={addProfessional} className="card stack" style={{ gap: 14 }}>
        <h3>Adicionar profissional</h3>
        <div className="field"><label htmlFor="new-pro">Nome</label><input id="new-pro" name="name" maxLength={60} placeholder="Rafael" required /></div>
        <div><span className="lbl">Dias em que trabalha</span><DayChips selected={[1, 2, 3, 4, 5, 6]} /></div>
        <div><button className="btn primary">Adicionar</button></div>
      </form>
    </>
  );
}
