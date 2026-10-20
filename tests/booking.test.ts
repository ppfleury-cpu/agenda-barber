import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { FakeDb } from './fake-supabase';
import { createBooking, getAvailability } from '../src/lib/booking';
import { deliverConfirmation, deliverReminder, type NotifyAppt } from '../src/lib/notify';
import { addDays, todayLocal } from '../src/lib/time';
import type { PublicShop } from '../src/lib/types';

let db: FakeDb;
let admin: SupabaseClient;
let shop: PublicShop;
let fetchCalls: { url: string; body: any }[] = [];
const realFetch = globalThis.fetch;
const SERVICE = 'svc-corte', SERVICE60 = 'svc-60', P1 = 'pro-carlos', P2 = 'pro-rafael';
const tomorrow = () => addDays(todayLocal(), 1);
const mockFetch = (status = 200) => {
  fetchCalls = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    fetchCalls.push({ url, body: JSON.parse(init.body as string) });
    return new Response(JSON.stringify(status === 200 ? { messages: [{ id: 'wamid.1' }] } : { error: { message: 'Template not found' } }), { status });
  }) as typeof fetch;
};
const book = (over: Record<string, unknown> = {}) =>
  createBooking(admin, shop, {
    serviceIds: [SERVICE], professionalId: 'any', date: tomorrow(), time: '10:00', name: 'Lucas Almeida', phone: '(62) 91234-5678', consent: true, ...over,
  } as any, { source: 'online', minLeadMin: 15, maxDaysAhead: 13 });

beforeEach(() => {
  delete process.env.WHATSAPP_TOKEN;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
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
    { id: P1, shop_id: 'shop-1', name: 'Carlos', work_days: [0, 1, 2, 3, 4, 5, 6], active: true },
    { id: P2, shop_id: 'shop-1', name: 'Rafael', work_days: [0, 1, 2, 3, 4, 5, 6], active: true },
  );
  db.tables.services.push(
    { id: SERVICE, shop_id: 'shop-1', name: 'Corte masculino', duration_min: 30, price_cents: 4500, active: true },
    { id: SERVICE60, shop_id: 'shop-1', name: 'Corte + barba', duration_min: 60, price_cents: 7000, active: true },
  );
});

test('disponibilidade: 14 dias, horários livres e ocupados', async () => {
  const r = await getAvailability(admin, shop, { serviceIds: [SERVICE], professionalId: 'any', days: 14, minLeadMin: 15 });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(Object.keys(r.days).length, 14);
  assert.ok(r.days[tomorrow()].includes('10:00'));
  assert.ok(!r.days[tomorrow()].includes('18:45'));
  assert.ok(r.days[tomorrow()].includes('18:30'));
  // serviço de 60 min não começa às 18:30
  const r60 = await getAvailability(admin, shop, { serviceIds: [SERVICE60], professionalId: 'any', days: 14, minLeadMin: 15 });
  assert.ok(r60.ok && !r60.days[tomorrow()].includes('18:30') && r60.days[tomorrow()].includes('18:00'));
  // serviço inexistente
  const bad = await getAvailability(admin, shop, { serviceIds: ['nope'], professionalId: 'any', days: 14, minLeadMin: 15 });
  assert.equal(bad.ok, false);
});

test('agendar: cria cliente e horário, e o horário some da disponibilidade', async () => {
  const r = await book({ professionalId: P1 });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.appointment.time, '10:00');
  assert.equal(r.appointment.proName, 'Carlos');
  assert.equal(r.whatsapp, 'off'); // WhatsApp não configurado
  assert.equal(db.tables.clients.length, 1);
  assert.equal(db.tables.clients[0].phone, '62912345678');
  assert.equal(db.tables.appointments.length, 1);
  const a = db.tables.appointments[0];
  assert.equal(a.price_cents, 4500);
  assert.equal(a.source, 'online');
  const avail = await getAvailability(admin, shop, { serviceIds: [SERVICE], professionalId: P1, days: 14, minLeadMin: 15 });
  assert.ok(avail.ok && !avail.days[tomorrow()].includes('10:00') && avail.days[tomorrow()].includes('10:30'));
  // com "qualquer um", o 10:00 continua livre porque Rafael está livre
  const any = await getAvailability(admin, shop, { serviceIds: [SERVICE], professionalId: 'any', days: 14, minLeadMin: 15 });
  assert.ok(any.ok && any.days[tomorrow()].includes('10:00'));
});

