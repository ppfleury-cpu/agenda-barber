import type { Metadata } from 'next';
import Link from 'next/link';
import { SignupForm } from '../auth/forms';

export const metadata: Metadata = { title: 'Criar conta' };

export default function SignupPage() {
  return (
    <div className="wrap">
      <main className="auth">
        <Link href="/" className="brand"><div className="pole-icon" aria-hidden="true" /><span className="t">Agenda Barber</span></Link>
        <h1>Criar minha agenda</h1>
        <p className="hint">14 dias grátis, sem cartão. Primeiro a conta, depois os dados da sua barbearia.</p>
        <SignupForm />
        <p className="hint">Já tem conta? <Link href="/login">Entrar</Link>.</p>
      </main>
    </div>
  );
}
