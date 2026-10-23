import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { addDays, localToDate } from './time';
import type { ReportAppt } from './reports';

/** Agendamento do relatório, com o nome do cliente e do profissional. */
export type ReportRow = ReportAppt & {
  id: string;
  clients: { name: string; phone: string } | null;
  professionals: { name: string } | null;
};

const PAGE_ROWS = 1000; // o Supabase devolve no máximo 1.000 linhas por consulta
const MAX_PAGES = 30;

/**
 * Agendamentos com início entre `from` e `to` (inclusive), no fuso do negócio.
 * Usa o cliente do dono logado: as regras do banco garantem que só vêm os dados dele.
 */
export async function loadReportRows(
  supabase: SupabaseClient, tz: string, from: string, to: string,
): Promise<{ rows: ReportRow[]; truncated: boolean }> {
  const rows: ReportRow[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await supabase
      .from('appointments')
      .select('id, professional_id, service_name, price_cents, starts_at, ends_at, status, source, clients(name, phone), professionals(name)')
      .gte('starts_at', localToDate(from, 0, tz).toISOString())
      .lt('starts_at', localToDate(addDays(to, 1), 0, tz).toISOString())
      .order('starts_at')
      .order('id')
      .range(page * PAGE_ROWS, page * PAGE_ROWS + PAGE_ROWS - 1);
    if (error) throw new Error(error.message);
    const got = (data ?? []) as unknown as ReportRow[];
    rows.push(...got);
    if (got.length < PAGE_ROWS) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}
