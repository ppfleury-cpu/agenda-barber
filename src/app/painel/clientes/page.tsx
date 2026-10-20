import type { Metadata } from 'next';
import Link from 'next/link';
import { requireActiveShop } from '@/lib/auth';
import { brl, dateOf, dayMonth } from '@/lib/time';
import { firstName, maskPhone, waLink } from '@/lib/phone';
import { terms } from '@/lib/themes';

export const metadata: Metadata = { title: 'Clientes' };

const PAGE = 50;
const AWAY_DAYS = 30;

type Row = {
  id: string; name: string; phone: string; created_at: string;
  done_count: number; noshow_count: number; spent_cents: number; last_visit: string | null; next_visit: string | null;
};

const FILTERS = [
  ['todos', 'Todos'],
  ['sumidos', `Sumidos há ${AWAY_DAYS}+ dias`],
  ['faltosos', 'Com faltas'],
  ['novos', 'Novos no mês'],
] as const;
type FilterId = (typeof FILTERS)[number][0];

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string; f?: string; p?: string }> }) {
  const { supabase, shop } = await requireActiveShop();
  const sp = await searchParams;
  const f: FilterId = (FILTERS.map((x) => x[0]) as string[]).includes(sp.f ?? '') ? (sp.f as FilterId) : 'todos';
  const search = String(sp.q ?? '').trim().slice(0, 60);
  const page = Math.max(0, Math.min(Number(sp.p) || 0, 1000));
  const now = Date.now();
  const awayIso = new Date(now - AWAY_DAYS * 86_400_000).toISOString();

  let query = supabase.from('client_overview').select('*', { count: 'exact' });
  if (search) {
    const digits = search.replace(/\D/g, '');
    const safe = search.replace(/[%_,()*]/g, ' ');
    query = digits.length >= 4 ? query.or(`name.ilike.%${safe}%,phone.like.%${digits}%`) : query.ilike('name', `%${safe}%`);
  }
  if (f === 'sumidos') query = query.lt('last_visit', awayIso).is('next_visit', null);
  if (f === 'faltosos') query = query.gt('noshow_count', 0);
  if (f === 'novos') query = query.gte('created_at', awayIso);
  const { data, count, error } = await query
    .order('done_count', { ascending: false })
    .order('name')
    .range(page * PAGE, page * PAGE + PAGE - 1);
  const rows = (data ?? []) as Row[];
  const target = shop.loyalty_target;
  const t = terms(shop.niche);
  const href = (o: Record<string, string | number>) => {
    const p = new URLSearchParams({ ...(search ? { q: search } : {}), ...(f !== 'todos' ? { f } : {}) });
    for (const [k, v] of Object.entries(o)) p.set(k, String(v));
    if (p.get('f') === 'todos') p.delete('f');
    if (p.get('p') === '0') p.delete('p');
    const qs = p.toString();
    return `/painel/clientes${qs ? `?${qs}` : ''}`;
  };
  const daysAway = (iso: string | null) => (iso ? Math.floor((now - new Date(iso).getTime()) / 86_400_000) : null);
  const message = (c: Row) => {
    const n = firstName(c.name);
    const away = daysAway(c.last_visit);
    return f === 'sumidos' && away !== null
      ? `Oi, ${n}! Faz ${away} dias que você não aparece ${t.in} ${shop.name}. Bora deixar o próximo horário marcado?`
      : `Oi, ${n}! Aqui é ${t.of} ${shop.name}. Que tal já deixar seu próximo horário marcado?`;
  };

  return (
    <>
      <p className="hint">
        Cada cliente é criado sozinho no primeiro agendamento. A cada {target} atendimentos concluídos ele ganha um brinde (por exemplo, um corte grátis).
      </p>
      <form className="row" action="/painel/clientes" method="get">
        <label className="sr" htmlFor="q">Buscar cliente</label>
        <input id="q" name="q" defaultValue={search} placeholder="Buscar por nome ou telefone" style={{ maxWidth: 300 }} />
        {f !== 'todos' ? <input type="hidden" name="f" value={f} /> : null}
        <button className="btn sm">Buscar</button>
      </form>
      <div className="chips" role="group" aria-label="Filtro">
        {FILTERS.map(([id, label]) => (
          <Link key={id} className="btn sm" aria-pressed={f === id} href={href({ f: id, p: 0 })}>{label}</Link>
        ))}
      </div>
      {f === 'sumidos' ? <p className="flash ok">Campanha de retorno: cada botão abre o WhatsApp com uma mensagem pronta para chamar o cliente de volta.</p> : null}
      {error ? <p className="flash bad">Não foi possível carregar os clientes. Rode de novo o arquivo supabase/schema.sql (versão 2) no Supabase.</p> : null}

      {rows.length ? (
        <div>
          <div className="crow" style={{ borderTop: 0, paddingBlock: '0 8px' }} aria-hidden="true">
            <span className="h">Cliente</span><span className="h">Visitas</span><span className="h">Faltas</span><span className="h loy">Fidelidade</span><span />
          </div>
          {rows.map((c) => {
            const prog = c.done_count % target;
            const free = c.done_count > 0 && prog === 0;
            const away = daysAway(c.last_visit);
            return (
              <div className="crow" key={c.id}>
                <div>
                  <b>{c.name}</b>
                  <span className="sub">
                    {maskPhone(c.phone)}
                    {c.last_visit ? ` · última visita ${dayMonth(dateOf(c.last_visit, shop.timezone))} (há ${away} dia${away === 1 ? '' : 's'})` : ''}
                    {c.spent_cents ? ` · ${brl(Number(c.spent_cents))} no total` : ''}
                    {c.next_visit ? ` · volta ${dayMonth(dateOf(c.next_visit, shop.timezone))}` : ''}
                  </span>
                </div>
                <div><span className="h">Visitas</span><b>{c.done_count}</b></div>
                <div><span className="h">Faltas</span><b>{c.noshow_count}</b></div>
                <div className="loy">
                  <span className="h">{free ? 'Brinde liberado' : `${prog} de ${target} para o brinde`}</span>
                  <div className="bar"><i style={{ width: `${free ? 100 : (prog / target) * 100}%` }} /></div>
                </div>
                <div className="go">
                  <a className="btn sm" target="_blank" rel="noopener" href={waLink(c.phone, message(c))}>Chamar no WhatsApp</a>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="empty">{search || f !== 'todos' ? 'Nenhum cliente encontrado com esse filtro.' : 'Nenhum cliente ainda. Eles aparecem aqui assim que alguém agendar.'}</p>
      )}

      {(count ?? 0) > PAGE ? (
        <div className="row">
          {page > 0 ? <Link className="btn sm" href={href({ p: page - 1 })}>← Anteriores</Link> : null}
          <span className="hint">{page * PAGE + 1}–{Math.min((page + 1) * PAGE, count ?? 0)} de {count}</span>
          {(page + 1) * PAGE < (count ?? 0) ? <Link className="btn sm" href={href({ p: page + 1 })}>Próximos →</Link> : null}
        </div>
      ) : null}
    </>
  );
}
