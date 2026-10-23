// Versão 2: fluxos com o banco de mentira (agendar, verificar WhatsApp, remarcar/cancelar, lista de espera, lembretes).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { FakeDb } from './fake-supabase';
import { createBooking, getAvailability } from '../src/lib/booking';
import { cancelByClient, confirmPresence, loadManaged, managedAvailability, rescheduleByClient } from '../src/lib/manage';
import { checkCode, isTrusted, requestCode, trustToken } from '../src/lib/verify';
import { joinWaitlist } from '../src/lib/waitlist';
import { runReminders } from '../src/lib/reminder-run';
import { withinLimit } from '../src/lib/rate-limit';
import { addDays, localToDate, todayLocal } from '../src/lib/time';
import type { PublicShop } from '../src/lib/types';

let db: FakeDb;
let admin: SupabaseClient;
let shop: PublicShop;
let fetchCalls: { url: string; body: any }[] = [];
const realFetch = globalThis.fetch;
const A = '11111111-1111-4111-8111-111111111111'; // corte 30 min
const B = '22222222-2222-4222-8222-222222222222'; // barba 30 min
const C = '33333333-3333-4333-8333-333333333333'; // pigmentação 60 min
const P1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; // faz tudo, 09-19
const P2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; // só corte, 13-19, almoço 15-16
const day = (n: number) => addDays(todayLocal(), n);
const isoAt = (date: string, hhmm: string) => localToDate(date, Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)), shop.timezone).toISOString();

const mockFetch = (status = 200) => {
  fetchCalls = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    fetchCalls.push({ url, body: JSON.parse(init.body as string) });
    return new Response(JSON.stringify(status === 200 ? { messages: [{ id: 'wamid.1' }] } : { error: { message: 'falhou' } }), { status });
  }) as typeof fetch;
};
const whatsappOn = () => {
  process.env.WHATSAPP_TOKEN = 'tok';
  process.env.WHATSAPP_PHONE_NUMBER_ID = '555';
  mockFetch(200);
};
const book = (over: Record<string, unknown> = {}, opts: Record<string, unknown> = {}) =>
  createBooking(admin, shop, {
    serviceIds: [A], professionalId: 'any', date: day(3), time: '10:00', name: 'Lucas Almeida', phone: '(62) 91234-5678', consent: true, ...over,
  } as any, { source: 'online', minLeadMin: 15, maxDaysAhead: 13, ...opts } as any);

beforeEach(() => {
  delete process.env.WHATSAPP_TOKEN;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  process.env.BOOKING_SECRET = 'segredo-de-teste-com-mais-de-32-caracteres';
  process.env.NEXT_PUBLIC_SITE_URL = 'https://agenda.test';
  globalThis.fetch = realFetch;
  db = new FakeDb();
  admin = db as unknown as SupabaseClient;
  shop = {
    id: 'shop-1', slug: 'barbearia-do-joao', name: 'Barbearia do João', phone: '62999990000',
    open_time: '09:00:00', close_time: '19:00:00', open_days: [0, 1, 2, 3, 4, 5, 6], slot_minutes: 30, whatsapp_enabled: true,
    suspended: false, trial_ends_at: new Date(Date.now() + 5 * 86_400_000).toISOString(), paid_until: null,
    niche: 'barbearia', theme: 'classico', welcome_text: null, logo_path: null, cover_path: null,
    timezone: 'America/Sao_Paulo', booking_window_days: 14, min_lead_min: 15, cancel_hours: 2, reminder_day_before: true, reminder_lead_min: 120,
  };
  db.tables.shops.push({ ...shop });
  db.tables.professionals.push(
    { id: P1, shop_id: 'shop-1', name: 'Carlos', work_days: [0, 1, 2, 3, 4, 5, 6], active: true, start_time: null, end_time: null, break_start: null, break_end: null, service_ids: null, created_at: '1' },
    { id: P2, shop_id: 'shop-1', name: 'Rafa', work_days: [0, 1, 2, 3, 4, 5, 6], active: true, start_time: '13:00', end_time: '19:00', break_start: '15:00', break_end: '16:00', service_ids: [A], created_at: '2' },
  );
  db.tables.services.push(
    { id: A, shop_id: 'shop-1', name: 'Corte', duration_min: 30, price_cents: 4500, active: true },
    { id: B, shop_id: 'shop-1', name: 'Barba', duration_min: 30, price_cents: 3500, active: true },
    { id: C, shop_id: 'shop-1', name: 'Pigmentação', duration_min: 60, price_cents: 6000, active: true },
  );
});

