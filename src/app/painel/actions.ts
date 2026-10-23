'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireActiveShop, requireShop } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { cleanServiceIds, createBooking, getAvailability, type AvailabilityResult, type BookingInput, type BookingResult } from '@/lib/booking';
import { parseMoneyToCents } from '@/lib/money';
import { normalizePhone } from '@/lib/phone';
import { isValidDate, isValidTime, isValidTimezone, localToDate, toMin, todayLocal } from '@/lib/time';
import { REMINDER_LEADS } from '@/lib/reminders';
import { asaasConfigured, cancelSubscription, createCustomer, createSubscription, listSubscriptionPayments, normalizeCpfCnpj } from '@/lib/asaas';
import { firstDueDate, planPriceReais } from '@/lib/billing';
import { NICHE_IDS, THEME_IDS } from '@/lib/themes';
import { COVER_MAX_BYTES, IMAGE_TYPES, LOGO_MAX_BYTES, sniffImage } from '@/lib/image';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const days = (fd: FormData) =>
  Array.from(new Set(fd.getAll('days').map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))).sort((a, b) => a - b);

/** Volta para uma página mostrando uma mensagem (ok = verde, err = vermelho). */
function back(path: string, kind: 'ok' | 'err', msg: string, extra: Record<string, string> = {}): never {
  const q = new URLSearchParams({ ...extra, [kind]: msg });
  redirect(`${path}?${q.toString()}`);
}

const dateParam = (fd: FormData, tz?: string) => {
  const d = str(fd, 'd');
  return isValidDate(d) ? d : todayLocal(new Date(), tz);
};
const validIds = (v: unknown) => {
  const ids = cleanServiceIds(v);
  return ids && ids.every((id) => UUID.test(id)) ? ids : null;
};

/* ---------------- Agenda ---------------- */

export async function setStatus(fd: FormData) {
  const { supabase, shop } = await requireActiveShop();
  const id = str(fd, 'id');
  const to = str(fd, 'to');
  const d = dateParam(fd, shop.timezone);
  if (!UUID.test(id) || !['confirmed', 'done', 'noshow', 'cancelled'].includes(to)) back('/painel', 'err', 'Pedido inválido.', { d });
  const { error } = await supabase.from('appointments').update({ status: to }).eq('id', id);
  if (error) {
    back('/painel', 'err', error.code === '23P01' ? 'Não dá para desfazer: outro cliente já ocupou esse horário.' : 'Não foi possível atualizar o agendamento.', { d });
  }
  revalidatePath('/painel');
  const view = str(fd, 'view') === 'lista' ? '&view=lista' : '';
  redirect(`/painel?d=${d}${view}`);
}

export async function addBlock(fd: FormData) {
  const { supabase, shop } = await requireActiveShop();
  const d = dateParam(fd, shop.timezone);
  const date = str(fd, 'date');
  const from = str(fd, 'from');
  const to = str(fd, 'to');
  const who = str(fd, 'pro');
  const reason = str(fd, 'reason').slice(0, 80) || null;
  if (!isValidDate(date) || !isValidTime(from) || !isValidTime(to) || toMin(to) <= toMin(from)) {
    back('/painel', 'err', 'Confira o dia e os horários do bloqueio. O fim precisa ser depois do início.', { d });
  }
  let professionalId: string | null = null;
  if (who !== 'all') {
    if (!UUID.test(who)) back('/painel', 'err', 'Profissional inválido.', { d });
    const { data } = await supabase.from('professionals').select('id').eq('id', who).eq('shop_id', shop.id).maybeSingle();
    if (!data) back('/painel', 'err', 'Profissional não encontrado.', { d });
    professionalId = who;
  }
  const { error } = await supabase.from('time_blocks').insert({
    shop_id: shop.id,
    professional_id: professionalId,
    starts_at: localToDate(date, toMin(from), shop.timezone).toISOString(),
    ends_at: localToDate(date, toMin(to), shop.timezone).toISOString(),
    reason,
  });
  if (error) back('/painel', 'err', 'Não foi possível bloquear o horário.', { d });
  back('/painel', 'ok', 'Horário bloqueado.', { d: date });
}

