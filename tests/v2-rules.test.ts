// Versão 2: regras puras (fuso por negócio, jornada e almoço, serviços por profissional, lembretes, relatórios).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../src/lib/time';
import { proDoesAll, proWindow, slotsForDay, type Busy, type Pro, type ShopHours } from '../src/lib/availability';
import { reminderDueTimes } from '../src/lib/reminders';
import { buildReport, type ReportAppt } from '../src/lib/reports';

test('fuso: cada região do Brasil no horário certo', () => {
  // 09:30 no relógio local de cada fuso
  assert.equal(T.localToDate('2026-10-19', 570).toISOString(), '2026-10-19T12:30:00.000Z'); // Brasília (padrão)
  assert.equal(T.localToDate('2026-10-19', 570, 'America/Manaus').toISOString(), '2026-10-19T13:30:00.000Z');
  assert.equal(T.localToDate('2026-10-19', 570, 'America/Cuiaba').toISOString(), '2026-10-19T13:30:00.000Z');
  assert.equal(T.localToDate('2026-10-19', 570, 'America/Rio_Branco').toISOString(), '2026-10-19T14:30:00.000Z');
  assert.equal(T.localToDate('2026-10-19', 570, 'America/Noronha').toISOString(), '2026-10-19T11:30:00.000Z');
  // meia-noite do dia seguinte (1440 minutos)
  assert.equal(T.localToDate('2026-10-19', 1440, 'America/Manaus').toISOString(), '2026-10-20T04:00:00.000Z');
  // 03:30 UTC do dia 20 ainda é dia 19 em Manaus
  assert.deepEqual(T.localParts(new Date('2026-10-20T03:30:00Z'), 'America/Manaus'), { date: '2026-10-19', minutes: 23 * 60 + 30 });
  assert.equal(T.timeOf('2026-10-19T14:30:00Z', 'America/Rio_Branco'), '09:30');
  assert.equal(T.dateOf('2026-10-20T03:30:00Z', 'America/Manaus'), '2026-10-19');
  assert.equal(T.todayLocal(new Date('2026-10-20T02:30:00Z'), 'America/Noronha'), '2026-10-20');
  // fuso inválido cai no padrão
  assert.equal(T.localToDate('2026-10-19', 570, 'Europe/Paris').toISOString(), '2026-10-19T12:30:00.000Z');
  assert.equal(T.isValidTimezone('America/Manaus'), true);
  assert.equal(T.isValidTimezone('Europe/Paris'), false);
});

test('fuso: o deslocamento vem do Intl (funciona até com o antigo horário de verão)', () => {
  // dezembro de 2018: Brasília estava em -02:00
  assert.equal(T.localToDate('2018-12-01', 600).toISOString(), '2018-12-01T12:00:00.000Z');
  assert.equal(T.timeOf('2018-12-01T12:00:00Z'), '10:00');
});

const shop: ShopHours = { open_time: '09:00:00', close_time: '19:00:00', open_days: [1, 2, 3, 4, 5, 6], slot_minutes: 30 };
const MONDAY = '2026-10-19';
const now = new Date('2026-10-01T12:00:00Z');
const free = (pros: Pro[], dur = 30, busy: Busy[] = [], s: ShopHours = shop, date = MONDAY) =>
  slotsForDay({ shop: s, pros, date, durationMin: dur, busy, now, minLeadMin: 0 }).filter((x) => x.proIds.length).map((x) => x.time);

test('jornada e almoço do profissional', () => {
  const ana: Pro = { id: 'a', work_days: [1], start_time: '10:00', end_time: '14:00', break_start: '12:00', break_end: '13:00' };
  assert.deepEqual(free([ana]), ['10:00', '10:30', '11:00', '11:30', '13:00', '13:30']);
  // serviço de 60 min não pode invadir o almoço nem passar da saída
  assert.deepEqual(free([ana], 60), ['10:00', '10:30', '11:00', '13:00']);
  // sem horário próprio: segue o horário do negócio
  const bia: Pro = { id: 'b', work_days: [1] };
  assert.equal(free([bia]).length, 20);
  assert.deepEqual(proWindow(shop, bia), [540, 1140]);
  // horário do profissional é cortado pelo do negócio
  assert.deepEqual(proWindow(shop, { id: 'c', work_days: [1], start_time: '07:00', end_time: '22:00' }), [540, 1140]);
  // "qualquer um": o horário do almoço da Ana fica livre com a Bia
  const both = slotsForDay({ shop, pros: [ana, bia], date: MONDAY, durationMin: 30, busy: [], now, minLeadMin: 0 });
  assert.deepEqual(both.find((s) => s.time === '12:00')!.proIds, ['b']);
  assert.deepEqual(both.find((s) => s.time === '10:00')!.proIds, ['a', 'b']);
});