test('agendar: horário já ocupado vira conflito, e "qualquer um" distribui entre os profissionais', async () => {
  const a = await book({ professionalId: P1 });
  const b = await book({ professionalId: P1, phone: '62988887777', name: 'Outro Cliente' });
  assert.ok(a.ok);
  assert.equal(b.ok, false);
  assert.equal((b as any).conflict, true);
  const c = await book({ professionalId: 'any', phone: '62988887777', name: 'Outro Cliente' });
  assert.ok(c.ok && c.appointment.proName === 'Rafael');
  const d = await book({ professionalId: 'any', phone: '62977776666', name: 'Terceiro' });
  assert.equal(d.ok, false); // os dois ocupados
  // horário sobreposto de serviço longo: 09:30 + 60 min invade o das 10:00
  const e = await book({ serviceIds: [SERVICE60], professionalId: P1, time: '09:30', phone: '62966665555', name: 'Quarto' });
  assert.equal(e.ok, false);
});

test('agendar: corrida entre dois pedidos no mesmo instante, só um passa (trava do banco)', async () => {
  const results = await Promise.all([
    book({ professionalId: P1, phone: '62911110001', name: 'Um' }),
    book({ professionalId: P1, phone: '62911110002', name: 'Dois' }),
  ]);
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.equal(db.tables.appointments.length, 1);
});

test('agendar: validações', async () => {
  assert.match((await book({ name: 'A' }) as any).error, /nome/i);
  assert.match((await book({ phone: '123' }) as any).error, /WhatsApp válido/);
  assert.match((await book({ date: '2020-01-01' }) as any).error, /não está disponível/);
  assert.match((await book({ date: addDays(todayLocal(), 40) }) as any).error, /não está disponível/);
  assert.match((await book({ date: '2026-02-30' }) as any).error, /inválido/);
  assert.match((await book({ time: '25:00' }) as any).error, /inválido/);
  assert.match((await book({ serviceIds: ['nope'] }) as any).error, /Serviço/);
  assert.equal((await book({ time: '03:00' }) as any).conflict, true); // fora do expediente
  assert.equal(db.tables.appointments.length, 0);
});

test('agendar: domingo fechado e folga do profissional', async () => {
  db.tables.shops[0].open_days = [1, 2, 3, 4, 5, 6];
  shop = { ...shop, open_days: [1, 2, 3, 4, 5, 6] };
  let sunday = tomorrow();
  while (new Date(`${sunday}T12:00:00Z`).getUTCDay() !== 0) sunday = addDays(sunday, 1);
  const r = await createBooking(admin, shop, { serviceIds: [SERVICE], professionalId: 'any', date: sunday, time: '10:00', name: 'Lucas', phone: '62912345678', consent: true }, { source: 'online', minLeadMin: 15, maxDaysAhead: 13 });
  assert.equal(r.ok, false);
  // Rafael de folga em todos os dias: só Carlos atende
  db.tables.professionals[1].work_days = [];
  const ok = await book({ professionalId: 'any' });
  assert.ok(ok.ok && ok.appointment.proName === 'Carlos');
  const off = await book({ professionalId: P2, phone: '62900001111', name: 'Fulano' });
  assert.equal(off.ok, false);
});

test('agendar: bloqueio de horário e profissional desativado', async () => {
  const start = new Date(`${tomorrow()}T13:00:00.000Z`).toISOString(); // 10:00 em Brasília
  const end = new Date(`${tomorrow()}T14:00:00.000Z`).toISOString();
  db.tables.time_blocks.push({ id: 'b1', shop_id: 'shop-1', professional_id: null, starts_at: start, ends_at: end, reason: 'Almoço' });
  const r = await book();
  assert.equal(r.ok, false);
  assert.equal((r as any).conflict, true);
  assert.ok((await book({ time: '11:00' })).ok);
  db.tables.professionals[0].active = false;
  const r2 = await book({ professionalId: P1, time: '15:00', phone: '62900002222', name: 'Beltrano' });
  assert.equal(r2.ok, false);
});

test('agendar: limite de 3 horários futuros por telefone', async () => {
  for (const time of ['09:00', '10:00', '11:00']) assert.ok((await book({ time })).ok, time);
  const r = await book({ time: '12:00' });
  assert.equal(r.ok, false);
  assert.match((r as any).error, /3 horários/);
  // outro telefone passa
  assert.ok((await book({ time: '12:00', phone: '62955554444', name: 'Outra Pessoa' })).ok);
  // cancelar um libera
  db.tables.appointments[0].status = 'cancelled';
  assert.ok((await book({ time: '13:00' })).ok);
});

test('agendar: barbearia sem acesso (teste vencido ou suspensa) não recebe agendamento', async () => {
  const expired = { ...shop, trial_ends_at: new Date(Date.now() - 86_400_000).toISOString() };
  const r1 = await createBooking(admin, expired, { serviceIds: [SERVICE], professionalId: 'any', date: tomorrow(), time: '10:00', name: 'Lucas', phone: '62912345678', consent: true }, { source: 'online', minLeadMin: 15, maxDaysAhead: 13 });
  assert.equal(r1.ok, false);
  const av = await getAvailability(admin, { ...shop, suspended: true }, { serviceIds: [SERVICE], professionalId: 'any', days: 14, minLeadMin: 15 });
  assert.equal(av.ok, false);
  const paid = { ...expired, paid_until: new Date(Date.now() + 10 * 86_400_000).toISOString() };
  const r2 = await createBooking(admin, paid, { serviceIds: [SERVICE], professionalId: 'any', date: tomorrow(), time: '10:00', name: 'Lucas', phone: '62912345678', consent: true }, { source: 'online', minLeadMin: 15, maxDaysAhead: 13 });
  assert.ok(r2.ok);
});