export async function deleteBlock(fd: FormData) {
  const { supabase, shop } = await requireActiveShop();
  const id = str(fd, 'id');
  const d = dateParam(fd, shop.timezone);
  if (UUID.test(id)) await supabase.from('time_blocks').delete().eq('id', id);
  back('/painel', 'ok', 'Bloqueio removido.', { d });
}

export async function deleteWaitlist(fd: FormData) {
  const { supabase, shop } = await requireActiveShop();
  const id = str(fd, 'id');
  const d = dateParam(fd, shop.timezone);
  if (UUID.test(id)) await supabase.from('waitlist').delete().eq('id', id);
  back('/painel', 'ok', 'Removido da lista de espera.', { d });
}

/* ---------------- Novo agendamento (pelo dono) ---------------- */

export async function ownerAvailabilityAction(serviceIds: string[], professionalId: string): Promise<AvailabilityResult> {
  const { shop } = await requireActiveShop();
  const ids = validIds(serviceIds);
  if (!ids || !(professionalId === 'any' || UUID.test(String(professionalId)))) return { ok: false, error: 'Pedido inválido.' };
  return getAvailability(createAdminClient(), shop, { serviceIds: ids, professionalId, days: 30, minLeadMin: 0 });
}

export async function ownerBookAction(input: BookingInput & { hp?: string }): Promise<BookingResult> {
  const { shop } = await requireActiveShop();
  const ids = validIds(input?.serviceIds);
  if (!ids || !(input.professionalId === 'any' || UUID.test(String(input.professionalId)))) {
    return { ok: false, error: 'Pedido inválido.' };
  }
  const result = await createBooking(
    createAdminClient(),
    shop,
    {
      serviceIds: ids,
      professionalId: input.professionalId,
      date: String(input.date ?? ''),
      time: String(input.time ?? ''),
      name: String(input.name ?? ''),
      phone: String(input.phone ?? ''),
      consent: Boolean(input.consent),
    },
    { source: 'painel', minLeadMin: 0, maxDaysAhead: 60 },
  );
  if (result.ok) revalidatePath('/painel');
  return result;
}

/* ---------------- Serviços ---------------- */

const DURATIONS = [5, 10, 15, 20, 25, 30, 40, 45, 50, 60, 75, 90, 120, 150, 180, 240];

function readService(fd: FormData): { name: string; duration_min: number; price_cents: number } | string {
  const name = str(fd, 'name').replace(/\s+/g, ' ');
  const duration = Number(str(fd, 'duration'));
  const price = parseMoneyToCents(str(fd, 'price'));
  if (name.length < 1 || name.length > 80) return 'Digite o nome do serviço.';
  if (!DURATIONS.includes(duration)) return 'Escolha a duração do serviço.';
  if (price === null) return 'Digite um preço válido, por exemplo 45,00.';
  return { name, duration_min: duration, price_cents: price };
}

export async function addService(fd: FormData) {
  const { supabase, shop } = await requireActiveShop();
  const v = readService(fd);
  if (typeof v === 'string') back('/painel/servicos', 'err', v);
  const { error } = await supabase.from('services').insert({ shop_id: shop.id, ...v });
  if (error) back('/painel/servicos', 'err', 'Não foi possível adicionar o serviço.');
  back('/painel/servicos', 'ok', 'Serviço adicionado.');
}

export async function saveService(fd: FormData) {
  const { supabase } = await requireActiveShop();
  const id = str(fd, 'id');
  const v = readService(fd);
  if (!UUID.test(id)) back('/painel/servicos', 'err', 'Pedido inválido.');
  if (typeof v === 'string') back('/painel/servicos', 'err', v);
  const { error } = await supabase.from('services').update(v).eq('id', id);
  if (error) back('/painel/servicos', 'err', 'Não foi possível salvar o serviço.');
  back('/painel/servicos', 'ok', 'Serviço salvo.');
}

export async function toggleService(fd: FormData) {
  const { supabase } = await requireActiveShop();
  const id = str(fd, 'id');
  const active = str(fd, 'active') === 'true';
  if (UUID.test(id)) await supabase.from('services').update({ active }).eq('id', id);
  back('/painel/servicos', 'ok', active ? 'Serviço ativado.' : 'Serviço escondido da página de agendamento.');
}

/* ---------------- Equipe ---------------- */

