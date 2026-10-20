// Cobrança automática da mensalidade pelo Asaas (Pix, boleto ou cartão, o cliente escolhe).
// Documentação: https://docs.asaas.com
export function asaasConfigured(): boolean {
  return Boolean(process.env.ASAAS_API_KEY);
}

function baseUrl(): string {
  return process.env.ASAAS_ENV === 'production' ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3';
}

type Json = Record<string, unknown>;

async function call<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: Json): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method,
    headers: {
      access_token: process.env.ASAAS_API_KEY ?? '',
      'User-Agent': 'agenda-barber',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as { errors?: { description?: string }[] } & Json;
  if (!res.ok) {
    const msg = json.errors?.map((e) => e.description).filter(Boolean).join('; ') || `erro ${res.status}`;
    throw new Error(msg);
  }
  return json as T;
}

export async function createCustomer(input: {
  name: string;
  email: string;
  cpfCnpj: string;
  mobilePhone?: string;
  externalReference: string;
}): Promise<{ id: string }> {
  return call<{ id: string }>('POST', '/customers', { ...input, notificationDisabled: false });
}

export async function createSubscription(input: {
  customer: string;
  value: number;
  nextDueDate: string; // AAAA-MM-DD
  description: string;
  externalReference: string;
}): Promise<{ id: string }> {
  return call<{ id: string }>('POST', '/subscriptions', {
    ...input,
    billingType: 'UNDEFINED', // o cliente escolhe Pix, boleto ou cartão na fatura
    cycle: 'MONTHLY',
  });
}

export type AsaasPayment = { id: string; invoiceUrl?: string; status: string; dueDate: string; value: number };

export async function listSubscriptionPayments(subscriptionId: string): Promise<AsaasPayment[]> {
  const r = await call<{ data?: AsaasPayment[] }>('GET', `/subscriptions/${encodeURIComponent(subscriptionId)}/payments`);
  return r.data ?? [];
}

export async function cancelSubscription(subscriptionId: string): Promise<void> {
  await call('DELETE', `/subscriptions/${encodeURIComponent(subscriptionId)}`);
}

/** CPF ou CNPJ: só dígitos, 11 ou 14. (Não valida os dígitos verificadores; o Asaas valida.) */
export function normalizeCpfCnpj(input: string): string | null {
  const d = String(input ?? '').replace(/\D/g, '');
  return d.length === 11 || d.length === 14 ? d : null;
}

/** Evento do webhook do Asaas (só os campos que usamos). */
export type AsaasWebhook = {
  id?: string;
  event?: string;
  payment?: {
    id?: string;
    customer?: string;
    subscription?: string;
    dueDate?: string;
    invoiceUrl?: string;
    externalReference?: string;
  };
};

export const PAID_EVENTS = ['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'];
