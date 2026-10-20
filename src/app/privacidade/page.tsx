import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Privacidade' };

// MODELO: leia, ajuste com os dados da sua empresa e, de preferência, peça a revisão de um advogado.
export default function PrivacyPage() {
  return (
    <div className="wrap">
      <main className="auth" style={{ maxWidth: 680 }}>
        <Link href="/" className="brand"><div className="pole-icon" aria-hidden="true" /><span className="t">Agenda Barber</span></Link>
        <h1>Política de privacidade</h1>
        <p className="note">Modelo inicial. Substitua os dados entre colchetes e revise antes de divulgar.</p>
        <div className="stack" style={{ gap: 14 }}>
          <p><b>Quem somos.</b> O Agenda Barber é um serviço de agendamento online operado por [nome da sua empresa ou seu nome], CNPJ/CPF [número], contato: [e-mail de contato].</p>
          <p><b>Papéis.</b> Para os clientes finais que marcam horário, a barbearia escolhida é a responsável pelos dados (controladora) e o Agenda Barber os trata em nome dela (operador). Para os donos de barbearia que criam conta, o Agenda Barber é o responsável.</p>
          <p><b>Dados coletados.</b> De quem agenda: nome, telefone (WhatsApp) e os horários marcados. De quem cria conta: e-mail, nome do negócio e dados de cobrança.</p>
          <p><b>Para que usamos.</b> Para registrar o agendamento, enviar a confirmação e o lembrete pelo WhatsApp (quando a pessoa autoriza), e para a barbearia acompanhar seu atendimento. Não vendemos dados.</p>
          <p><b>Com quem compartilhamos.</b> Provedores que fazem o serviço funcionar: hospedagem e banco de dados (Supabase e Vercel), envio de mensagens (Meta/WhatsApp) e cobrança (Asaas).</p>
          <p><b>Seus direitos.</b> Você pode pedir acesso, correção ou exclusão dos seus dados, e deixar de receber mensagens, falando com a barbearia ou com [e-mail de contato].</p>
          <p><b>Segurança.</b> Os dados ficam em banco de dados com controle de acesso por barbearia e conexão criptografada.</p>
        </div>
      </main>
    </div>
  );
}