/** Lê o formulário do profissional: nome, dias, jornada, almoço e serviços que faz. */
async function readProfessional(fd: FormData, shopId: string, supabase: Awaited<ReturnType<typeof requireActiveShop>>['supabase']) {
  const name = str(fd, 'name').replace(/\s+/g, ' ');
  const d = days(fd);
  const t = (k: string) => (isValidTime(str(fd, k)) ? str(fd, k) : null);
  const start = t('start'), end = t('end');
  const breakStart = t('break_start'), breakEnd = t('break_end');
  if (name.length < 1 || name.length > 60) return 'Digite o nome do profissional.';
  if (!d.length) return 'Marque pelo menos um dia de trabalho.';
  if (start && end && toMin(start) >= toMin(end)) return 'O horário de entrada precisa ser antes da saída.';
  if (Boolean(breakStart) !== Boolean(breakEnd)) return 'Preencha o início e o fim do almoço (ou deixe os dois vazios).';
  if (breakStart && breakEnd && toMin(breakStart) >= toMin(breakEnd)) return 'O almoço precisa terminar depois de começar.';
  const picked = fd.getAll('services').map(String).filter((id) => UUID.test(id));
  const { data: all } = await supabase.from('services').select('id').eq('shop_id', shopId);
  const allIds = ((all ?? []) as { id: string }[]).map((x) => x.id);
  const chosen = picked.filter((id) => allIds.includes(id));
  if (allIds.length && !chosen.length) return 'Marque pelo menos um serviço que o profissional faz.';
  return {
    name, work_days: d, start_time: start, end_time: end, break_start: breakStart, break_end: breakEnd,
    // todos marcados = "faz todos" (inclusive os serviços que forem criados depois)
    service_ids: chosen.length === allIds.length ? null : chosen,
  };
}

export async function addProfessional(fd: FormData) {
  const { supabase, shop } = await requireActiveShop();
  const v = await readProfessional(fd, shop.id, supabase);
  if (typeof v === 'string') back('/painel/equipe', 'err', v);
  const { error } = await supabase.from('professionals').insert({ shop_id: shop.id, ...v });
  if (error) back('/painel/equipe', 'err', 'Não foi possível adicionar o profissional.');
  back('/painel/equipe', 'ok', 'Profissional adicionado.');
}

export async function saveProfessional(fd: FormData) {
  const { supabase, shop } = await requireActiveShop();
  const id = str(fd, 'id');
  if (!UUID.test(id)) back('/painel/equipe', 'err', 'Pedido inválido.');
  const v = await readProfessional(fd, shop.id, supabase);
  if (typeof v === 'string') back('/painel/equipe', 'err', v);
  const { error } = await supabase.from('professionals').update(v).eq('id', id);
  if (error) back('/painel/equipe', 'err', 'Não foi possível salvar.');
  back('/painel/equipe', 'ok', 'Profissional salvo.');
}

export async function toggleProfessional(fd: FormData) {
  const { supabase } = await requireActiveShop();
  const id = str(fd, 'id');
  const active = str(fd, 'active') === 'true';
  if (UUID.test(id)) await supabase.from('professionals').update({ active }).eq('id', id);
  back('/painel/equipe', 'ok', active ? 'Profissional ativado.' : 'Profissional desativado. Os horários antigos continuam no histórico.');
}

/* ---------------- Configurações ---------------- */

