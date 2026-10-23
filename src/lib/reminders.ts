// Quando mandar cada lembrete. Funções puras: o horário de cada lembrete é calculado na hora do
// agendamento e gravado no próprio agendamento, para o serviço automático só buscar "o que já venceu".

export type ReminderSettings = { reminder_day_before: boolean; reminder_lead_min: number };

export const DAY_BEFORE_MIN = 24 * 60;
/** Quem marcou em cima da hora acabou de receber a confirmação: não manda lembrete logo em seguida. */
export const MIN_GAP_AFTER_BOOKING_MIN = 30;
/** O lembrete da véspera não sai se faltar menos que isso (por exemplo, se o serviço ficou parado). */
export const DAY_BEFORE_LATEST_MIN = 3 * 60;

export const REMINDER_LEADS = [0, 30, 60, 120, 180] as const;

export function reminderDueTimes(
  startsAt: Date,
  now: Date,
  s: ReminderSettings,
): { dayBefore: Date | null; soon: Date | null } {
  const start = startsAt.getTime();
  const earliest = now.getTime() + MIN_GAP_AFTER_BOOKING_MIN * 60_000;
  const day = start - DAY_BEFORE_MIN * 60_000;
  const soon = s.reminder_lead_min > 0 ? start - s.reminder_lead_min * 60_000 : null;
  return {
    dayBefore: s.reminder_day_before && day >= earliest ? new Date(day) : null,
    soon: soon !== null && soon >= earliest ? new Date(soon) : null,
  };
}
