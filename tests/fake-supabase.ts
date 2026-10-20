// Banco de mentira em memória, só para testar a lógica de agendamento sem precisar do Supabase.
// Imita o encadeamento do supabase-js (.from().select().eq()...) e as travas do banco real.
import { randomUUID } from 'node:crypto';

type Row = Record<string, any>;
type Filter = (r: Row) => boolean;

const DEFAULTS: Record<string, () => Row> = {
  appointments: () => ({
    status: 'confirmed', source: 'online', confirmation_sent_at: null, confirmation_attempts: 0, confirmation_error: null,
    reminder_sent_at: null, reminder_attempts: 0, reminder_error: null, created_at: new Date().toISOString(),
  }),
  clients: () => ({ wa_consent: true, created_at: new Date().toISOString() }),
};

export class FakeDb {
  tables: Record<string, Row[]> = { shops: [], professionals: [], services: [], clients: [], appointments: [], time_blocks: [] };
  from(table: string) {
    return new Query(this, table);
  }
}

class Query implements PromiseLike<any> {
  private filters: Filter[] = [];
  private op: 'select' | 'insert' | 'update' | 'upsert' = 'select';
  private payload: Row | null = null;
  private returning = false;
  private mode: null | 'maybe' | 'one' = null;
  private head = false;
  private count = false;
  private onConflict = '';
  constructor(private db: FakeDb, private table: string) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (this.op === 'select') {
      this.head = Boolean(opts?.head);
      this.count = opts?.count === 'exact';
    } else this.returning = true;
    return this;
  }
  insert(row: Row) { this.op = 'insert'; this.payload = row; return this; }
  upsert(row: Row, o: { onConflict: string }) { this.op = 'upsert'; this.payload = row; this.onConflict = o.onConflict; return this; }
  update(row: Row) { this.op = 'update'; this.payload = row; return this; }
  eq(c: string, v: any) { this.filters.push((r) => r[c] === v); return this; }
  in(c: string, v: any[]) { this.filters.push((r) => v.includes(r[c])); return this; }
  is(c: string, v: any) { this.filters.push((r) => (v === null ? r[c] === null || r[c] === undefined : r[c] === v)); return this; }
  lt(c: string, v: any) { this.filters.push((r) => r[c] < v); return this; }
  lte(c: string, v: any) { this.filters.push((r) => r[c] <= v); return this; }
  gt(c: string, v: any) { this.filters.push((r) => r[c] > v); return this; }
  gte(c: string, v: any) { this.filters.push((r) => r[c] >= v); return this; }
  order() { return this; }
  limit() { return this; }
  maybeSingle() { this.mode = 'maybe'; return this; }
  single() { this.mode = 'one'; return this; }

  private rows() { return this.db.tables[this.table]; }
  private matches() { return this.rows().filter((r) => this.filters.every((f) => f(r))); }

  private checkInsert(row: Row): { code: string; message: string } | null {
    const rows = this.rows();
    if (this.table === 'clients' && rows.some((r) => r.shop_id === row.shop_id && r.phone === row.phone)) return { code: '23505', message: 'unique' };
    if (this.table === 'appointments' && ['confirmed', 'done'].includes(row.status)) {
      const clash = rows.some(
        (r) => r.professional_id === row.professional_id && ['confirmed', 'done'].includes(r.status) && r.starts_at < row.ends_at && row.starts_at < r.ends_at,
      );
      if (clash) return { code: '23P01', message: 'no_double_booking' };
    }
    return null;
  }

  private exec(): { data: any; error: any; count?: number } {
    if (this.op === 'select') {
      const m = this.matches();
      if (this.head) return { data: null, error: null, count: m.length };
      if (this.mode) return { data: m[0] ?? null, error: null };
      return { data: m, error: null };
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
    const m = this.matches();
    m.forEach((r) => Object.assign(r, this.payload));
    return { data: this.returning ? m : null, error: null };
  }

  then<A, B>(ok?: ((v: any) => A | PromiseLike<A>) | null, bad?: ((e: any) => B | PromiseLike<B>) | null) {
    return Promise.resolve(this.exec()).then(ok, bad);
  }
}

