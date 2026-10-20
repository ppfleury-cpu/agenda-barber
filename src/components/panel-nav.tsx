'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/painel', label: 'Agenda', exact: true },
  { href: '/painel/servicos', label: 'Serviços' },
  { href: '/painel/equipe', label: 'Equipe' },
  { href: '/painel/clientes', label: 'Clientes' },
  { href: '/painel/aparencia', label: 'Aparência' },
  { href: '/painel/configuracoes', label: 'Configurações' },
  { href: '/painel/assinatura', label: 'Assinatura' },
];

export function PanelNav({ admin }: { admin: boolean }) {
  const path = usePathname();
  const items = admin ? [...ITEMS, { href: '/admin', label: 'Admin' }] : ITEMS;
  return (
    <nav className="nav" aria-label="Seções do painel">
      {items.map((i) => {
        const active = 'exact' in i && i.exact ? path === i.href || path === '/painel/novo' : path.startsWith(i.href);
        return (
          <Link key={i.href} href={i.href} aria-current={active ? 'page' : undefined}>{i.label}</Link>
        );
      })}
    </nav>
  );
}
