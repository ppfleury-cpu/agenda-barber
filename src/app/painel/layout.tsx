import Link from 'next/link';
import { requireShop, isAdminEmail } from '@/lib/auth';
import { assetUrl } from '@/lib/themes';
import { PanelNav } from '@/components/panel-nav';

export const dynamic = 'force-dynamic';

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const { shop, user, access } = await requireShop();
  return (
    <div className="wrap" data-brand={shop.theme} data-niche={shop.niche}>
      <header className="top">
        <div className="brand">
          {shop.logo_path ? <img className="logo-img" src={assetUrl(shop.logo_path) ?? ""} alt="" /> : <div className="pole-icon" aria-hidden="true" />}
          <div>
            <span className="t">{shop.name}</span>
            <p>{user.email}</p>
          </div>
        </div>
        <div className="row">
          <Link className="btn sm" href={`/${shop.slug}`} target="_blank">Ver página de agendamento</Link>
          <form action="/auth/signout" method="post"><button className="btn sm">Sair</button></form>
        </div>
      </header>
      <div className="pole" aria-hidden="true" />
      {access.state === 'trial' ? (
        <p className="flash warn" style={{ marginTop: 14 }}>
          Período de teste: {access.daysLeft} {access.daysLeft === 1 ? 'dia restante' : 'dias restantes'}. <Link href="/painel/assinatura">Ver assinatura</Link>
        </p>
      ) : null}
      {!access.allowed ? (
        <p className="flash bad" style={{ marginTop: 14 }}>
          {access.state === 'suspended' ? 'Sua conta está suspensa.' : 'Seu período de teste ou pagamento terminou.'} Sua página de agendamento está pausada.{' '}
          <Link href="/painel/assinatura">Regularizar assinatura</Link>
        </p>
      ) : null}
      <PanelNav admin={isAdminEmail(user.email)} />
      <main className="panel">{children}</main>
    </div>
  );
}
