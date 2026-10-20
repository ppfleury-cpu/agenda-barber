import type { Metadata } from 'next';
import Link from 'next/link';
import { LoginForm } from '../auth/forms';

export const metadata: Metadata = { title: 'Entrar' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; erro?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="wrap">
      <main className="auth">
        <Link href="/" className="brand"><div className="pole-icon" aria-hidden="true" /><span className="t">Agenda Barber</span></Link>
        <h1>Entrar</h1>
        <LoginForm next={sp.next} linkError={sp.erro === 'link'} />
        <p className="hint">Ainda não tem conta? <Link href="/cadastro">Teste grátis por 14 dias</Link>.</p>
      </main>
    </div>
  );
}