/* ---------------- agendamento ---------------- */

test('vários serviços: soma tempo e preço, e só profissional que faz todos', async () => {
  const r = await book({ serviceIds: [A, B] });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.appointment.serviceName, 'Corte + Barba');
  assert.equal(r.appointment.durationMin, 60);
  assert.equal(r.appointment.priceCents, 8000);
  assert.equal(r.appointment.proName, 'Carlos'); // Rafa não faz barba
  const a = db.tables.appointments[0];
  assert.deepEqual(a.service_ids, [A, B]);
  assert.equal(new Date(a.ends_at).getTime() - new Date(a.starts_at).getTime(), 60 * 60_000);
  // pedir a barba com o Rafa: ninguém
  const bad = await book({ serviceIds: [B], professionalId: P2, time: '14:00' });
  assert.equal(bad.ok, false);
  assert.match((bad as any).error, /Nenhum profissional/);
  // serviço repetido ou lista vazia
  assert.equal((await book({ serviceIds: [] })).ok, false);
  assert.equal((await book({ serviceIds: [A, B, C, A, B, C].map((x, i) => (i < 3 ? x : `${x.slice(0, -1)}${i}`)) })).ok, false);
});

test('disponibilidade usa jornada, almoço e serviços do profissional', async () => {
  const r = await getAvailability(admin, shop, { serviceIds: [A], professionalId: P2, days: 5, minLeadMin: 0 });
  assert.ok(r.ok);
  if (!r.ok) return;
  const d = r.days[day(3)];
  assert.equal(d[0], '13:00');
  assert.ok(!d.includes('15:00') && !d.includes('15:30'), 'almoço bloqueado sozinho');
  assert.ok(d.includes('16:00') && d.includes('18:30'));
  const rb = await getAvailability(admin, shop, { serviceIds: [B], professionalId: P2, days: 5, minLeadMin: 0 });
  assert.ok(rb.ok && Object.values(rb.days).every((l) => l.length === 0));
});

test('cliente já cadastrado: o nome não é trocado e o consentimento só muda com verificação', async () => {
  db.tables.clients.push({ id: 'c1', shop_id: 'shop-1', name: 'Maria Souza', phone: '62912345678', wa_consent: true });
  const r = await book({ name: 'Impostor', consent: false });
  assert.ok(r.ok);
  assert.equal(db.tables.clients.length, 1);
  assert.equal(db.tables.clients[0].name, 'Maria Souza');
  assert.equal(db.tables.clients[0].wa_consent, true, 'sem verificação, não muda');
  assert.ok(await book({ time: '11:00', consent: false }, { verified: true }).then((x) => x.ok));
  assert.equal(db.tables.clients[0].wa_consent, false, 'número confirmado: muda');
  assert.ok(await book({ time: '12:00', consent: true }, { source: 'painel', minLeadMin: 0 }).then((x) => x.ok));
  assert.equal(db.tables.clients[0].wa_consent, true, 'dono no balcão: muda');
});

test('limite de 3 horários vale para o online, não para o dono no balcão', async () => {
  for (const time of ['09:00', '10:00', '11:00']) assert.ok((await book({ time })).ok);
  assert.equal((await book({ time: '12:00' })).ok, false);
  assert.ok((await book({ time: '12:00' }, { source: 'painel', minLeadMin: 0 })).ok);
});

