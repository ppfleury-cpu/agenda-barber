// Datas e horas no fuso de Brasília (America/Sao_Paulo).
// O Brasil não usa horário de verão desde 2019, então o deslocamento fixo de -03:00 é seguro.
// Datas são sempre texto "AAAA-MM-DD" e horas são minutos desde a meia-noite.

export const TZ = 'America/Sao_Paulo';
const OFFSET = '-03:00';

export const pad = (n: number) => String(n).padStart(2, '0');

/** "09:30" ou "09:30:00" -> 570 */
export function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/** 570 -> "09:30" */
export function fromMin(n: number): string {
  return `${pad(Math.floor(n / 60))}:${pad(n % 60)}`;
}

export function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function isValidTime(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

/** Soma dias a uma data "AAAA-MM-DD". */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Soma meses a uma data, mantendo o dia (ou o último dia do mês, se não existir). */
export function addMonths(date: string, n: number): string {
  const [y, m, day] = date.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return target.toISOString().slice(0, 10);
}

/** 0 = domingo ... 6 = sábado */
export function weekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** Momento exato (Date) de uma data + minutos do dia, no horário de Brasília. */
export function localToDate(date: string, minutes: number): Date {
  return new Date(`${date}T${fromMin(minutes)}:00${OFFSET}`);
}

/** Data e minutos do dia, em Brasília, de um instante qualquer. */
export function localParts(at: Date = new Date()): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

export function todayLocal(at: Date = new Date()): string {
  return localParts(at).date;
}

const WD_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const WD_LONG = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export const weekdayShort = (n: number) => WD_SHORT[n];
export const monthShort = (date: string) => MONTHS[Number(date.slice(5, 7)) - 1];
export const dayMonth = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

/** "Hoje", "Amanhã" ou "Qua". */
export function dayLabel(date: string, today: string): string {
  if (date === today) return 'Hoje';
  if (date === addDays(today, 1)) return 'Amanhã';
  return WD_SHORT[weekday(date)];
}

/** "hoje", "amanhã" ou "quarta-feira, 21/10". */
export function longDayLabel(date: string, today: string): string {
  if (date === today) return 'hoje';
  if (date === addDays(today, 1)) return 'amanhã';
  return `${WD_LONG[weekday(date)]}, ${dayMonth(date)}`;
}

/** Hora local "HH:MM" de um instante ISO. */
export function timeOf(iso: string | Date): string {
  const { minutes } = localParts(typeof iso === 'string' ? new Date(iso) : iso);
  return fromMin(minutes);
}

/** Data local "AAAA-MM-DD" de um instante ISO. */
export function dateOf(iso: string | Date): string {
  return localParts(typeof iso === 'string' ? new Date(iso) : iso).date;
}

export function brl(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

/** Dias da semana abertos, ex.: "Seg a Sáb" (ou lista, se não for sequência). */
export function daysSummary(days: number[]): string {
  const order = [1, 2, 3, 4, 5, 6, 0];
  const sorted = order.filter((d) => days.includes(d));
  if (!sorted.length) return 'Fechado';
  const idx = sorted.map((d) => order.indexOf(d));
  const sequential = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  if (sequential && sorted.length > 2) return `${WD_SHORT[sorted[0]]} a ${WD_SHORT[sorted[sorted.length - 1]]}`;
  return sorted.map((d) => WD_SHORT[d]).join(', ');
}

export function hourWord(t: string): string {
  const [h, m] = t.split(':');
  return m === '00' ? `${Number(h)}h` : `${Number(h)}h${m}`;
}