export async function saveSettings(fd: FormData) {
  const { supabase, shop } = await requireShop();
  const name = str(fd, 'name').replace(/\s+/g, ' ');
  const phoneRaw = str(fd, 'phone');
  const open = str(fd, 'open');
  const close = str(fd, 'close');
  const slot = Number(str(fd, 'slot'));
  const loyalty = Number(str(fd, 'loyalty'));
  const timezone = str(fd, 'timezone');
  const windowDays = Number(str(fd, 'window'));
  const lead = Number(str(fd, 'lead'));
  const cancelHours = Number(str(fd, 'cancel'));
  const reminderLead = Number(str(fd, 'reminder_lead'));
  const d = days(fd);
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  if (name.length < 2 || name.length > 80) back('/painel/configuracoes', 'err', 'Digite o nome do seu negócio.');
  if (phoneRaw && !phone) back('/painel/configuracoes', 'err', 'Digite um WhatsApp válido com DDD.');
  if (!isValidTime(open) || !isValidTime(close) || toMin(open) >= toMin(close)) back('/painel/configuracoes', 'err', 'O horário de abrir precisa ser antes do de fechar.');
  if (![15, 30, 60].includes(slot)) back('/painel/configuracoes', 'err', 'Escolha o intervalo entre horários.');
  if (!Number.isInteger(loyalty) || loyalty < 2 || loyalty > 50) back('/painel/configuracoes', 'err', 'A fidelidade precisa ser entre 2 e 50 visitas.');
  if (!d.length) back('/painel/configuracoes', 'err', 'Marque pelo menos um dia de funcionamento.');
  if (!isValidTimezone(timezone)) back('/painel/configuracoes', 'err', 'Escolha o fuso horário.');
  if (![7, 14, 21, 30, 45, 60].includes(windowDays)) back('/painel/configuracoes', 'err', 'Escolha até quantos dias à frente o cliente pode agendar.');
  if (![0, 15, 30, 60, 120, 240, 720, 1440].includes(lead)) back('/painel/configuracoes', 'err', 'Escolha a antecedência mínima.');
  if (![0, 1, 2, 4, 12, 24, 48].includes(cancelHours)) back('/painel/configuracoes', 'err', 'Escolha o prazo para remarcar ou cancelar.');
  if (!(REMINDER_LEADS as readonly number[]).includes(reminderLead)) back('/painel/configuracoes', 'err', 'Escolha o lembrete do dia.');
  const { error } = await supabase
    .from('shops')
    .update({
      name, phone, open_time: open, close_time: close, slot_minutes: slot, loyalty_target: loyalty, open_days: d,
      whatsapp_enabled: fd.get('whatsapp') === 'on',
      timezone, booking_window_days: windowDays, min_lead_min: lead, cancel_hours: cancelHours,
      reminder_day_before: fd.get('day_before') === 'on', reminder_lead_min: reminderLead,
    })
    .eq('id', shop.id);
  if (error) back('/painel/configuracoes', 'err', 'Não foi possível salvar.');
  revalidatePath('/painel', 'layout');
  back('/painel/configuracoes', 'ok', 'Configurações salvas.');
}

/* ---------------- Aparência ---------------- */

const APP = '/painel/aparencia';

export async function saveAppearance(fd: FormData) {
  const { supabase, shop } = await requireShop();
  const niche = str(fd, 'niche');
  const theme = str(fd, 'theme');
  const welcome = str(fd, 'welcome').replace(/\s+/g, ' ');
  if (!(NICHE_IDS as string[]).includes(niche)) back(APP, 'err', 'Escolha o tipo de negócio.');
  if (!THEME_IDS.includes(theme)) back(APP, 'err', 'Escolha uma das cores da lista.');
  if (welcome.length > 200) back(APP, 'err', 'O texto de boas-vindas pode ter no máximo 200 letras.');
  const { error } = await supabase.from('shops').update({ niche, theme, welcome_text: welcome || null }).eq('id', shop.id);
  if (error) back(APP, 'err', 'Não foi possível salvar.');
  revalidatePath('/painel', 'layout');
  revalidatePath(`/${shop.slug}`);
  back(APP, 'ok', 'Aparência salva.');
}

