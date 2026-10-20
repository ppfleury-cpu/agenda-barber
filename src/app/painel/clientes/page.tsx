import type { Metadata } from 'next';
import { requireActiveShop } from '@/lib/auth';
import { dayMonth, dateOf } from '@/lib/time';
import { maskPhone, waLink } from '@/lib/phone';
import { brl } from '@/lib/time';

export const metadata: Metadata = { title: 'Clientes' };

type ApptRow = { client_id: string; status: string; starts_at: string; price_cents: number };

export default async function ClientsPage() {
  const { supabase, shop } = await requireActiveShop();
  const [cRes, aRes] = await Promise.all([
    supabase.from('clients').select('id, name, phone').order('created_at', { ascending: false }).limit(1000),
    supabase.from('appointments').select('client_id, status, starts_at, price_cents').in('status', ['done', 'noshow']).limit(20000),
  ]);
  const clients = (cRes.data ?? []) as { id: string; name: string; phone: string }[];
  const appts = (aRes.data ?? []) as ApptRow[];

  const stats = new Map<string, { done: number; noshow: number; last: string; spent: number }>();
  for (const a of appts) {
    const s = stats.get(a.client_id) ?? { done: 0, noshow: 0, last: '', spent: 0 };
    if (a.status === 'done') {
      s.done++;
      s.spent += a.price_cents;
      if (a.starts_at > s.last) s.last = a.starts_at;
    } else s.noshow++;
    stats.set(a.client_id, s);
  }
  const rows = clients
    .map((c) => ({ ...c, ...(stats.get(c.id) ?? { done: 0, noshow: 0, last: '', spent: 0 }) }))
    .sort((a, b) => b.done - a.done || a.name.localeCompare(b.name, 'pt-BR'));
  const target = shop.loyalty_target;

  return (
    <>
      <p className="hint">
        Cada cliente é criado sozinho no primeiro agendamento. A cada {target} atendimentos concluídos ele ganha um brinde (por exemplo, um corte grátis).
      </p>
      {rows.length ? (
        <div>
          <div className="crow" style={{ borderTop: 0, paddingBlock: '0 8px' }} aria-hidden="true">
            <span className="h">Cliente</span><span className="h">Visitas</span><span className="h">Faltas</span><span className="h loy">Fidelidade</span><span />
          </div>
          {rows.map((c) => {
            const prog = c.done % target;
            const free = c.done > 0 && prog === 0;
            return (
              <div className="crow" key={c.id}>
                <div>
                  <b>{c.name}</b>
                  <span className="sub">
                    {maskPhone(c.phone)}
                    {c.last ? ` · última visita ${dayMonth(dateOf(c.last))}` : ''}
                    {c.spent ? ` · ${brl(c.spent)} no total` : ''}
                  </span>
                </div>
                <div><span className="h">Visitas</span><b>{c.done}</b></div>
                <div><span className="h">Faltas</span><b>{c.noshow}</b></div>
                <div className="loy">
                  <span className="h">{free ? 'Brinde liberado' : `${prog} de ${target} para o brinde`}</span>
                  <div className="bar"><i style={{ width: `${free ? 100 : (prog / target) * 100}%` }} /></div>
                </div>
                <div className="go">
                  <a className="btn sm" target="_blank" rel="noopener" href={waLink(c.phone, `Oi, ${c.name.split(' ')[0]}! Aqui é da ${shop.name}. Que tal já deixar seu próximo horário marcado?`)}>
                    Chamar no WhatsApp
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="empty">Nenhum cliente ainda. Eles aparecem aqui assim que alguém agendar.</p>
      )}
    </>
  );
}
