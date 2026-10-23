'use client';

/** Abre a janela de impressão do navegador (dá para escolher "Salvar como PDF"). */
export function PrintButton() {
  return <button type="button" className="btn sm" onClick={() => window.print()}>Imprimir ou salvar PDF</button>;
}
