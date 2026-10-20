import Link from 'next/link';
import { planPriceReais } from '@/lib/billing';

export default function Home() {
  const price = planPriceReais().toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <div className="wrap">
      <header className="top">
        <div className="brand">
          <div className="pole-icon" aria-hidden="true" />
          <span className="t">Agenda Barber</span>
        </div>
        <div className="row">
          <Link className="btn" href="/login">Entrar</Link>
          <Link className="btn primary" href="/cadastro">Testar grátis</Link>
        </div>
      </header>
      <div className="pole" aria-hidden="true" />

      <section className="hero">
        <h1>Agenda cheia, sem caderno e sem mensagem solta</h1>
        <p>
          Seus clientes escolhem o horário num link seu. Eles recebem a confirmação e o lembrete no WhatsApp, e você
          acompanha tudo no celular.
        </p>
        <div className="row">
          <Link className="btn primary" href="/cadastro">Criar minha agenda</Link>
          <span className="hint">14 dias grátis, sem cartão.</span>
        </div>
      </section>

      <section className="features" aria-label="Recursos">
        <div className="card">
          <h3>Link de agendamento</h3>
          <p>Um endereço só seu para colocar no Instagram e no WhatsApp. O cliente agenda sem baixar nada.</p>
        </div>
        <div className="card">
          <h3>Confirmação e lembrete</h3>
          <p>O cliente recebe a confirmação na hora e um lembrete 30 minutos antes. Menos falta, menos horário vazio.</p>
        </div>
        <div className="card">
          <h3>Equipe e serviços</h3>
          <p>Cada profissional com a própria agenda, folgas e serviços com duração e preço. Sem horário duplo.</p>
        </div>
        <div className="card">
          <h3>Clientes e fidelidade</h3>
          <p>Histórico de visitas, faltas e o brinde do cliente fiel, como o 10º corte grátis.</p>
        </div>
      </section>

      <section className="card" style={{ marginBlock: 8 }}>
        <h3>Um plano, tudo incluso</h3>
        <div className="price">
          <b>R$ {price}</b>
          <span className="hint">por mês, por barbearia. Cancele quando quiser.</span>
        </div>
      </section>

      <div className="foot">
        <span>Agenda Barber</span>
        <Link href="/privacidade">Privacidade</Link>
      </div>
    </div>
  );
}