test('serviços por profissional', () => {
  assert.equal(proDoesAll({ service_ids: null }, ['x', 'y']), true);
  assert.equal(proDoesAll({ service_ids: [] }, ['x']), true);
  assert.equal(proDoesAll({ service_ids: ['x', 'y'] }, ['x']), true);
  assert.equal(proDoesAll({ service_ids: ['x'] }, ['x', 'y']), false);
});

test('horários livres respeitam o fuso do negócio', () => {
  const manaus: ShopHours = { ...shop, timezone: 'America/Manaus' };
  // ocupado das 13:00 às 13:30 UTC = 09:00 às 09:30 em Manaus
  const busy: Busy[] = [{ professional_id: 'b', start: Date.parse('2026-10-19T13:00:00Z'), end: Date.parse('2026-10-19T13:30:00Z'), kind: 'appt' }];
  const list = free([{ id: 'b', work_days: [1] }], 30, busy, manaus);
  assert.equal(list[0], '09:30');
  // o mesmo intervalo em Brasília seria 10:00 às 10:30
  const sp = free([{ id: 'b', work_days: [1] }], 30, busy);
  assert.ok(sp.includes('09:00') && !sp.includes('10:00'));
});

test('lembretes: quando cada um sai', () => {
  const at = new Date('2026-10-19T12:00:00Z');
  const s = { reminder_day_before: true, reminder_lead_min: 120 };
  const in3days = new Date(at.getTime() + 3 * 86_400_000);
  let r = reminderDueTimes(in3days, at, s);
  assert.equal(r.dayBefore!.toISOString(), new Date(in3days.getTime() - 86_400_000).toISOString());
  assert.equal(r.soon!.toISOString(), new Date(in3days.getTime() - 2 * 3_600_000).toISOString());
  // marcou para daqui a 5 horas: sem véspera, com lembrete 2h antes
  r = reminderDueTimes(new Date(at.getTime() + 5 * 3_600_000), at, s);
  assert.equal(r.dayBefore, null);
  assert.ok(r.soon);
  // marcou para daqui a 2h10: o lembrete sairia 10 min depois da confirmação, então não sai
  r = reminderDueTimes(new Date(at.getTime() + 130 * 60_000), at, s);
  assert.equal(r.soon, null);
  // configurações desligadas
  r = reminderDueTimes(in3days, at, { reminder_day_before: false, reminder_lead_min: 0 });
  assert.deepEqual(r, { dayBefore: null, soon: null });
});

test('relatório: faturamento, faltas, ticket e equipe', () => {
  const a = (day: string, status: ReportAppt['status'], price: number, pro = 'p1', svc = 'Corte', source = 'online'): ReportAppt => ({
    professional_id: pro, service_name: svc, price_cents: price, starts_at: `${day}T13:00:00Z`, ends_at: `${day}T13:30:00Z`, status, source,
  });
  const r = buildReport(
    [
      a('2026-10-01', 'done', 4500), a('2026-10-01', 'done', 7000, 'p2', 'Corte + Barba', 'painel'), a('2026-10-02', 'noshow', 4500),
      a('2026-10-02', 'cancelled', 4500), a('2026-10-03', 'done', 4500), a('2026-09-30', 'done', 99999), // fora do período
    ],
    '2026-10-01', '2026-10-03',
  );
  assert.equal(r.days.length, 3);
  assert.deepEqual(r.days.map((d) => d.revenue), [11500, 0, 4500]);
  assert.equal(r.revenue, 16000);
  assert.equal(r.done, 3);
  assert.equal(r.ticket, 5333);
  assert.equal(r.noshow, 1);
  assert.equal(r.noshowRate, 1 / 4); // cancelados não contam
  assert.equal(r.lostToNoshow, 4500);
  assert.equal(r.cancelled, 1);
  assert.equal(r.onlineShare, 4 / 5);
  assert.deepEqual(r.byService[0], { name: 'Corte', count: 2, revenue: 9000 });
  assert.deepEqual(r.byPro.find((p) => p.id === 'p1'), { id: 'p1', count: 2, revenue: 9000, minutes: 60, noshow: 1 });
});
