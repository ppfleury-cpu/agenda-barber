import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadManaged } from '@/lib/manage';
import { brl, longDayLabel, todayLocal } from '@/lib/time';
import { maskPhone, waLink } from '@/lib/phone';
import { terms } from '@/lib/themes';
import { ManageFlow } from '@/components/manage-flow';
import { cancelAction, confirmPresenceAction, rescheduleAction, rescheduleAvailabilityAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Meu horário', robots: { index: false, follow: false } };

const STATUS: Record<string, string> = { confirmed: 'Confirmado', done: 'Concluído', noshow: 'Não compareceu', cancelled: 'Cancelado' };

export default async function ManagePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const m = await loadManaged(createAdminClient(), token);
  if (!m) notFound();
  const t = terms(m.shop.niche);
  const today = todayLocal(new Date(), m.shop.timezone);

  return (
    <div className="wrap" data-brand={m.shop.theme} data-niche={m.shop.niche}>
      <header className="top">
        <div className="brand">
          <div className="pole-icon" aria-hidden="true" />
          <div>
            <h1>{m.shop.name}</h1>
            <p>Olá, {m.clientName.split(' ')[0]}! Este é o seu horário.</p>
          </div>
        </div>
      </header>
      <div className="pole" aria-hidden="true" />
      <main className="stack" style={{ paddingBlock: 24, maxWidth: 640 }}>
        <section className="card">
          <div className="row">
            <span className={`pill ${m.status}`}>{STATUS[m.status]}</span>
            {m.presence === 'yes' && m.status === 'confirmed' ? <span className="pill done">Presença confirmada</span> : null}
          </div>
          <h2 style={{ font: '700 30px/1.05 var(--f-display)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {longDayLabel(m.date, today)} às {m.time}
          </h2>
          <p><b>{m.serviceName}</b> com {m.proName} · {m.durationMin} min · {brl(m.priceCents)}</p>
        </section>
        {m.status === 'confirmed' && m.upcoming ? (
          <ManageFlow
            presence={m.presence}
            canChange={m.canChange}
            cancelHours={m.shop.cancel_hours}
            proId={m.proId}
            proName={m.proName}
            confirm={confirmPresenceAction.bind(null, token)}
            cancel={cancelAction.bind(null, token)}
            loadAvailability={rescheduleAvailabilityAction.bind(null, token)}
            reschedule={rescheduleAction.bind(null, token)}
          />
        ) : (
          <p className="hint">
            Este horário não está mais ativo. <Link href={`/${m.shop.slug}`}>Marcar um novo horário</Link>.
          </p>
        )}
        {m.shop.phone ? (
          <p className="hint">
            Dúvidas? Fale com {t.the} {t.place}: <a href={waLink(m.shop.phone, `Olá! Sobre meu horário de ${longDayLabel(m.date, today)} às ${m.time}.`)}>{maskPhone(m.shop.phone)}</a>
          </p>
        ) : null}
      </main>
    </div>
  );
}
