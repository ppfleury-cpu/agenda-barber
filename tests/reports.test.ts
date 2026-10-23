// Relatórios de agendamentos e de faturamento: períodos, totais e planilhas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodOf, previousPeriod, weekStart, weeksOf, isPeriodKind } from '../src/lib/periods';
import { buildReport, type ReportAppt } from '../src/lib/reports';
import { toCsv, moneyCell, dateCell } from '../src/lib/csv';
import { appointmentsCsv, revenueCsv, type ExportRow } from '../src/lib/report-export';

test('períodos: dia, semana (segunda a domingo) e mês', () => {
  const d = periodOf('dia', '2026-10-23');
  assert.deepEqual([d.from, d.to, d.prev, d.next], ['2026-10-23', '2026-10-23', '2026-10-22', '2026-10-24']);
  assert.equal(d.label, 'sexta-feira, 23/10/2026');

  const w = periodOf('semana', '2026-10-23');
  assert.deepEqual([w.from, w.to, w.prev, w.next], ['2026-10-19', '2026-10-25', '2026-10-12', '2026-10-26']);
  assert.equal(w.label, '19/10 a 25/10/2026');
  assert.equal(weekStart('2026-10-25'), '2026-10-19', 'domingo é o fim da semana');
  assert.equal(weekStart('2026-10-19'), '2026-10-19');
  // semana que vira o ano
  const y = periodOf('semana', '2026-12-30');
  assert.deepEqual([y.from, y.to], ['2026-12-28', '2027-01-03']);
  assert.equal(y.label, '28/12/2026 a 03/01/2027');

  const m = periodOf('mes', '2026-10-23');
  assert.deepEqual([m.from, m.to, m.prev, m.next], ['2026-10-01', '2026-10-31', '2026-09-01', '2026-11-01']);
  assert.equal(m.label, 'outubro de 2026');
  assert.equal(periodOf('mes', '2026-02-10').to, '2026-02-28');
  assert.equal(periodOf('mes', '2028-02-10').to, '2028-02-29', 'ano bissexto');
  assert.equal(periodOf('mes', '2026-12-31').next, '2027-01-01');
  assert.equal(periodOf('mes', '2026-01-15').prev, '2025-12-01');
  assert.deepEqual([previousPeriod(m).from, previousPeriod(m).to], ['2026-09-01', '2026-09-30']);

  assert.equal(isPeriodKind('mes'), true);
  assert.equal(isPeriodKind('ano'), false);
});

test('semanas do mês: cortadas no começo e no fim do mês', () => {
  const m = periodOf('mes', '2026-10-01');
  const days: { date: string }[] = [];
  for (let i = 1; i <= 31; i++) days.push({ date: `2026-10-${String(i).padStart(2, '0')}` });
  const w = weeksOf(days);
  assert.equal(m.from, '2026-10-01');
  assert.deepEqual(w.map((x) => [x.from, x.to]), [
    ['2026-10-01', '2026-10-04'], // quinta a domingo
    ['2026-10-05', '2026-10-11'],
    ['2026-10-12', '2026-10-18'],
    ['2026-10-19', '2026-10-25'],
    ['2026-10-26', '2026-10-31'],
  ]);
  assert.equal(w.reduce((n, x) => n + x.days.length, 0), 31);
});

const appt = (day: string, status: ReportAppt['status'], price: number, source = 'online'): ReportAppt => ({
  professional_id: 'p1', service_name: 'Corte', price_cents: price,
  starts_at: `${day}T13:00:00Z`, ends_at: `${day}T13:30:00Z`, status, source,
});