test('agendamento grava quando sai cada lembrete e o link do cliente', async () => {
  const r = await book();
  assert.ok(r.ok);
  if (!r.ok) return;
  const a = db.tables.appointments[0];
  const start = new Date(a.starts_at).getTime();
  assert.equal(new Date(a.day_reminder_due_at).getTime(), start - 86_400_000);
  assert.equal(new Date(a.reminder_due_at).getTime(), start - 2 * 3_600_000);
  assert.match(r.appointment.manageToken, /^[0-9a-f]{64}$/);
  // loja sem lembrete da véspera e sem lembrete no dia
  shop = { ...shop, reminder_day_before: false, reminder_lead_min: 0 };
  assert.ok((await book({ time: '15:00', phone: '62988887777', name: 'Outro' })).ok);
  assert.equal(db.tables.appointments[1].day_reminder_due_at, null);
  assert.equal(db.tables.appointments[1].reminder_due_at, null);
});

test('confirmação no WhatsApp leva o link de gerenciar', async () => {
  whatsappOn();
  const r = await book();
  assert.ok(r.ok && r.whatsapp === 'sent');
  const params = fetchCalls[0].body.template.components[0].parameters.map((p: any) => p.text);
  assert.equal(fetchCalls[0].body.template.name, 'agendamento_confirmado_v2');
  assert.equal(params[6], `https://agenda.test/m/${db.tables.appointments[0].manage_token}`);
});

/* ---------------- verificação do WhatsApp ---------------- */

test('código de verificação: envia, recusa errado, aceita certo e não reaproveita', async () => {
  whatsappOn();
  assert.deepEqual(await requestCode(admin, shop, '(62) 91234-5678'), { ok: true });
  const sent = fetchCalls[0].body.template;
  assert.equal(sent.name, 'codigo_verificacao');
  const code = sent.components[0].parameters[0].text;
  assert.match(code, /^\d{6}$/);
  assert.deepEqual(sent.components[1], { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] });
  assert.ok(!JSON.stringify(db.tables.phone_verifications).includes(code), 'o código não fica guardado no banco');
  const wrong = code === '000000' ? '111111' : '000000';
  const bad = await checkCode(admin, 'shop-1', '62912345678', wrong);
  assert.equal(bad.ok, false);
  assert.equal(db.tables.phone_verifications[0].attempts, 1);
  assert.deepEqual(await checkCode(admin, 'shop-1', '62912345678', code), { ok: true });
  assert.equal((await checkCode(admin, 'shop-1', '62912345678', code)).ok, false, 'já usado');
});

test('código de verificação: expira, limite de tentativas e de envios por hora', async () => {
  whatsappOn();
  const t0 = new Date();
  await requestCode(admin, shop, '62912345678', t0);
  const code = fetchCalls[0].body.template.components[0].parameters[0].text;
  const late = new Date(t0.getTime() + 11 * 60_000);
  assert.match((await checkCode(admin, 'shop-1', '62912345678', code, late) as any).error, /expirou/);
  // 5 erros bloqueiam até o certo
  await requestCode(admin, shop, '62912345678', new Date(t0.getTime() + 1000));
  const code2 = fetchCalls[1].body.template.components[0].parameters[0].text;
  const wrong = code2 === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) await checkCode(admin, 'shop-1', '62912345678', wrong);
  assert.match((await checkCode(admin, 'shop-1', '62912345678', code2) as any).error, /Muitas tentativas/);
  // 3 envios por hora para o mesmo número
  await requestCode(admin, shop, '62912345678', new Date(t0.getTime() + 2000));
  const fourth = await requestCode(admin, shop, '62912345678', new Date(t0.getTime() + 3000));
  assert.equal(fourth.ok, false);
  assert.equal(fetchCalls.length, 3);
  // número inválido nem tenta
  assert.equal((await requestCode(admin, shop, '123')).ok, false);
});

test('cookie de número confirmado: assinado, por barbearia e por número', () => {
  const tk = trustToken('shop-1', '62912345678');
  assert.equal(isTrusted(tk, 'shop-1', '(62) 91234-5678'), true);
  assert.equal(isTrusted(tk, 'shop-2', '62912345678'), false);
  assert.equal(isTrusted(tk, 'shop-1', '62900000000'), false);
  assert.equal(isTrusted(`62912345678.${'0'.repeat(40)}`, 'shop-1', '62912345678'), false);
  assert.equal(isTrusted(undefined, 'shop-1', '62912345678'), false);
});

/* ---------------- cliente cuidando do próprio horário ---------------- */

