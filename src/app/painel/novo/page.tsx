import type { Metadata } from 'next';
import Link from 'next/link';
import { requireActiveShop } from '@/lib/auth';
import { isValidDate, todayLocal, weekdayShort } from '@/lib/time';
import { BookingFlow, type FlowPro, type FlowService } from '@/components/booking-flow';
import { ownerAvailabilityAction, ownerBookAction } from '../actions';

export const metadata: Metadata = { title: 'Novo agendamento' };

export default async function NewBookingPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const { supabase, shop } = await requireActiveShop();
  const sp = await searchParams;
  const [svcRes, proRes] = await Promise.all([
    supabase.from('services').select('id, name, duration_min, price_cents').eq('active', true).order('created_at'),
    supabase.from('professionals').select('id, name, work_days').eq('active', true).order('created_at'),
  ]);
  const services = (svcRes.data ?? []) as FlowService[];
  const pros: FlowPro[] = ((proRes.data ?? []) as { id: string; name: string; work_days: number[] }[]).map((p) => {
    const off = shop.open_days.filter((d) => !p.work_days.includes(d)).map(weekdayShort);
    return { id: p.id, name: p.name, off: off.length ? `Folga: ${off.join(', ')}` : '' };
  });
  const initialDate = sp.d && isValidDate(sp.d) && sp.d >= todayLocal() ? sp.d : undefined;

  return (
    <>
      <div className="row"><Link className="btn sm" href="/painel">← Voltar para a agenda</Link></div>
      <h2 style={{ font: '700 26px var(--f-display)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Novo agendamento</h2>
      <p className="hint">Para cliente que ligou ou chegou no balcão. Ele recebe a confirmação no WhatsApp, como no agendamento online.</p>
      {services.length && pros.length ? (
        <BookingFlow
          mode="owner"
          services={services}
          pros={pros}
          whatsappEnabled={shop.whatsapp_enabled}
          initialDate={initialDate}
          loadAvailability={ownerAvailabilityAction}
          submit={ownerBookAction}
        />
      ) : (
        <p className="flash warn">Cadastre pelo menos um serviço e um profissional ativos para agendar.</p>
      )}
    </>
  );
}
