import type { Metadata } from 'next';
import { requireActiveShop } from '@/lib/auth';
import { fromMin, toMin, weekdayShort } from '@/lib/time';
import type { Professional, Service } from '@/lib/types';
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

function TimeSelect({ id, name, value, from, to, empty }: { id: string; name: string; value: string | null; from: number; to: number; empty: string }) {
  const opts: string[] = [];
  for (let m = from; m <= to; m += 15) opts.push(fromMin(m));
  return (
    <select id={id} name={name} defaultValue={value ? value.slice(0, 5) : ''}>
      <option value="">{empty}</option>
      {opts.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function ProFields({ p, services, openMin, closeMin }: { p?: Professional; services: Service[]; openMin: number; closeMin: number }) {
  const k = p?.id ?? 'new';
  const does = (id: string) => !p || !p.service_ids || p.service_ids.length === 0 || p.service_ids.includes(id);
  return (
    <>
      <div className="field"><label htmlFor={`pn-${k}`}>Nome</label><input id={`pn-${k}`} name="name" defaultValue={p?.name} maxLength={60} placeholder="Rafael" required /></div>
      <div><span className="lbl">Dias em que trabalha</span><DayChips selected={p?.work_days ?? [1, 2, 3, 4, 5, 6]} /></div>
      <div className="two">
        <div className="field"><label htmlFor={`ps-${k}`}>Entra às</label><TimeSelect id={`ps-${k}`} name="start" value={p?.start_time ?? null} from={openMin} to={closeMin} empty="Quando abre" /></div>
        <div className="field"><label htmlFor={`pe-${k}`}>Sai às</label><TimeSelect id={`pe-${k}`} name="end" value={p?.end_time ?? null} from={openMin} to={closeMin} empty="Quando fecha" /></div>
        <div className="field"><label htmlFor={`pb-${k}`}>Almoço de</label><TimeSelect id={`pb-${k}`} name="break_start" value={p?.break_start ?? null} from={openMin} to={closeMin} empty="Sem almoço fixo" /></div>
        <div className="field"><label htmlFor={`pf-${k}`}>até</label><TimeSelect id={`pf-${k}`} name="break_end" value={p?.break_end ?? null} from={openMin} to={closeMin} empty="—" /></div>
      </div>
      {services.length ? (
        <div>
          <span className="lbl">Serviços que faz</span>
          <div className="chips" role="group" aria-label="Serviços que faz">
            {services.map((s) => (
              <label className="chip" key={s.id}>
                <input type="checkbox" name="services" value={s.id} defaultChecked={does(s.id)} />
                <span>{s.name}{s.active ? '' : ' (escondido)'}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { supabase, shop } = await requireActiveShop();
  const sp = await searchParams;
  const [proRes, svcRes] = await Promise.all([
    supabase.from('professionals').select('*').order('created_at'),
    supabase.from('services').select('*').order('created_at'),
  ]);
  const pros = (proRes.data ?? []) as Professional[];
  const services = (svcRes.data ?? []) as Service[];
  const openMin = toMin(shop.open_time);
  const closeMin = toMin(shop.close_time);

  return (
    <>
      {sp.ok ? <p className="flash ok" role="status">{sp.ok}</p> : null}
      {sp.err ? <p className="flash bad" role="alert">{sp.err}</p> : null}
      <p className="hint">
        Para cada profissional: os dias, o horário de trabalho, o almoço e os serviços que faz. O almoço fica bloqueado todo dia
        sozinho, e o cliente só vê o profissional nos serviços que ele faz.
      </p>

      {pros.map((p) => (
        <div key={p.id} className="card" style={{ opacity: p.active ? 1 : 0.65 }}>
          <form action={saveProfessional} className="stack" style={{ gap: 14 }}>
            <input type="hidden" name="id" value={p.id} />
            <ProFields p={p} services={services} openMin={openMin} closeMin={closeMin} />
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
        <ProFields services={services} openMin={openMin} closeMin={closeMin} />
        <div><button className="btn primary">Adicionar</button></div>
      </form>
    </>
  );
}
