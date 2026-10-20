import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="wrap">
      <header className="top">
        <div className="brand">
          <div className="pole-icon" aria-hidden="true" />
          <div>
            <span className="t">Administração</span>
            <p>Barbearias, testes e pagamentos</p>
          </div>
        </div>
      </header>
      <div className="pole" aria-hidden="true" />
      <main className="panel">{children}</main>
    </div>
  );
}
