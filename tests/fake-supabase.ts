// Banco de mentira em memória, só para testar a lógica de agendamento sem precisar do Supabase.
// Imita o encadeamento do supabase-js (.from().select().eq()...) e as travas do banco real.
import { randomBytes, randomUUID } from 'node:crypto';

type Row = Record<string, any>;
type Filter = (r: Row) => boolean;

const token = () => randomBytes(32).toString('hex');

const DEFAULTS: Record<string, () => Row> = {
  appointments: () => ({
    status: 'confirmed', source: 'online', confirmation_sent_at: null, confirmation_attempts: 0, confirmation_error: null,
    reminder_sent_at: null, reminder_attempts: 0, reminder_error: null, created_at: new Date().toISOString(),
    manage_token: token(), presence: null, presence_at: null, cancelled_by: null, reminder_due_at: null,
    day_reminder_due_at: null, day_reminder_sent_at: null, day_reminder_attempts: 0, day_reminder_error: null,
  }),
  clients: () => ({ wa_consent: true, created_at: new Date().toISOString() }),
  phone_verifications: () => ({ attempts: 0, verified_at: null, created_at: new Date().toISOString() }),
  waitlist: () => ({ created_at: new Date().toISOString() }),
};

export class FakeDb {
  tables: Record<string, Row[]> = {
    shops: [], professionals: [], services: [], clients: [], appointments: [], time_blocks: [],
    phone_verifications: [], waitlist: [], rate_limits: [],
  };
  /** Chamadas a funções do banco (rpc). `rpcError` simula uma função que não existe. */
  rpcError: { message: string } | null = null;
  from(table: string) {
    return new Query(this, table);
  }
  async rpc(fn: string, args: Record<string, any>) {
    if (this.rpcError) return { data: null, error: this.rpcError };
    if (fn !== 'hit_rate_limit') return { data: null, error: { message: `função ${fn} não existe` } };
    const now = Date.now();
    const rows = this.tables.rate_limits;
    let r = rows.find((x) => x.key === args.p_key);
    if (!r) rows.push((r = { key: args.p_key, window_start: now, hits: 0 }));
    if (r.window_start < now - args.p_window_seconds * 1000) {
      r.window_start = now;
      r.hits = 0;
    }
    r.hits++;
    return { data: r.hits <= args.p_max, error: null };
  }
}

const overlapsAppt = (a: Row, b: Row) =>
  a.id !== b.id && a.professional_id === b.professional_id && ['confirmed', 'done'].includes(a.status) && ['confirmed', 'done'].includes(b.status) &&
  a.starts_at < b.ends_at && b.starts_at < a.ends_at;

class Query implements PromiseLike<any> {
  private filters: Filter[] = [];
  private op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
  private payload: Row | null = null;
  private returning = false;
  private mode: null | 'maybe' | 'one' = null;
  private head = false;
  private count = false;
  private onConflict = '';
  private sorts: { col: string; asc: boolean }[] = [];
  private max: number | null = null;
  private embeds: string[] = [];
  constructor(private db: FakeDb, private table: string) {}

