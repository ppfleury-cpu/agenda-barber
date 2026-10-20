'use client';

import { useRouter } from 'next/navigation';
import { fromMin } from '@/lib/time';

/** Coluna de um profissional na grade da agenda. Clicar num espaço vazio abre o "novo agendamento" já preenchido. */
export function AgendaColumn(props: {
  date: string; proId: string; openMin: number; step: number; px: number; height: number; off: boolean; children: React.ReactNode;
}) {
  const router = useRouter();
  const { date, proId, openMin, step, px, height, off, children } = props;
  return (
    <div
      className={`tl-col${off ? ' off' : ''}`}
      style={{ height }}
      title={off ? undefined : 'Clique num espaço vazio para encaixar um cliente'}
      onClick={(e) => {
        if (off || e.target !== e.currentTarget) return;
        const r = e.currentTarget.getBoundingClientRect();
        const m = openMin + Math.floor((e.clientY - r.top) / px / step) * step;
        router.push(`/painel/novo?d=${date}&pro=${proId}&t=${fromMin(m)}`);
      }}
    >
      {children}
    </div>
  );
}