test('WhatsApp: confirmação sai na hora com os 7 parâmetros certos', async () => {
  process.env.WHATSAPP_TOKEN = 'tok';
  process.env.WHATSAPP_PHONE_NUMBER_ID = '555';
  mockFetch(200);
  const r = await book({ professionalId: P1 });
  assert.ok(r.ok && r.whatsapp === 'sent');
  assert.equal(fetchCalls.length, 1);
  const body = fetchCalls[0].body;
  assert.equal(body.to, '5562912345678');
  assert.equal(body.template.name, 'agendamento_confirmado_v2');
  const params = body.template.components[0].parameters.map((p: any) => p.text);
  assert.deepEqual(params.slice(0, 4), ['Lucas', 'Barbearia do João', 'Corte masculino', 'Carlos']);
  assert.equal(params[5], '10:00');
  assert.equal(params[6], '(62) 99999-0000');
  assert.ok(db.tables.appointments[0].confirmation_sent_at);
});

test('WhatsApp: sem consentimento, desligado na barbearia ou conta vencida, não envia', async () => {
  process.env.WHATSAPP_TOKEN = 'tok';
  process.env.WHATSAPP_PHONE_NUMBER_ID = '555';
  mockFetch(200);
  const r1 = await book({ consent: false });
  assert.ok(r1.ok && r1.whatsapp === 'off');
  const off = { ...shop, whatsapp_enabled: false };
  const r2 = await createBooking(admin, off, { serviceIds: [SERVICE], professionalId: 'any', date: tomorrow(), time: '11:00', name: 'Lucas', phone: '62900003333', consent: true }, { source: 'online', minLeadMin: 15, maxDaysAhead: 13 });
  assert.ok(r2.ok && r2.whatsapp === 'off');
  assert.equal(fetchCalls.length, 0);
});

test('WhatsApp: falha da Meta guarda o erro, conta a tentativa e libera nova tentativa', async () => {
  process.env.WHATSAPP_TOKEN = 'tok';
  process.env.WHATSAPP_PHONE_NUMBER_ID = '555';
  mockFetch(404);
  const r = await book({ professionalId: P1 });
  assert.ok(r.ok && r.whatsapp === 'pending');
  const a = db.tables.appointments[0];
  assert.equal(a.confirmation_sent_at, null);
  assert.equal(a.confirmation_attempts, 1);
  assert.match(a.confirmation_error, /Template not found/);
  // o serviço de reenvio tenta de novo e agora funciona
  mockFetch(200);
  const n: NotifyAppt = {
    ...a, client: { name: 'Lucas Almeida', phone: '62912345678', wa_consent: true },
    shop: { ...shop }, pro: { name: 'Carlos' },
  } as unknown as NotifyAppt;
  assert.equal(await deliverConfirmation(admin, n), 'sent');
  assert.ok(db.tables.appointments[0].confirmation_sent_at);
  // depois de enviada, não envia de novo
  assert.equal(await deliverConfirmation(admin, { ...n, confirmation_sent_at: db.tables.appointments[0].confirmation_sent_at }), 'skipped');
  assert.equal(fetchCalls.length, 1);
});

test('WhatsApp: lembrete é enviado uma única vez, mesmo com duas execuções ao mesmo tempo', async () => {
  process.env.WHATSAPP_TOKEN = 'tok';
  process.env.WHATSAPP_PHONE_NUMBER_ID = '555';
  const r = await book({ professionalId: P1 });
  assert.ok(r.ok);
  mockFetch(200);
  const a = db.tables.appointments[0];
  const n = { ...a, client: { name: 'Lucas Almeida', phone: '62912345678', wa_consent: true }, shop: { ...shop }, pro: { name: 'Carlos' } } as unknown as NotifyAppt;
  const results = await Promise.all([deliverReminder(admin, n), deliverReminder(admin, n)]);
  assert.deepEqual(results.sort(), ['sent', 'skipped']);
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].body.template.name, 'lembrete_agendamento');
  assert.deepEqual(fetchCalls[0].body.template.components[0].parameters.map((p: any) => p.text), ['Lucas', 'Barbearia do João', 'Corte masculino', '10:00']);
  // depois de 3 falhas, desiste
  assert.equal(await deliverReminder(admin, { ...n, reminder_sent_at: null, reminder_attempts: 3 }), 'skipped');
});
