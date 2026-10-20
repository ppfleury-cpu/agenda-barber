'use client';

import { useState } from 'react';

export function CopyButton({ text, label = 'Copiar link' }: { text: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'ok' | 'fail'>('idle');
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState('ok');
    } catch {
      setState('fail');
    }
    setTimeout(() => setState('idle'), 2500);
  }
  return (
    <button type="button" className="btn sm" onClick={copy}>
      {state === 'ok' ? 'Copiado' : state === 'fail' ? 'Selecione e copie' : label}
    </button>
  );
}