test('link do cliente: confirmar presença e cancelar', async () => {
  const r = await book();
  assert.ok(r.ok);
  if (!r.ok) return;
  const tk = r.appointment.manageToken;
  const m = await loadManaged(admin, tk);
  assert.ok(m && m.canChange && m.serviceName === 'Corte');
  assert.ok((await confirmPresence(admin, tk)).ok);
  assert.equal(db.tables.appointments[0].presence, 'yes');
  assert.ok((await cancelByClient(admin, tk)).ok);
  assert.equal(db.tables.appointments[0].status, 'cancelled');
  assert.equal(db.tables.appointments[0].cancelled_by, 'client');
  assert.equal((await cancelByClient(admin, tk)).ok, false, 'não cancela duas vezes');
  assert.equal(await loadManaged(admin, 'f'.repeat(64)), null);
  assert.equal(await loadManaged(admin, 'curto'), null);
});

test('link do cliente: perto do horário não deixa mudar', async () => {
  const soon = new Date(Date.now() + 60 * 60_000);
  db.tables.appointments.push({
    id: 'ap1', shop_id: 'shop-1', professional_id: P1, client_id: 'c1', service_id: A, service_ids: [A], service_name: 'Corte', price_cents: 4500,
    starts_at: soon.toISOString(), ends_at: new Date(soon.getTime() + 30 * 60_000).toISOString(), status: 'confirmed', manage_token: 'a'.repeat(64),
    presence: null,
  });
  const m = await loadManaged(admin, 'a'.repeat(64));
  assert.equal(m!.canChange, false);
  assert.match((await cancelByClient(admin, 'a'.repeat(64)) as any).error, /menos de 2 horas/);
  assert.equal(db.tables.appointments[0].status, 'confirmed');
  assert.ok((await confirmPresence(admin, 'a'.repeat(64))).ok, 'confirmar presença ainda pode');
});

test('link do cliente: remarcar recalcula lembretes, manda nova confirmação e respeita a trava', async () => {
  const r = await book({ serviceIds: [C] }); // 10:00 às 11:00
  assert.ok(r.ok);
  if (!r.ok) return;
  const tk = r.appointment.manageToken;
  // o próprio horário aparece livre ao remarcar
  const av = await managedAvailability(admin, tk, P1);
  assert.ok(av.ok && av.days[day(3)].includes('10:00'));
  // remarcar para 10:30 (sobrepõe o próprio horário antigo: pode)
  whatsappOn();
  const ok = await rescheduleByClient(admin, tk, { date: day(3), time: '10:30', professionalId: P1 });
  assert.ok(ok.ok, (ok as any).error);
  const a = db.tables.appointments[0];
  assert.equal(a.starts_at, isoAt(day(3), '10:30'));
  assert.equal(new Date(a.day_reminder_due_at).getTime(), new Date(a.starts_at).getTime() - 86_400_000);
  assert.equal(a.presence, null);
  assert.equal(fetchCalls.length, 1, 'nova confirmação enviada');
  // outro cliente ocupa 14:00 com o Carlos; remarcar para 13:30 (até 14:30) bate
  assert.ok((await book({ serviceIds: [B], professionalId: P1, time: '14:00', phone: '62977776666', name: 'Outro' })).ok);
  const clash = await rescheduleByClient(admin, tk, { date: day(3), time: '13:30', professionalId: P1 });
  assert.equal(clash.ok, false);
  assert.equal((clash as any).conflict, true);
  // dia fora da janela
  assert.equal((await rescheduleByClient(admin, tk, { date: day(30), time: '10:00', professionalId: 'any' })).ok, false);
});

test('lista de espera', async () => {
  const input = { date: day(2), serviceIds: [A], professionalId: P2, name: 'Paula Lima', phone: '(62) 93333-4444' };
  assert.deepEqual(await joinWaitlist(admin, shop, input), { ok: true });
  assert.deepEqual(await joinWaitlist(admin, shop, input), { ok: true });
  assert.equal(db.tables.waitlist.length, 1, 'mesmo número no mesmo dia não duplica');
  assert.equal(db.tables.waitlist[0].professional_id, P2);
  assert.equal(db.tables.waitlist[0].phone, '62933334444');
  assert.equal((await joinWaitlist(admin, shop, { ...input, date: day(40) })).ok, false);
  assert.equal((await joinWaitlist(admin, shop, { ...input, phone: '1' })).ok, false);
  assert.equal((await joinWaitlist(admin, { ...shop, suspended: true }, input)).ok, false);
});

