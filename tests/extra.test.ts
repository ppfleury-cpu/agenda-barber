import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMoneyToCents, centsToInput } from '../src/lib/money';
import { slugify, validateSlug } from '../src/lib/slug';
import { decideWebhook } from '../src/lib/asaas-webhook';
import { paidUntilFromPayment } from '../src/lib/billing';

test('money', () => {
  assert.equal(parseMoneyToCents('45'), 4500);
  assert.equal(parseMoneyToCents('45,5'), 4550);
  assert.equal(parseMoneyToCents('45,50'), 4550);
  assert.equal(parseMoneyToCents('R$ 1.250,00'), 125000);
  assert.equal(parseMoneyToCents('45.50'), 4550);
  assert.equal(parseMoneyToCents('0'), 0);
  assert.equal(parseMoneyToCents('abc'), null);
  assert.equal(parseMoneyToCents('-5'), null);
  assert.equal(parseMoneyToCents('4,555'), null);
  assert.equal(parseMoneyToCents(''), null);
  assert.equal(centsToInput(4550), '45,50');
});

test('slug', () => {
  assert.equal(slugify('Barbearia do João!'), 'barbearia-do-joao');
  assert.equal(slugify('  Salão  da  Zé  '), 'salao-da-ze');
  assert.equal(slugify('A'.repeat(60)).length, 40);
  assert.equal(validateSlug('barbearia-do-joao'), null);
  assert.match(validateSlug('ab')!, /pelo menos 3/);
  assert.match(validateSlug('login')!, /não pode ser usado/);
  assert.match(validateSlug('Com Espaço')!, /letras minúsculas/);
  assert.match(validateSlug('-ruim')!, /letras minúsculas/);
});

test('webhook asaas: decisões', () => {
  const paid = decideWebhook({ id: 'evt_1', event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1', subscription: 'sub_1', customer: 'cus_1', dueDate: '2026-11-03' } });
  assert.deepEqual(paid, { action: 'paid', eventKey: 'evt_1', subscriptionId: 'sub_1', customerId: 'cus_1', shopId: undefined, dueDate: '2026-11-03' });
  assert.equal(decideWebhook({ id: 'e', event: 'PAYMENT_CONFIRMED', payment: { subscription: 'sub_1', dueDate: '2026-11-03' } }).action, 'paid');
  for (const ev of ['PAYMENT_CREATED', 'PAYMENT_OVERDUE', 'PAYMENT_UPDATED', 'PAYMENT_DELETED', 'PAYMENT_REFUNDED']) {
    assert.equal(decideWebhook({ id: 'e', event: ev, payment: { subscription: 's', dueDate: '2026-11-03' } }).action, 'ignore', ev);
  }
  assert.equal(decideWebhook({ event: 'PAYMENT_RECEIVED' }).action, 'ignore');
  assert.equal(decideWebhook({ id: 'e', event: 'PAYMENT_RECEIVED', payment: { subscription: 's' } }).action, 'ignore');
  assert.equal(decideWebhook({ id: 'e', event: 'PAYMENT_RECEIVED', payment: { dueDate: '2026-11-03' } }).action, 'ignore');
  // sem id no evento: chave derivada do pagamento
  const noId = decideWebhook({ event: 'PAYMENT_RECEIVED', payment: { id: 'pay_9', subscription: 's', dueDate: '2026-11-03' } });
  assert.equal(noId.action === 'paid' && noId.eventKey, 'PAYMENT_RECEIVED:pay_9');
  // CONFIRMED seguido de RECEIVED do mesmo pagamento resulta no mesmo paid_until
  const a = paidUntilFromPayment('2026-11-03', null);
  assert.equal(paidUntilFromPayment('2026-11-03', a), a);
  // pagar a mensalidade seguinte estende a partir do vencimento, não de "hoje"
  assert.equal(paidUntilFromPayment('2026-12-03', a), '2027-01-07T02:59:59.000Z');
});
