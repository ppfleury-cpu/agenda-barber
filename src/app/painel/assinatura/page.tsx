import type { Metadata } from 'next';
import { requireShop } from '@/lib/auth';
import { asaasConfigured, listSubscriptionPayments, type AsaasPayment } from '@/lib/asaas';
import { planPriceReais } from '@/lib/billing';
import { dayMonth, dateOf } from '@/lib/time';
import { waLink } from '@/lib/phone';
import { CopyButton } from '@/components/copy-button';
import { cancelSubscriptionAction, startSubscription } from '../actions';

export const metadata: Metadata = { title: 'Assinatura' };

const STATE_TEXT = {
  trial: 'Período de teste',
  active: 'Assinatura em dia',
  expired: 'Teste ou pagamento vencido',
  suspended: 'Conta suspensa',
} as const;

const PAY_STATUS: Record<string, string> = {
  PENDING: 'Aguardando pagamento',
  OVERDUE: 'Vencida',
  RECEIVED: 'Paga',
  CONFIRMED: 'Paga',
  RECEIVED_IN_CASH: 'Paga',
};

export default async function SubscriptionPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { shop, access } = await requireShop();
  const sp = await searchParams;
  const price = planPriceReais();
  const priceText = price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const auto = asaasConfigured();

  let payments: AsaasPayment[] = [];
  if (auto && shop.asaas_subscription_id) {
    payments = await listSubscriptionPayments(shop.asaas_subscription_id).catch(() => []);
  }
  const open = payments.find((p) => p.invoiceUrl && ['PENDING', 'OVERDUE'].includes(p.status));

  const pixKey = process.env.PIX_KEY;
  const pixName = process.env.PIX_RECEIVER_NAME;
  const support = process.env.SUPPORT_WHATSAPP?.replace(/\D/g, '');
  const supportEmail = process.env.SUPPORT_EMAIL;
  const proof = `Olá! Paguei a mensalidade do Agenda Barber. Barbearia: ${shop.name}. E-mail do cadastro: ${shop.owner_email}.`;

  const untilText = access.until ? `${dayMonth(dateOf(access.until))}/${dateOf(access.until).slice(0, 4)}` : '';

  return (
    <>
      {sp.ok ? <p className="flash ok" role="status">{sp.ok}</p> : null}
      {sp.err ? <p className="flash bad" role="alert">{sp.err}</p> : null}

      <section className="card">
        <h3>Sua situação</h3>
        <div className="row">
          <span className={`pill ${access.allowed ? (access.state === 'trial' ? 'warn' : 'ok') : 'bad'}`}>{STATE_TEXT[access.state]}</span>
          {access.allowed && untilText ? (
            <span>
              {access.state === 'trial' ? 'Teste grátis até' : 'Pago até'} <b>{untilText}</b> ({access.daysLeft} {access.daysLeft === 1 ? 'dia' : 'dias'})
            </span>
          ) : null}
        </div>
        {!access.allowed ? (
          <p>Sua página de agendamento está pausada para os clientes. Regularize abaixo e ela volta ao ar.</p>
        ) : null}
        <p className="hint">Plano único: <b>{priceText}</b> por mês, com agenda, equipe, clientes e lembretes no WhatsApp.</p>
      </section>

      {auto ? (
        <section className="card">
          <h3>Pagamento automático</h3>
          {shop.asaas_subscription_id ? (
            <>
              <p>Sua assinatura mensal está ativa. A cobrança chega por e-mail todo mês e você paga por Pix, boleto ou cartão.</p>
              {open?.invoiceUrl ? (
                <div className="row">
                  <span>Fatura de {dayMonth(open.dueDate)} · {PAY_STATUS[open.status] ?? open.status}</span>
                  <a className="btn primary sm" href={open.invoiceUrl} target="_blank" rel="noopener">Pagar agora</a>
                </div>
              ) : <p className="hint">Nenhuma fatura em aberto.</p>}
              <form action={cancelSubscriptionAction}><button className="btn sm danger">Cancelar assinatura automática</button></form>
            </>
          ) : (
            <form action={startSubscription} className="stack" style={{ gap: 14 }}>
              <p>
                Assine e a cobrança de {priceText} chega todo mês por e-mail. Você escolhe Pix, boleto ou cartão.
                {access.state === 'trial' ? ' A primeira cobrança vence só no fim do teste grátis.' : ''}
              </p>
              <div className="field" style={{ maxWidth: 320 }}>
                <label htmlFor="cpf">CPF ou CNPJ de quem paga</label>
                <input id="cpf" name="cpf" inputMode="numeric" placeholder="Somente números" required />
              </div>
              <div><button className="btn primary">Assinar</button></div>
            </form>
          )}
        </section>
      ) : null}

      <section className="card">
        <h3>Pagar por Pix (manual)</h3>
        {pixKey ? (
          <>
            <p>Faça um Pix de <b>{priceText}</b> para a chave abaixo e envie o comprovante. Liberamos em até 1 dia útil.</p>
            <div className="linkbox"><code>{pixKey}</code><CopyButton text={pixKey} label="Copiar chave" /></div>
            {pixName ? <p className="note">Favorecido: {pixName}</p> : null}
            {support ? <div><a className="btn sm" target="_blank" rel="noopener" href={waLink(support, proof)}>Enviar comprovante no WhatsApp</a></div> : null}
            {!support && supportEmail ? <p className="note">Envie o comprovante para {supportEmail} informando o e-mail do cadastro ({shop.owner_email}).</p> : null}
          </>
        ) : (
          <p className="hint">
            Para pagar por Pix, fale com o suporte{support ? '' : supportEmail ? ` pelo e-mail ${supportEmail}` : ''}.
            {support ? <> <a target="_blank" rel="noopener" href={waLink(support, proof)}>Chamar no WhatsApp</a>.</> : null}
          </p>
        )}
      </section>
    </>
  );
}
