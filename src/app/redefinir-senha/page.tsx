import type { Metadata } from 'next';
import { ResetForm } from '../auth/forms';

export const metadata: Metadata = { title: 'Nova senha' };

export default function ResetPage() {
  return (
    <div className="wrap">
      <main className="auth">
        <h1>Nova senha</h1>
        <ResetForm />
      </main>
    </div>
  );
}