/** Envia logo ou capa. Só o servidor grava no armazenamento, depois de conferir o conteúdo do arquivo. */
export async function uploadImage(fd: FormData) {
  const { shop } = await requireShop();
  const kind = str(fd, 'kind');
  if (kind !== 'logo' && kind !== 'cover') back(APP, 'err', 'Imagem inválida.');
  const file = fd.get('file');
  if (!(file instanceof File) || file.size === 0) back(APP, 'err', 'Escolha uma imagem.');
  const max = kind === 'logo' ? LOGO_MAX_BYTES : COVER_MAX_BYTES;
  if (file.size > max) back(APP, 'err', `A imagem passou de ${max / 1024 / 1024} MB. Escolha uma menor.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImage(bytes);
  if (!type) back(APP, 'err', 'Use uma imagem PNG, JPG ou WebP.');
  const { mime, ext } = IMAGE_TYPES[type];

  const admin = createAdminClient();
  const path = `${shop.id}/${kind}-${Date.now()}.${ext}`;
  const up = await admin.storage.from('shop-assets').upload(path, bytes, { contentType: mime, upsert: false });
  if (up.error) back(APP, 'err', 'Não foi possível enviar a imagem. Tente de novo.');
  const column = kind === 'logo' ? 'logo_path' : 'cover_path';
  const old = kind === 'logo' ? shop.logo_path : shop.cover_path;
  const { error } = await admin.from('shops').update({ [column]: path }).eq('id', shop.id);
  if (error) {
    await admin.storage.from('shop-assets').remove([path]);
    back(APP, 'err', 'Não foi possível salvar a imagem.');
  }
  if (old) await admin.storage.from('shop-assets').remove([old]);
  revalidatePath('/painel', 'layout');
  revalidatePath(`/${shop.slug}`);
  back(APP, 'ok', kind === 'logo' ? 'Logo atualizada.' : 'Capa atualizada.');
}

export async function removeImage(fd: FormData) {
  const { shop } = await requireShop();
  const kind = str(fd, 'kind');
  if (kind !== 'logo' && kind !== 'cover') back(APP, 'err', 'Imagem inválida.');
  const column = kind === 'logo' ? 'logo_path' : 'cover_path';
  const old = kind === 'logo' ? shop.logo_path : shop.cover_path;
  const admin = createAdminClient();
  await admin.from('shops').update({ [column]: null }).eq('id', shop.id);
  if (old) await admin.storage.from('shop-assets').remove([old]);
  revalidatePath('/painel', 'layout');
  revalidatePath(`/${shop.slug}`);
  back(APP, 'ok', 'Imagem removida.');
}

/* ---------------- Assinatura (Asaas) ---------------- */

export async function startSubscription(fd: FormData) {
  const { shop } = await requireShop();
  if (!asaasConfigured()) back('/painel/assinatura', 'err', 'A cobrança automática ainda não está ativa. Use o pagamento por Pix abaixo.');
  if (shop.asaas_subscription_id) back('/painel/assinatura', 'err', 'Você já tem uma assinatura automática.');
  const cpfCnpj = normalizeCpfCnpj(str(fd, 'cpf'));
  if (!cpfCnpj) back('/painel/assinatura', 'err', 'Digite um CPF (11 números) ou CNPJ (14 números) válido.');

  const admin = createAdminClient();
  let target: string | null = null;
  try {
    let customerId = shop.asaas_customer_id;
    if (!customerId) {
      const c = await createCustomer({
        name: shop.name, email: shop.owner_email, cpfCnpj, mobilePhone: shop.phone ?? undefined, externalReference: shop.id,
      });
      customerId = c.id;
      await admin.from('shops').update({ asaas_customer_id: customerId }).eq('id', shop.id);
    }
    const sub = await createSubscription({
      customer: customerId,
      value: planPriceReais(),
      nextDueDate: firstDueDate(shop.trial_ends_at),
      description: 'Agenda Barber - mensalidade',
      externalReference: shop.id,
    });
    await admin.from('shops').update({ asaas_subscription_id: sub.id }).eq('id', shop.id);
    const payments = await listSubscriptionPayments(sub.id).catch(() => []);
    target = payments.find((p) => p.invoiceUrl && ['PENDING', 'OVERDUE'].includes(p.status))?.invoiceUrl ?? null;
  } catch (e) {
    back('/painel/assinatura', 'err', `Não foi possível criar a assinatura: ${e instanceof Error ? e.message : 'erro desconhecido'}`);
  }
  if (target) redirect(target);
  back('/painel/assinatura', 'ok', 'Assinatura criada. Você vai receber a cobrança por e-mail e pode pagar por Pix, boleto ou cartão.');
}

export async function cancelSubscriptionAction() {
  const { shop } = await requireShop();
  if (shop.asaas_subscription_id && asaasConfigured()) {
    try {
      await cancelSubscription(shop.asaas_subscription_id);
    } catch (e) {
      back('/painel/assinatura', 'err', `Não foi possível cancelar: ${e instanceof Error ? e.message : 'erro desconhecido'}`);
    }
    await createAdminClient().from('shops').update({ asaas_subscription_id: null }).eq('id', shop.id);
  }
  back('/painel/assinatura', 'ok', 'Assinatura automática cancelada. Seu acesso continua até o fim do período já pago.');
}
