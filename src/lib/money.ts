/** "45", "45,5", "45,50", "1.250,00" ou "45.50" -> centavos. Devolve null se não for um valor válido. */
export function parseMoneyToCents(input: string): number | null {
  let s = String(input ?? '').trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const cents = Math.round(Number(s) * 100);
  return Number.isSafeInteger(cents) && cents >= 0 && cents <= 10_000_000 ? cents : null;
}

/** 4500 -> "45,00" (para preencher campos de formulário) */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}