  select(cols?: string, opts?: { count?: string; head?: boolean }) {
    // "clients!inner(name, phone)" -> junta a linha de clients pelo client_id (como o PostgREST)
    this.embeds = [...String(cols ?? '').matchAll(/(\w+)(?:!inner)?\(/g)].map((m) => m[1]);
    if (this.op === 'select') {
      this.head = Boolean(opts?.head);
      this.count = opts?.count === 'exact';
    } else this.returning = true;
    return this;
  }
  insert(row: Row) { this.op = 'insert'; this.payload = row; return this; }
  upsert(row: Row, o: { onConflict: string }) { this.op = 'upsert'; this.payload = row; this.onConflict = o.onConflict; return this; }
  update(row: Row) { this.op = 'update'; this.payload = row; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(c: string, v: any) { this.filters.push((r) => r[c] === v); return this; }
  in(c: string, v: any[]) { this.filters.push((r) => v.includes(r[c])); return this; }
  is(c: string, v: any) { this.filters.push((r) => (v === null ? r[c] === null || r[c] === undefined : r[c] === v)); return this; }
  // comparações com null nunca passam, como no SQL
  lt(c: string, v: any) { this.filters.push((r) => r[c] != null && r[c] < v); return this; }
  lte(c: string, v: any) { this.filters.push((r) => r[c] != null && r[c] <= v); return this; }
  gt(c: string, v: any) { this.filters.push((r) => r[c] != null && r[c] > v); return this; }
  gte(c: string, v: any) { this.filters.push((r) => r[c] != null && r[c] >= v); return this; }
  order(col: string, o?: { ascending?: boolean }) { this.sorts.push({ col, asc: o?.ascending !== false }); return this; }
  limit(n: number) { this.max = n; return this; }
  maybeSingle() { this.mode = 'maybe'; return this; }
  single() { this.mode = 'one'; return this; }

  private rows() { return this.db.tables[this.table]; }
  private embed(r: Row): Row | null {
    if (!this.embeds.length) return r;
    const out: Row = { ...r };
    for (const t of this.embeds) {
      const fk = `${t.replace(/s$/, '')}_id`;
      const rel = (this.db.tables[t] ?? []).find((x) => x.id === r[fk]);
      if (!rel) return null; // !inner: sem a linha ligada, a linha some
      out[t] = rel;
    }
    return out;
  }
  private matches() {
    let m = this.rows().filter((r) => this.filters.every((f) => f(r)));
    for (const s of [...this.sorts].reverse()) {
      m = [...m].sort((a, b) => (a[s.col] === b[s.col] ? 0 : (a[s.col] < b[s.col] ? -1 : 1) * (s.asc ? 1 : -1)));
    }
    return this.max === null ? m : m.slice(0, this.max);
  }

  private checkInsert(row: Row): { code: string; message: string } | null {
    const rows = this.rows();
    if (this.table === 'clients' && rows.some((r) => r.shop_id === row.shop_id && r.phone === row.phone)) return { code: '23505', message: 'unique' };
    if (this.table === 'waitlist' && rows.some((r) => r.shop_id === row.shop_id && r.date === row.date && r.phone === row.phone)) return { code: '23505', message: 'unique' };
    if (this.table === 'appointments' && rows.some((r) => overlapsAppt(r, row))) return { code: '23P01', message: 'no_double_booking' };
    return null;
  }

  private exec(): { data: any; error: any; count?: number } {
    if (this.op === 'select') {
      const m = this.matches().map((r) => this.embed(r)).filter(Boolean) as Row[];
      if (this.head) return { data: null, error: null, count: m.length };
      if (this.mode) return { data: m[0] ?? null, error: null };
      return { data: m, error: null, count: this.count ? m.length : undefined };
    }
    if (this.op === 'insert' || this.op === 'upsert') {
      const row: Row = { id: randomUUID(), ...(DEFAULTS[this.table]?.() ?? {}), ...this.payload! };
      if (this.op === 'upsert') {
        const keys = this.onConflict.split(',');
        const existing = this.rows().find((r) => keys.every((k) => r[k] === row[k]));
        if (existing) {
          Object.assign(existing, this.payload);
          return { data: this.returning ? existing : null, error: null };
        }
      }
      const err = this.checkInsert(row);
      if (err) return { data: null, error: err };
      this.rows().push(row);
      return { data: this.returning ? row : null, error: null };
    }
    if (this.op === 'delete') {
      const m = new Set(this.matches());
      this.db.tables[this.table] = this.rows().filter((r) => !m.has(r));
      return { data: null, error: null };
    }
    const m = this.matches();
    if (this.table === 'appointments') {
      for (const r of m) {
        const next = { ...r, ...this.payload };
        if (this.rows().some((o) => overlapsAppt(o, next))) return { data: null, error: { code: '23P01', message: 'no_double_booking' } };
      }
    }
    m.forEach((r) => Object.assign(r, this.payload));
    return { data: this.returning ? m : null, error: null };
  }

  then<A, B>(ok?: ((v: any) => A | PromiseLike<A>) | null, bad?: ((e: any) => B | PromiseLike<B>) | null) {
    return Promise.resolve(this.exec()).then(ok, bad);
  }
}