test('relatório: contagens por situação e faturamento previsto, no total e por dia', () => {
  const r = buildReport(
    [appt('2026-10-19', 'done', 4500), appt('2026-10-19', 'noshow', 4500, 'painel'), appt('2026-10-20', 'confirmed', 7000),
      appt('2026-10-20', 'cancelled', 4500), appt('2026-10-21', 'confirmed', 3500, 'painel')],
    '2026-10-19', '2026-10-25',
  );
  assert.deepEqual(r.counts, { booked: 4, confirmed: 2, done: 1, noshow: 1, cancelled: 1, online: 3, painel: 2 });
  assert.equal(r.revenue, 4500);
  assert.equal(r.expected, 10500);
  assert.equal(r.days.length, 7);
  assert.deepEqual(r.days[0].counts, { booked: 2, confirmed: 0, done: 1, noshow: 1, cancelled: 0, online: 1, painel: 1 });
  assert.equal(r.days[1].expected, 7000);
  assert.equal(r.days[1].counts.cancelled, 1);
  assert.equal(r.days[6].counts.booked, 0);
});

test('planilha: formato que o Excel em português abre certo', () => {
  const csv = toCsv([['Nome', 'Valor'], ['Lucas; "o João"', moneyCell(4550)], ['=SOMA(A1)', '-12,50']]);
  assert.ok(csv.startsWith('﻿'), 'BOM para os acentos');
  const lines = csv.slice(1).split('\r\n');
  assert.equal(lines[0], 'Nome;Valor');
  assert.equal(lines[1], '"Lucas; ""o João""";45,50');
  assert.equal(lines[2], "'=SOMA(A1);-12,50", 'fórmula vira texto; número negativo continua número');
  assert.equal(moneyCell(0), '0,00');
  assert.equal(moneyCell(123456), '1234,56');
  assert.equal(dateCell('2026-10-23'), '23/10/2026');
});

test('planilha de agendamentos e de faturamento', () => {
  const rows: ExportRow[] = [
    { starts_at: '2026-10-23T12:30:00Z', ends_at: '2026-10-23T13:30:00Z', service_name: 'Corte + Barba', price_cents: 8000, status: 'done', source: 'online',
      clients: { name: 'Lucas Almeida', phone: '62912345678' }, professionals: { name: 'Carlos' } },
    { starts_at: '2026-10-23T14:00:00Z', ends_at: '2026-10-23T14:30:00Z', service_name: 'Corte', price_cents: 4500, status: 'noshow', source: 'painel',
      clients: null, professionals: null },
  ];
  const period = periodOf('dia', '2026-10-23');
  const a = appointmentsCsv(rows, 'America/Sao_Paulo', period).slice(1).split('\r\n');
  assert.equal(a[0], 'Agendamentos · sexta-feira, 23/10/2026');
  assert.equal(a[3], '23/10/2026;09:30;10:30;Lucas Almeida;62912345678;Corte + Barba;Carlos;Concluído;Online;80,00');
  assert.equal(a[4], '23/10/2026;11:00;11:30;;;Corte;;Faltou;Painel;45,00');
  // mesmo instante em Manaus: uma hora a menos
  assert.match(appointmentsCsv(rows, 'America/Manaus', period), /23\/10\/2026;08:30;09:30;Lucas/);

  const month = periodOf('mes', '2026-10-23');
  const rep = buildReport(rows.map((r) => ({ ...r, professional_id: 'p1' })), month.from, month.to, 'America/Sao_Paulo');
  const f = revenueCsv(rep, month, () => 'Carlos').slice(1).split('\r\n');
  assert.equal(f[0], 'Faturamento · outubro de 2026');
  assert.ok(f.includes('Faturado (concluídos);80,00'));
  assert.ok(f.includes('Perdido com faltas;45,00'));
  assert.ok(f.includes('Semana;Atendimentos;Faturado (R$);Ticket médio (R$);A receber (R$)'), 'mês resume por semana');
  assert.ok(f.includes('19/10/2026 a 25/10/2026;1;80,00;80,00;0,00'));
  assert.ok(f.includes('Carlos;1;80,00;1'));
  // semana resume por dia
  const week = periodOf('semana', '2026-10-23');
  const wk = revenueCsv(buildReport(rows.map((r) => ({ ...r, professional_id: 'p1' })), week.from, week.to), week, () => 'Carlos');
  assert.match(wk, /Dia;Atendimentos/);
  assert.match(wk, /23\/10\/2026;1;80,00;80,00;0,00/);
});
