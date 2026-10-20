import type { Metadata } from 'next';
import { requireActiveShop } from '@/lib/auth';
import { centsToInput } from '@/lib/money';
import type { Service } from '@/lib/types';
import { addService, saveService, toggleService } from '../actions';

export const metadata: Metadata = { title: 'Serviços' };

const DURATIONS = [5, 10, 15, 20, 25, 30, 40, 45, 50, 60, 75, 90, 120, 150, 180, 240];
const label = (m: number) => (m >= 60 && m % 60 === 0 ? `${m / 60} h` : m > 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);

function DurationSelect({ id, value }: { id: string; value: number }) {
  const options = DURATIONS.includes(value) ? DURATIONS : [...DURATIONS, value].sort((a, b) => a - b);
  return (
    <select id={id} name="duration" defaultValue={value}>
      {options.map((m) => <option key={m} value={m}>{label(m)}</option>)}
    </select>
  );
}

export default async function ServicesPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { supabase } = await requireActiveShop();
  const sp = await searchParams;
  const { data } = await supabase.from('services').select('*').order('created_at');
  const services = (data ?? []) as Service[];

  return (
    <>
      {sp.ok ? <p className="flash ok" role="status">{sp.ok}</p> : null}
      {sp.err ? <p className="flash bad" role="alert">{sp.err}</p> : null}
      <p className="hint">Estes serviços e preços aparecem para o cliente na hora de agendar. A duração define quanto tempo o horário fica ocupado.</p>

      <div className="card">
        <h3>Seus serviços</h3>
        {services.map((s) => (
          <div key={s.id} className="stack" style={{ gap: 10, opacity: s.active ? 1 : 0.65 }}>
            <form action={saveService} className="srow" style={{ gridTemplateColumns: 'minmax(0,1fr) 130px 130px auto' }}>
              <input type="hidden" name="id" value={s.id} />
              <div className="field"><label htmlFor={`n-${s.id}`}>Serviço</label><input id={`n-${s.id}`} name="name" defaultValue={s.name} maxLength={80} required /></div>
              <div className="field"><label htmlFor={`d-${s.id}`}>Duração</label><DurationSelect id={`d-${s.id}`} value={s.duration_min} /></div>
              <div className="field"><label htmlFor={`p-${s.id}`}>Preço (R$)</label><input id={`p-${s.id}`} name="price" inputMode="decimal" defaultValue={centsToInput(s.price_cents)} required /></div>
              <button className="btn sm">Salvar</button>
            </form>
            <form action={toggleService} className="row">
              <input type="hidden" name="id" value={s.id} />
              <input type="hidden" name="active" value={String(!s.active)} />
              <button className="btn sm">{s.active ? 'Esconder da página de agendamento' : 'Mostrar de novo'}</button>
              {s.active ? null : <span className="pill cancelled">Escondido</span>}
            </form>
          </div>
        ))}
        {!services.length ? <p className="hint">Nenhum serviço ainda. Adicione o primeiro abaixo.</p> : null}
      </div>

      <form action={addService} className="card">
        <h3>Adicionar serviço</h3>
        <div className="srow" style={{ gridTemplateColumns: 'minmax(0,1fr) 130px 130px auto' }}>
          <div className="field"><label htmlFor="new-name">Serviço</label><input id="new-name" name="name" maxLength={80} placeholder="Hidratação" required /></div>
          <div className="field"><label htmlFor="new-dur">Duração</label><DurationSelect id="new-dur" value={30} /></div>
          <div className="field"><label htmlFor="new-price">Preço (R$)</label><input id="new-price" name="price" inputMode="decimal" placeholder="30,00" required /></div>
          <button className="btn primary">Adicionar</button>
        </div>
      </form>
    </>
  );
}
