// Regras de horários livres. Funções puras (sem banco), fáceis de testar.
import { addDays, localToDate, toMin, fromMin, weekday, localParts } from './time';

export type ShopHours = {
  open_time: string; // "09:00" ou "09:00:00"
  close_time: string;
  open_days: number[];
  slot_minutes: number;
  timezone?: string | null;
};

/** Profissional. Horários vazios = segue o horário do negócio; almoço vazio = sem almoço fixo. */
export type Pro = {
  id: string;
  work_days: number[];
  start_time?: string | null;
  end_time?: string | null;
  break_start?: string | null;
  break_end?: string | null;
  service_ids?: string[] | null;
};

/** Intervalo ocupado. professional_id nulo = barbearia inteira (bloqueio geral). */
export type Busy = { professional_id: string | null; start: number; end: number; kind: 'appt' | 'block' };

export const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) => aStart < bEnd && bStart < aEnd;

export type FreeSlot = { time: string; proIds: string[] };

/** Faz todos estes serviços? (lista vazia no profissional = faz todos) */
export function proDoesAll(p: Pick<Pro, 'service_ids'>, serviceIds: string[]): boolean {
  if (!p.service_ids || p.service_ids.length === 0) return true;
  return serviceIds.every((id) => p.service_ids!.includes(id));
}

/** Janela de trabalho do profissional no dia, em minutos, já cortada pelo horário do negócio. */
export function proWindow(shop: ShopHours, p: Pro): [number, number] | null {
  const from = Math.max(toMin(shop.open_time), p.start_time ? toMin(p.start_time) : 0);
  const to = Math.min(toMin(shop.close_time), p.end_time ? toMin(p.end_time) : 24 * 60);
  return from < to ? [from, to] : null;
}

/** Horários de um dia, com os profissionais livres em cada um. */
export function slotsForDay(args: {
  shop: ShopHours;
  pros: Pro[];
  date: string; // AAAA-MM-DD
  durationMin: number;
  busy: Busy[];
  now: Date;
  minLeadMin: number; // antecedência mínima para agendar
}): FreeSlot[] {
  const { shop, pros, date, durationMin, busy, now, minLeadMin } = args;
  const wd = weekday(date);
  if (!shop.open_days.includes(wd)) return [];
  const open = toMin(shop.open_time);
  const close = toMin(shop.close_time);
  const step = shop.slot_minutes;
  const earliest = now.getTime() + minLeadMin * 60_000;
  const working = pros
    .filter((p) => p.work_days.includes(wd))
    .map((p) => ({
      p,
      win: proWindow(shop, p),
      brk: p.break_start && p.break_end ? ([toMin(p.break_start), toMin(p.break_end)] as const) : null,
    }));
  const out: FreeSlot[] = [];
  for (let t = open; t + durationMin <= close; t += step) {
    const start = localToDate(date, t, shop.timezone).getTime();
    const end = start + durationMin * 60_000;
    const proIds =
      start < earliest
        ? []
        : working
            .filter(({ p, win, brk }) => {
              if (!win || t < win[0] || t + durationMin > win[1]) return false;
              if (brk && overlaps(t, t + durationMin, brk[0], brk[1])) return false;
              return !busy.some(
                (b) => (b.professional_id === null || b.professional_id === p.id) && overlaps(start, end, b.start, b.end),
              );
            })
            .map(({ p }) => p.id);
    out.push({ time: fromMin(t), proIds });
  }
  return out;
}

/** Quantos agendamentos cada profissional já tem (para distribuir o "qualquer um"). */
export function loadByPro(busy: Busy[]): Record<string, number> {
  const load: Record<string, number> = {};
  for (const b of busy) if (b.kind === 'appt' && b.professional_id) load[b.professional_id] = (load[b.professional_id] ?? 0) + 1;
  return load;
}

/** Entre os livres, escolhe quem tem menos atendimentos no dia (empate: o primeiro da lista). */
export function choosePro(proIds: string[], load: Record<string, number>): string | null {
  let best: string | null = null;
  let bestN = Infinity;
  for (const id of proIds) {
    const n = load[id] ?? 0;
    if (n < bestN) {
      best = id;
      bestN = n;
    }
  }
  return best;
}

/** Calcula os próximos `days` dias: data -> horários livres (só os que têm alguém livre). */
export function freeTimesByDay(args: {
  shop: ShopHours;
  pros: Pro[];
  fromDate: string;
  days: number;
  durationMin: number;
  busy: Busy[];
  now: Date;
  minLeadMin: number;
}): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (let i = 0; i < args.days; i++) {
    const date = addDays(args.fromDate, i);
    result[date] = slotsForDay({ ...args, date })
      .filter((s) => s.proIds.length > 0)
      .map((s) => s.time);
  }
  return result;
}

/** Início e fim (instantes) dos dias locais, para buscar o que já está ocupado. */
export function dayWindow(fromDate: string, days: number, tz?: string | null): { start: Date; end: Date } {
  return { start: localToDate(fromDate, 0, tz), end: localToDate(addDays(fromDate, days), 0, tz) };
}

export function todayParts(now: Date = new Date(), tz?: string | null) {
  return localParts(now, tz);
}
