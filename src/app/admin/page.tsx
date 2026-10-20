import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { accessOf } from '@/lib/billing';
import { dateOf } from '@/lib/time';
import type { Shop } from '@/lib/types';
import { addTrial, markPaid, setSuspended } from './actions';

export const metadata: Metadata = { title: 'Administração' };
export const dynamic = 'force-dynamic';

const LABEL = { trial: 'Teste', active: 'Em dia', expired: 'Vencida', suspended: 'Suspensa' } as const;
const PILL = { trial: 'warn', active: 'ok', expired: 'bad', suspended: 'bad' } as const;
const fmt = (iso: string | null) => (iso ? dateOf(iso).split('-').reverse().join('/') : '—');

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [shopsRes, apptsRes] = await Promise.all([
    admin.from('shops').select('*').order('created_at', { ascending: false }),
    admin.from('appointments').select('shop_id').gte('created_at', since).limit(50000),
  ]);
  const shops = (shopsRes.data ?? []) as Shop[];
  const counts = new Map<string, number>();
  for (const a of (apptsRes.data ?? []) as { shop_id: string }[]) counts.set(a.shop_id, (counts.get(a.shop_id) ?? 0) + 1);

  const states = shops.map((s) => accessOf(s));
  const paying = states.filter((a) => a.state === 'active').length;
  const trial = states.filter((a) => a.state === 'trial').length;
  const overdue = states.filter((a) => a.state === 'expired').length;

  return (
    <>
      <div className="row"><Link className="btn sm" href="/painel">← Voltar ao painel</Link></div>
      {sp.ok ? <p className="flash ok" role="status">{sp.ok}</p> : null}
      {sp.err ? <p className="flash bad" role="alert">{sp.err}</p> : null}
      <div className="stats">
        <div className="stat"><span>Barbearias</span><b>{shops.length}</b></div>
        <div className="stat"><span>Pagantes</span><b>{paying}</b></div>
        <div className="stat"><span>Em teste</span><b>{trial}</b></div>
        <div className="stat"><span>Vencidas</span><b>{overdue}</b></div>
      </div>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr><th>Barbearia</th><th>Situação</th><th>Teste até</th><th>Pago até</th><th>Auto</th><th>Agend. 30d</th><th>Ações</th></tr>
          </thead>
          <tbody>
            {shops.map((s, i) => {
              const a = states[i];
              return (
                <tr key={s.id}>
                  <td>
                    <b><Link href={`/${s.slug}`} target="_blank">{s.name}</Link></b>
                    <div className="note">{s.owner_email}</div>
                  </td>
                  <td><span className={`pill ${PILL[a.state]}`}>{LABEL[a.state]}</span></td>
                  <td>{fmt(s.trial_ends_at)}</td>
                  <td>{fmt(s.paid_until)}</td>
                  <td>{s.asaas_subscription_id ? 'Sim' : '—'}</td>
                  <td>{counts.get(s.id) ?? 0}</td>
                  <td>
                    <div className="row">
                      <form action={markPaid}>
                        <input type="hidden" name="id" value={s.id} />
                        <input type="hidden" name="days" value="30" />
                        <button className="btn sm primary">Recebi o Pix (+30 dias)</button>
                      </form>
                      <form action={addTrial}>
                        <input type="hidden" name="id" value={s.id} />
                        <button className="btn sm">+7 dias de teste</button>
                      </form>
                      <form action={setSuspended}>
                        <input type="hidden" name="id" value={s.id} />
                        <input type="hidden" name="suspended" value={String(!s.suspended)} />
                        <button className="btn sm">{s.suspended ? 'Reativar' : 'Suspender'}</button>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!shops.length ? <tr><td colSpan={7} className="hint">Nenhuma barbearia cadastrada ainda.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <p className="note">“Recebi o Pix” soma 30 dias ao que a barbearia já tinha pago e reativa a conta. Pagamentos automáticos pelo Asaas entram sozinhos.</p>
    </>
  );
}
