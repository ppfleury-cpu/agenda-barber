// Envio de mensagens pelo WhatsApp Business Platform (Cloud API da Meta).
// Mensagens automáticas fora de uma conversa aberta precisam usar MODELOS aprovados pela Meta.
// Os textos dos dois modelos estão no README.
import { firstName, toWhatsappNumber } from './phone';
import { longDayLabel } from './time';

export type SendResult = { ok: true; id?: string } | { ok: false; error: string };

export function whatsappConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

/** Modelos não aceitam quebra de linha, tabulação nem 4 espaços seguidos nos parâmetros. */
export function cleanParam(s: string): string {
  const t = String(s ?? '').replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim();
  return (t || '-').slice(0, 120);
}

export async function sendTemplate(toDigits: string, template: string, params: string[]): Promise<SendResult> {
  if (!whatsappConfigured()) return { ok: false, error: 'WhatsApp não configurado' };
  const version = process.env.WHATSAPP_API_VERSION || 'v23.0';
  const url = `https://graph.facebook.com/${version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    to: toWhatsappNumber(toDigits),
    type: 'template',
    template: {
      name: template,
      language: { code: process.env.WHATSAPP_TEMPLATE_LANG || 'pt_BR' },
      components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text: cleanParam(text) })) }],
    },
  };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json().catch(() => ({}))) as {
      messages?: { id: string }[];
      error?: { message?: string; code?: number };
    };
    if (!res.ok) return { ok: false, error: `${res.status} ${json.error?.message ?? 'erro desconhecido'}`.slice(0, 300) };
    return { ok: true, id: json.messages?.[0]?.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 300) : 'falha de rede' };
  }
}

export type MessageData = {
  clientName: string;
  shopName: string;
  serviceName: string;
  proName: string;
  date: string; // AAAA-MM-DD
  time: string; // HH:MM
  today: string; // AAAA-MM-DD
  shopContact?: string; // telefone da barbearia já formatado; se faltar, usa o nome
};

export const templateNames = () => ({
  confirmation: process.env.WHATSAPP_TEMPLATE_CONFIRMATION || 'agendamento_confirmado',
  reminder: process.env.WHATSAPP_TEMPLATE_REMINDER || 'lembrete_agendamento',
});

/** Modelo 1: {{1}} nome, {{2}} barbearia, {{3}} serviço, {{4}} profissional, {{5}} dia, {{6}} hora, {{7}} contato da barbearia */
export function confirmationParams(d: MessageData): string[] {
  return [firstName(d.clientName), d.shopName, d.serviceName, d.proName, longDayLabel(d.date, d.today), d.time, d.shopContact || d.shopName];
}

/** Modelo 2: {{1}} nome, {{2}} barbearia, {{3}} serviço, {{4}} hora */
export function reminderParams(d: MessageData): string[] {
  return [firstName(d.clientName), d.shopName, d.serviceName, d.time];
}

/** Texto equivalente, para o link manual do painel (wa.me). */
export function confirmationText(d: MessageData): string {
  const [n, shop, svc, pro, day, time, contact] = confirmationParams(d);
  return `Olá, ${n}! Seu horário em ${shop} está confirmado: ${svc} com ${pro}, ${day} às ${time}. Para remarcar ou cancelar, fale pelo contato: ${contact}. Até lá!`;
}

export function reminderText(d: MessageData): string {
  const [n, shop, svc, time] = reminderParams(d);
  return `Oi, ${n}! Lembrete: seu horário em ${shop} (${svc}) é hoje às ${time}. Te esperamos!`;
}
