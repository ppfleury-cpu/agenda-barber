// Períodos dos relatórios: dia, semana (segunda a domingo) e mês do calendário. Funções puras.
import { addDays, addMonths, dayMonth, weekday } from './time';

export type PeriodKind = 'dia' | 'semana' | 'mes';
export const PERIOD_KINDS: PeriodKind[] = ['dia', 'semana', 'mes'];
export const PERIOD_LABEL: Record<PeriodKind, string> = { dia: 'Dia', semana: 'Semana', mes: 'Mês' };

const MONTHS_LONG = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const WD_LONG = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

export type Period = {
  kind: PeriodKind;
  from: string; // AAAA-MM-DD, primeiro dia
  to: string; // AAAA-MM-DD, último dia (inclusive)
  label: string; // "outubro de 2026", "19/10 a 25/10/2026", "quinta-feira, 23/10/2026"
  prev: string; // uma data dentro do período anterior
  next: string; // uma data dentro do período seguinte
};

export const isPeriodKind = (v: unknown): v is PeriodKind => PERIOD_KINDS.includes(v as PeriodKind);

/** Segunda-feira da semana da data. */
export function weekStart(date: string): string {
  return addDays(date, -((weekday(date) + 6) % 7));
}

export function periodOf(kind: PeriodKind, ref: string): Period {
  const year = ref.slice(0, 4);
  if (kind === 'dia') {
    return { kind, from: ref, to: ref, label: `${WD_LONG[weekday(ref)]}, ${dayMonth(ref)}/${year}`, prev: addDays(ref, -1), next: addDays(ref, 1) };
  }
  if (kind === 'semana') {
    const from = weekStart(ref);
    const to = addDays(from, 6);
    const label = from.slice(0, 4) === to.slice(0, 4)
      ? `${dayMonth(from)} a ${dayMonth(to)}/${to.slice(0, 4)}`
      : `${dayMonth(from)}/${from.slice(0, 4)} a ${dayMonth(to)}/${to.slice(0, 4)}`;
    return { kind, from, to, label, prev: addDays(from, -7), next: addDays(from, 7) };
  }
  const from = `${ref.slice(0, 7)}-01`;
  const to = addDays(addMonths(from, 1), -1);
  return { kind, from, to, label: `${MONTHS_LONG[Number(ref.slice(5, 7)) - 1]} de ${year}`, prev: addMonths(from, -1), next: addMonths(from, 1) };
}

/** O mesmo tipo de período, logo antes (para comparar). */
export const previousPeriod = (p: Period) => periodOf(p.kind, p.prev);

/** Nome do período atual: "Hoje", "Esta semana", "Este mês". */
export const currentLabel: Record<PeriodKind, string> = { dia: 'Hoje', semana: 'Esta semana', mes: 'Este mês' };

/** Agrupa dias em semanas de segunda a domingo (para o resumo do mês). */
export function weeksOf<T extends { date: string }>(days: T[]): { from: string; to: string; days: T[] }[] {
  const out: { from: string; to: string; days: T[] }[] = [];
  for (const d of days) {
    const start = weekStart(d.date);
    let w = out[out.length - 1];
    if (!w || w.from !== start) out.push((w = { from: start, to: d.date, days: [] }));
    w.days.push(d);
    w.to = d.date;
  }
  // a primeira e a última semana do mês começam/terminam dentro do mês
  if (out.length) out[0].from = out[0].days[0].date;
  return out;
}
