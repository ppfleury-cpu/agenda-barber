import type { Metadata } from 'next';
import Link from 'next/link';
import { requireActiveShop } from '@/lib/auth';
import { hourWord, isValidDate, isValidTime, todayLocal, weekdayShort } from '@/lib/time';
import { BookingFlow, type FlowPro, type FlowService } from '@/components/booking-flow';
import { ownerAvailabilityAction, ownerBookAction } from '../actions';

export const metadata: Metadata = { title: 'Novo agendamento' };

export default async function NewBookingPage({ searchParams }: { searchParams: Promise<{ d?: string; pro?: string; t?: string }> }) {
  const { supabase, shop } = await requireActiveShop();
  const sp = await searchParams;
  const [svcRes, proRes] = await Promise.all([
    supabase.from('services').select('id, name, duration_min, price_cents').eq('active', true).order('created_at'),
    supabase.from('professionals').select('id, name, work_days, start_time, end_time, service_ids').eq('active', true).order('created_at'),
  ]);
  const services = (svcRes.data ?? []) as FlowService[];
  type P = { id: string; name: string; work_days: number[]; start_time: string | null; end_time: string | null; service_ids: string[] | null };
  const pros: FlowPro[] = ((proRes.data ?? []) as P[]).map((p) => {
    const off = shop.open_days.filter((d) => !p.work_days.includes(d)).map(weekdayShort);
    const hours = p.start_time || p.end_time
      ? `${hourWord((p.start_time ?? shop.open_time).slice(0, 5))} às ${hourWord((p.end_time ?? shop.close_time).slice(0, 5))}`
      : '';
    return { id: p.id, name: p.name, off: [off.length ? `Folga: ${off.join(', ')}` : '', hours].filter(Boolean).join(' · '), serviceIds: p.service_ids };
  });
  const initialDate = sp.d && isValidDate(sp.d) && sp.d >= todayLocal(new Date(), shop.timezone) ? sp.d : undefined;
  const initialPro = sp.pro && pros.some((p) => p.id === sp.pro) ? sp.pro : undefined;
  const initialTime = sp.t && isValidTime(sp.t) ? sp.t : undefined;

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
          initialPro={initialPro}
          initialTime={initialTime}
          loadAvailability={ownerAvailabilityAction}
          submit={ownerBookAction}
        />
      ) : (
        <p className="flash warn">Cadastre pelo menos um serviço e um profissional ativos para agendar.</p>
      )}
    </>
  );
}
