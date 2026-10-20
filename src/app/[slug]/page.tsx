import { cache } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { accessOf } from '@/lib/billing';
import { PUBLIC_SHOP_COLUMNS, type PublicShop } from '@/lib/types';
import { daysSummary, hourWord, weekdayShort } from '@/lib/time';
import { maskPhone, waLink } from '@/lib/phone';
import { BookingFlow, type FlowPro, type FlowService } from '@/components/booking-flow';
import { assetUrl, terms } from '@/lib/themes';
import { bookAction, getAvailabilityAction } from './actions';

export const dynamic = 'force-dynamic';

const getShop = cache(async (slug: string): Promise<PublicShop | null> => {
  const admin = createAdminClient();
  const { data } = await admin.from('shops').select(PUBLIC_SHOP_COLUMNS).eq('slug', slug.toLowerCase()).maybeSingle();
  return (data as PublicShop | null) ?? null;
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const shop = await getShop(slug);
  return shop ? { title: `${shop.name} · Agendar horário`, description: `Agende seu horário: ${shop.name}.` } : { title: 'Não encontrada' };
}

export default async function PublicShopPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shop = await getShop(slug);
  if (!shop) notFound();

  const t = terms(shop.niche);
  const logo = assetUrl(shop.logo_path);
  const cover = assetUrl(shop.cover_path);
  const header = (
    <>
      <header className="top">
        <div className="brand">
          {logo ? <img className="logo-img" src={logo} alt="" /> : <div className="pole-icon" aria-hidden="true" />}
          <div>
            <h1>{shop.name}</h1>
            <p>{daysSummary(shop.open_days)}, {hourWord(shop.open_time.slice(0, 5))} às {hourWord(shop.close_time.slice(0, 5))}</p>
          </div>
        </div>
        {shop.phone ? <span className="hint">WhatsApp {maskPhone(shop.phone)}</span> : null}
      </header>
      <div className="pole" aria-hidden="true" />
      {cover ? <img className="cover" src={cover} alt="" /> : null}
      {shop.welcome_text ? <p className="welcome">{shop.welcome_text}</p> : null}
    </>
  );

  if (!accessOf(shop).allowed) {
    return (
      <div className="wrap" data-brand={shop.theme} data-niche={shop.niche}>
        {header}
        <main className="unavailable">
          <h2>Agenda indisponível</h2>
          <p>A agenda online {t.of} {t.place} está pausada no momento.</p>
          {shop.phone ? <a className="btn primary" href={waLink(shop.phone, 'Olá! Quero marcar um horário.')}>Chamar no WhatsApp</a> : null}
        </main>
      </div>
    );
  }

  const admin = createAdminClient();
  const [svcRes, proRes] = await Promise.all([
    admin.from('services').select('id, name, duration_min, price_cents').eq('shop_id', shop.id).eq('active', true).order('created_at'),
    admin.from('professionals').select('id, name, work_days').eq('shop_id', shop.id).eq('active', true).order('created_at'),
  ]);
  const services = (svcRes.data ?? []) as FlowService[];
  const pros: FlowPro[] = ((proRes.data ?? []) as { id: string; name: string; work_days: number[] }[]).map((p) => {
    const off = shop.open_days.filter((d) => !p.work_days.includes(d)).map(weekdayShort);
    return { id: p.id, name: p.name, off: off.length ? `Folga: ${off.join(', ')}` : '' };
  });

  return (
    <div className="wrap" data-brand={shop.theme} data-niche={shop.niche}>
      {header}
      <main>
        {services.length && pros.length ? (
          <BookingFlow
            mode="public"
            services={services}
            pros={pros}
            whatsappEnabled={shop.whatsapp_enabled}
            loadAvailability={getAvailabilityAction.bind(null, shop.slug)}
            submit={bookAction.bind(null, shop.slug)}
          />
        ) : (
          <div className="unavailable">
            <h2>Em breve</h2>
            <p>{t.The} {t.place} ainda está montando a agenda online.</p>
          </div>
        )}
      </main>
      <div className="foot">
        <span>Agendamento por Agenda Barber</span>
        <Link href="/privacidade">Privacidade</Link>
      </div>
    </div>
  );
}
