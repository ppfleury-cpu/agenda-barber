import type { Metadata } from 'next';
import Link from 'next/link';
import { ForgotForm } from '../auth/forms';

export const metadata: Metadata = { title: 'Esqueci a senha' };

export default function ForgotPage() {
  return (
    <div className="wrap">
      <main className="auth">
        <h1>Esqueci a senha</h1>
        <ForgotForm />
        <p className="hint"><Link href="/login">Voltar para entrar</Link></p>
      </main>
    </div>
  );
}
