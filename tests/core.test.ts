import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../src/lib/time';
import { normalizePhone, maskPhone, toWhatsappNumber, waLink } from '../src/lib/phone';
import { slotsForDay, freeTimesByDay, choosePro, loadByPro, type Busy, type ShopHours, type Pro } from '../src/lib/availability';
import { accessOf, extendPaidUntil, paidUntilFromPayment, firstDueDate, extendTrial } from '../src/lib/billing';
import { normalizeCpfCnpj } from '../src/lib/asaas';
import { cleanParam, confirmationParams, reminderParams, confirmationText, sendTemplate } from '../src/lib/whatsapp';

test('time: conversões e datas', () => {
  assert.equal(T.toMin('09:30'), 570);
  assert.equal(T.toMin('09:30:00'), 570);
  assert.equal(T.fromMin(570), '09:30');
  assert.equal(T.addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(T.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(T.addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(T.addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(T.addMonths('2026-12-15', 1), '2027-01-15');
  assert.equal(T.weekday('2026-10-19'), 1);
  assert.equal(T.isValidDate('2026-02-30'), false);
  assert.equal(T.isValidDate('2026-10-19'), true);
  assert.equal(T.isValidTime('24:00'), false);
  assert.equal(T.isValidTime('23:59'), true);
});

test('time: fuso de Brasília', () => {
  // 02:00 UTC do dia 20 = 23:00 do dia 19 em Brasília
  const d = new Date('2026-10-20T02:00:00Z');
  assert.deepEqual(T.localParts(d), { date: '2026-10-19', minutes: 23 * 60 });
  assert.equal(T.localToDate('2026-10-19', 9 * 60 + 30).toISOString(), '2026-10-19T12:30:00.000Z');
  assert.equal(T.timeOf('2026-10-19T12:30:00Z'), '09:30');
  assert.equal(T.dateOf('2026-10-20T01:59:00Z'), '2026-10-19');
  assert.equal(T.dayLabel('2026-10-20', '2026-10-19'), 'Amanhã');
  assert.equal(T.longDayLabel('2026-10-21', '2026-10-19'), 'quarta-feira, 21/10');
  assert.equal(T.brl(4500).replace(/\s/g, ' '), 'R$ 45,00');
  assert.equal(T.daysSummary([1, 2, 3, 4, 5, 6]), 'Seg a Sáb');
  assert.equal(T.daysSummary([1, 3, 5]), 'Seg, Qua, Sex');
});

test('phone', () => {
  assert.equal(normalizePhone('(62) 91234-5678'), '62912345678');
  assert.equal(normalizePhone('+55 62 91234-5678'), '62912345678');
  assert.equal(normalizePhone('5562912345678'), '62912345678');
  assert.equal(normalizePhone('62 3212-3456'), '6232123456');
  assert.equal(normalizePhone('6212345678'), '6212345678');
  assert.equal(normalizePhone('1234'), null);
  assert.equal(normalizePhone('62812345678'), null); // 11 dígitos sem 9
  assert.equal(normalizePhone('02912345678'), null);
  assert.equal(normalizePhone(''), null);
  assert.equal(maskPhone('62912345678'), '(62) 91234-5678');
  assert.equal(maskPhone('629'), '(62) 9');
  assert.equal(toWhatsappNumber('62912345678'), '5562912345678');
  assert.equal(toWhatsappNumber('5562912345678'), '5562912345678');
  assert.match(waLink('62912345678', 'Oi, tudo bem?'), /^https:\/\/wa\.me\/5562912345678\?text=Oi%2C%20tudo%20bem%3F$/);
});

const shop: ShopHours = { open_time: '09:00:00', close_time: '19:00:00', open_days: [1, 2, 3, 4, 5, 6], slot_minutes: 30 };
const pros: Pro[] = [
  { id: 'c', work_days: [1, 2, 3, 4, 5, 6] },
  { id: 'r', work_days: [2, 3, 4, 5, 6] },
];
const now = new Date('2026-10-19T11:00:00Z'); // segunda 08:00 em Brasília
const at = (date: string, hhmm: string) => T.localToDate(date, T.toMin(hhmm)).getTime();
const busy = (pro: string | null, date: string, a: string, b: string, kind: 'appt' | 'block' = 'appt'): Busy => ({
  professional_id: pro, start: at(date, a), end: at(date, b), kind,
});

test('availability: horários, duração e fechamento', () => {
  const s = slotsForDay({ shop, pros, date: '2026-10-21', durationMin: 60, busy: [], now, minLeadMin: 0 });
  assert.equal(s[0].time, '09:00');
  assert.equal(s.at(-1)!.time, '18:00'); // 60 min não pode começar às 18:30
  assert.deepEqual(s[0].proIds, ['c', 'r']);
  const s15 = slotsForDay({ shop: { ...shop, slot_minutes: 15 }, pros, date: '2026-10-21', durationMin: 15, busy: [], now, minLeadMin: 0 });
  assert.equal(s15.length, 40);
});

test('availability: domingo fechado e folga do profissional', () => {
  assert.deepEqual(slotsForDay({ shop, pros, date: '2026-10-25', durationMin: 30, busy: [], now, minLeadMin: 0 }), []);
  const mon = slotsForDay({ shop, pros, date: '2026-10-19', durationMin: 30, busy: [], now, minLeadMin: 0 });
  assert.ok(mon.filter((x) => x.proIds.length).every((x) => x.proIds.join() === 'c')); // Rafael folga na segunda
});

test('availability: passado e antecedência mínima', () => {
  const s = slotsForDay({ shop, pros, date: '2026-10-19', durationMin: 30, busy: [], now: new Date('2026-10-19T13:10:00Z'), minLeadMin: 15 }); // 10:10
  const free = s.filter((x) => x.proIds.length).map((x) => x.time);
  assert.equal(free[0], '10:30'); // 10:00 já passou, 10:30 está a 20 min (>= 15)
  const s2 = slotsForDay({ shop, pros, date: '2026-10-19', durationMin: 30, busy: [], now: new Date('2026-10-19T13:20:00Z'), minLeadMin: 15 }); // 10:20
  assert.equal(s2.filter((x) => x.proIds.length)[0].time, '11:00'); // 10:30 está a 10 min (< 15)
});

test('availability: conflitos e bloqueios', () => {
  const d = '2026-10-21';
  const b = [busy('c', d, '10:00', '11:00'), busy('r', d, '10:30', '11:00'), busy(null, d, '12:00', '13:00', 'block')];
  const s = slotsForDay({ shop, pros, date: d, durationMin: 30, busy: b, now, minLeadMin: 0 });
  const get = (t: string) => s.find((x) => x.time === t)!.proIds;
  assert.deepEqual(get('09:30'), ['c', 'r']);
  assert.deepEqual(get('10:00'), ['r']); // Carlos ocupado
  assert.deepEqual(get('10:30'), []); // os dois ocupados
  assert.deepEqual(get('11:00'), ['c', 'r']); // encostado, livre
  assert.deepEqual(get('12:00'), []); // bloqueio geral
  assert.deepEqual(get('12:30'), []);
  assert.deepEqual(get('13:00'), ['c', 'r']);
  // serviço de 60 min às 09:30 invade o horário de Carlos às 10:00
  const s60 = slotsForDay({ shop, pros, date: d, durationMin: 60, busy: b, now, minLeadMin: 0 });
  assert.deepEqual(s60.find((x) => x.time === '09:30')!.proIds, ['r']); // Rafael só ocupa a partir das 10:30
  assert.deepEqual(s60.find((x) => x.time === '09:00')!.proIds, ['c', 'r']);
});

test('availability: bloqueio de um profissional só', () => {
  const d = '2026-10-21';
  const s = slotsForDay({ shop, pros, date: d, durationMin: 30, busy: [busy('r', d, '14:00', '16:00', 'block')], now, minLeadMin: 0 });
  assert.deepEqual(s.find((x) => x.time === '14:30')!.proIds, ['c']);
});

test('availability: escolha do profissional e janela de dias', () => {
  const d = '2026-10-21';
  const b = [busy('c', d, '09:00', '09:30'), busy('c', d, '10:00', '10:30'), busy('r', d, '09:00', '09:30')];
  assert.equal(choosePro(['c', 'r'], loadByPro(b)), 'r'); // Rafael tem menos
  assert.equal(choosePro(['c', 'r'], {}), 'c'); // empate: primeiro
  assert.equal(choosePro([], {}), null);
  const week = freeTimesByDay({ shop, pros, fromDate: '2026-10-19', days: 7, durationMin: 30, busy: [], now, minLeadMin: 0 });
  assert.equal(Object.keys(week).length, 7);
  assert.deepEqual(week['2026-10-25'], []); // domingo
  assert.ok(week['2026-10-19'].length > 0 && !week['2026-10-19'].includes('08:00'));
});

test('billing: estados de acesso', () => {
  const n = new Date('2026-10-20T12:00:00Z');
  const base = { suspended: false, trial_ends_at: '2026-10-30T12:00:00Z', paid_until: null as string | null };
  assert.equal(accessOf(base, n).state, 'trial');
  assert.equal(accessOf(base, n).daysLeft, 10);
  assert.equal(accessOf({ ...base, trial_ends_at: '2026-10-10T00:00:00Z' }, n).state, 'expired');
  assert.equal(accessOf({ ...base, trial_ends_at: '2026-10-10T00:00:00Z' }, n).allowed, false);
  assert.equal(accessOf({ ...base, paid_until: '2026-11-20T00:00:00Z' }, n).state, 'active');
  assert.equal(accessOf({ ...base, paid_until: '2026-10-01T00:00:00Z' }, n).state, 'trial'); // pago venceu mas teste ainda vale
  assert.equal(accessOf({ ...base, suspended: true, paid_until: '2027-01-01T00:00:00Z' }, n).allowed, false);
});

test('billing: pagamentos', () => {
  const n = new Date('2026-10-20T12:00:00Z');
  // manual
  assert.equal(extendPaidUntil(null, 30, n), '2026-11-19T12:00:00.000Z');
  assert.equal(extendPaidUntil('2026-10-25T12:00:00Z', 30, n), '2026-11-24T12:00:00.000Z'); // soma ao que sobrou
  assert.equal(extendPaidUntil('2026-10-01T12:00:00Z', 30, n), '2026-11-19T12:00:00.000Z'); // vencido: conta de hoje
  assert.equal(extendTrial('2026-10-22T00:00:00Z', 7, n), '2026-10-29T00:00:00.000Z');
  // automático
  assert.equal(paidUntilFromPayment('2026-11-03', null), '2026-12-07T02:59:59.000Z'); // 03/12 + 3 dias = 06/12 23:59 BRT
  assert.equal(paidUntilFromPayment('2026-11-03', '2027-03-01T00:00:00Z'), '2027-03-01T00:00:00.000Z'); // nunca diminui
  assert.equal(paidUntilFromPayment('2026-01-31', null), '2026-03-04T02:59:59.000Z'); // 28/02 + 3 dias = 03/03 23:59 BRT
  // idempotente: o mesmo evento duas vezes dá o mesmo resultado
  const once = paidUntilFromPayment('2026-11-03', null);
  assert.equal(paidUntilFromPayment('2026-11-03', once), once);
  // primeiro vencimento
  assert.equal(firstDueDate('2026-10-30T15:00:00Z', n), '2026-10-30');
  assert.equal(firstDueDate('2026-10-01T15:00:00Z', n), '2026-10-20');
});

test('asaas: cpf/cnpj', () => {
  assert.equal(normalizeCpfCnpj('123.456.789-09'), '12345678909');
  assert.equal(normalizeCpfCnpj('12.345.678/0001-90'), '12345678000190');
  assert.equal(normalizeCpfCnpj('123'), null);
});

test('whatsapp: parâmetros e envio', async () => {
  assert.equal(cleanParam('Corte\n  e   barba\t'), 'Corte e barba');
  assert.equal(cleanParam(''), '-');
  const d = { clientName: 'Lucas Almeida', shopName: 'Barbearia do João', serviceName: 'Corte', proName: 'Carlos', date: '2026-10-21', time: '14:30', today: '2026-10-19', shopContact: '(62) 91234-5678' };
  assert.deepEqual(confirmationParams(d), ['Lucas', 'Barbearia do João', 'Corte', 'Carlos', 'quarta-feira, 21/10', '14:30', '(62) 91234-5678']);
  assert.equal(confirmationParams({ ...d, shopContact: undefined })[6], 'Barbearia do João');
  assert.deepEqual(reminderParams(d), ['Lucas', 'Barbearia do João', 'Corte', '14:30']);
  assert.match(confirmationText(d), /Seu horário em Barbearia do João está confirmado: Corte com Carlos, quarta-feira, 21\/10 às 14:30\. Para confirmar presença, remarcar ou cancelar: \(62\) 91234-5678$/);
  // com o link do cliente, o link entra no lugar do contato
  assert.equal(confirmationParams({ ...d, manageUrl: 'https://agenda.app/m/abc' })[6], 'https://agenda.app/m/abc');

  // sem configuração: não envia e explica
  delete process.env.WHATSAPP_TOKEN;
  assert.deepEqual(await sendTemplate('62912345678', 'x', ['a']), { ok: false, error: 'WhatsApp não configurado' });

  // com configuração: monta a chamada certa
  process.env.WHATSAPP_TOKEN = 'tok';
  process.env.WHATSAPP_PHONE_NUMBER_ID = '123';
  const calls: { url: string; init: RequestInit }[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ messages: [{ id: 'wamid.1' }] }), { status: 200 });
  }) as typeof fetch;
  const r = await sendTemplate('62912345678', 'agendamento_confirmado', ['Lucas', 'Barbearia', 'Corte']);
  assert.deepEqual(r, { ok: true, id: 'wamid.1' });
  assert.equal(calls[0].url, 'https://graph.facebook.com/v23.0/123/messages');
  const sent = JSON.parse(calls[0].init.body as string);
  assert.equal(sent.to, '5562912345678');
  assert.equal(sent.template.name, 'agendamento_confirmado');
  assert.equal(sent.template.language.code, 'pt_BR');
  assert.deepEqual(sent.template.components[0].parameters[0], { type: 'text', text: 'Lucas' });
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, 'Bearer tok');

  // erro da Meta
  globalThis.fetch = (async () => new Response(JSON.stringify({ error: { message: 'Template not found' } }), { status: 404 })) as typeof fetch;
  const bad = await sendTemplate('62912345678', 'x', ['a']);
  assert.equal(bad.ok, false);
  assert.match((bad as { error: string }).error, /404 Template not found/);
  // falha de rede
  globalThis.fetch = (async () => { throw new Error('ECONNRESET'); }) as typeof fetch;
  assert.deepEqual(await sendTemplate('62912345678', 'x', ['a']), { ok: false, error: 'ECONNRESET' });
  globalThis.fetch = realFetch;
});
