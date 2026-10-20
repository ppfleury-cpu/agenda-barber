import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getOrigin, requireUser } from '@/lib/auth';
import { OnboardingForm } from './form';

export const metadata: Metadata = { title: 'Seu negócio' };

export default async function OnboardingPage() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from('shops').select('id').eq('owner_id', user.id).maybeSingle();
  if (data) redirect('/painel');
  const origin = await getOrigin();
  return (
    <div className="wrap">
      <main className="auth">
        <h1>Dados do seu negócio</h1>
        <p className="hint">Dois minutos. Você ajusta serviços, equipe e horários depois, dentro do painel.</p>
        <OnboardingForm host={origin.replace(/^https?:\/\//, '')} />
      </main>
    </div>
  );
}
