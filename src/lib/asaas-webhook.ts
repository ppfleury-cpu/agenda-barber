import { PAID_EVENTS, type AsaasWebhook } from './asaas';

export type WebhookDecision =
  | { action: 'ignore'; reason: string }
  | { action: 'paid'; eventKey: string; subscriptionId?: string; customerId?: string; shopId?: string; dueDate: string };

/** Decide o que fazer com um aviso do Asaas. Só pagamento confirmado/recebido libera acesso. */
export function decideWebhook(body: AsaasWebhook): WebhookDecision {
  const event = body?.event;
  const p = body?.payment;
  if (!event || !p) return { action: 'ignore', reason: 'sem evento ou pagamento' };
  if (!PAID_EVENTS.includes(event)) return { action: 'ignore', reason: `evento ${event} não altera o acesso` };
  if (!p.dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(p.dueDate)) return { action: 'ignore', reason: 'pagamento sem data de vencimento' };
  if (!p.subscription && !p.customer && !p.externalReference) return { action: 'ignore', reason: 'pagamento sem assinatura nem cliente' };
  return {
    action: 'paid',
    // Chave de idempotência: o mesmo aviso (ou o mesmo pagamento no mesmo evento) só vale uma vez.
    eventKey: body.id ?? `${event}:${p.id ?? p.dueDate}`,
    subscriptionId: p.subscription,
    customerId: p.customer,
    shopId: p.externalReference,
    dueDate: p.dueDate,
  };
}
