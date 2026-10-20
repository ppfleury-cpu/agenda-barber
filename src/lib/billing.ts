// Situação da assinatura de cada barbearia. Funções puras.
import { addDays, addMonths, todayLocal } from './time';

export type BillingFields = {
  suspended: boolean;
  trial_ends_at: string; // ISO
  paid_until: string | null; // ISO
};

export type AccessState = 'trial' | 'active' | 'expired' | 'suspended';

export type Access = {
  state: AccessState;
  allowed: boolean;
  until: Date | null;
  daysLeft: number; // dias inteiros que ainda restam (0 se acabou)
};

const DAY = 86_400_000;

export function accessOf(shop: BillingFields, now: Date = new Date()): Access {
  if (shop.suspended) return { state: 'suspended', allowed: false, until: null, daysLeft: 0 };
  const paid = shop.paid_until ? new Date(shop.paid_until) : null;
  if (paid && paid.getTime() > now.getTime()) {
    return { state: 'active', allowed: true, until: paid, daysLeft: Math.ceil((paid.getTime() - now.getTime()) / DAY) };
  }
  const trial = new Date(shop.trial_ends_at);
  if (trial.getTime() > now.getTime()) {
    return { state: 'trial', allowed: true, until: trial, daysLeft: Math.ceil((trial.getTime() - now.getTime()) / DAY) };
  }
  return { state: 'expired', allowed: false, until: paid ?? trial, daysLeft: 0 };
}

/** Pagamento manual: soma `days` ao que sobrou (ou a partir de hoje, se já venceu). */
export function extendPaidUntil(current: string | null, days: number, now: Date = new Date()): string {
  const base = current && new Date(current).getTime() > now.getTime() ? new Date(current) : now;
  return new Date(base.getTime() + days * DAY).toISOString();
}

/** Prorroga o período de teste. */
export function extendTrial(current: string, days: number, now: Date = new Date()): string {
  const base = new Date(current).getTime() > now.getTime() ? new Date(current) : now;
  return new Date(base.getTime() + days * DAY).toISOString();
}

/**
 * Pagamento automático (Asaas): a mensalidade cobre do vencimento até o mesmo dia do mês seguinte,
 * mais alguns dias de tolerância. Nunca diminui o que a barbearia já tinha.
 */
export function paidUntilFromPayment(dueDate: string, current: string | null, graceDays = 3): string {
  const covered = addDays(addMonths(dueDate, 1), graceDays);
  const candidate = new Date(`${covered}T23:59:59-03:00`);
  if (current && new Date(current).getTime() > candidate.getTime()) return new Date(current).toISOString();
  return candidate.toISOString();
}

/** Primeiro vencimento de uma nova assinatura: o fim do teste (ou hoje, se o teste já acabou). */
export function firstDueDate(trialEndsAt: string, now: Date = new Date()): string {
  const today = todayLocal(now);
  const trialDay = todayLocal(new Date(trialEndsAt));
  return trialDay > today ? trialDay : today;
}

export function planPriceReais(): number {
  const raw = Number(process.env.PLAN_PRICE_BRL ?? '49.9');
  return Number.isFinite(raw) && raw > 0 ? raw : 49.9;
}