/* ---------------- lembretes automáticos ---------------- */

test('serviço automático: manda só o que venceu, uma vez, e limpa registros velhos', async () => {
  whatsappOn();
  db.tables.clients.push({ id: 'c1', shop_id: 'shop-1', name: 'Lucas Almeida', phone: '62912345678', wa_consent: true });
  const now = Date.now();
  const mk = (id: string, startInMin: number, extra: Record<string, unknown>) => db.tables.appointments.push({
    id, shop_id: 'shop-1', professional_id: P1, client_id: 'c1', service_name: 'Corte', price_cents: 4500, status: 'confirmed',
    starts_at: new Date(now + startInMin * 60_000).toISOString(), ends_at: new Date(now + (startInMin + 30) * 60_000).toISOString(),
    created_at: new Date(now - 3 * 86_400_000).toISOString(), manage_token: id.padEnd(64, '0'),
    confirmation_sent_at: new Date(now - 86_400_000).toISOString(), confirmation_attempts: 0,
    reminder_sent_at: null, reminder_attempts: 0, reminder_due_at: null,
    day_reminder_sent_at: null, day_reminder_attempts: 0, day_reminder_due_at: null, ...extra,
  });
  const ago = new Date(now - 60_000).toISOString();
  const later = new Date(now + 3_600_000).toISOString();
  mk('vespera', 24 * 60 - 1, { day_reminder_due_at: ago }); // véspera vencida
  mk('futuro', 48 * 60, { day_reminder_due_at: later }); // ainda não venceu
  mk('atrasado', 90, { day_reminder_due_at: ago }); // véspera atrasada demais (falta 1h30): não manda
  mk('hoje', 150, { reminder_due_at: ago }); // lembrete do dia vencido
  mk('cancelado', 100, { reminder_due_at: ago, status: 'cancelled' });
  db.tables.rate_limits.push({ key: 'velho', window_start: new Date(now - 2 * 86_400_000).toISOString(), hits: 1 });

  const r1 = await runReminders(admin);
  assert.deepEqual(r1.dayBefore, { sent: 1, failed: 0, skipped: 0 });
  assert.deepEqual(r1.reminders, { sent: 1, failed: 0, skipped: 0 });
  const names = fetchCalls.map((c) => c.body.template.name).sort();
  assert.deepEqual(names, ['lembrete_agendamento', 'lembrete_vespera']);
  const vespera = fetchCalls.find((c) => c.body.template.name === 'lembrete_vespera')!.body.template.components[0].parameters.map((p: any) => p.text);
  assert.equal(vespera[6], `https://agenda.test/m/${'vespera'.padEnd(64, '0')}`);
  assert.equal(db.tables.rate_limits.length, 0);
  // segunda rodada não repete nada
  const r2 = await runReminders(admin);
  assert.equal(r2.dayBefore.sent + r2.reminders.sent, 0);
  assert.equal(fetchCalls.length, 2);
});

test('limite de tentativas por chave, e deixa passar se a função do banco não existir', async () => {
  assert.equal(await withinLimit(admin, 'booking:1.2.3.4', 3600, 2), true);
  assert.equal(await withinLimit(admin, 'booking:1.2.3.4', 3600, 2), true);
  assert.equal(await withinLimit(admin, 'booking:1.2.3.4', 3600, 2), false);
  assert.equal(await withinLimit(admin, 'booking:5.6.7.8', 3600, 2), true, 'outro IP tem a própria conta');
  db.rpcError = { message: 'function hit_rate_limit does not exist' };
  const err = console.error;
  console.error = () => {};
  try {
    assert.equal(await withinLimit(admin, 'booking:1.2.3.4', 3600, 2), true);
  } finally {
    console.error = err;
  }
});
