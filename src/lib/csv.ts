// Planilhas CSV que abrem direto no Excel e no Google Planilhas em português:
// separador ";", vírgula nos centavos e BOM no começo (para os acentos aparecerem certos).

export type Cell = string | number | null | undefined;

const quote = (v: Cell) => {
  const s = v === null || v === undefined ? '' : String(v);
  // aspas em volta quando precisa; e um apóstrofo antes de =, +, -, @ para a planilha não executar fórmula
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(,\d+)?$/.test(s) ? `'${s}` : s;
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function toCsv(rows: Cell[][]): string {
  return '﻿' + rows.map((r) => r.map(quote).join(';')).join('\r\n') + '\r\n';
}

/** 4550 -> "45,50" (número que a planilha entende como valor) */
export const moneyCell = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');

/** 2026-10-23 -> 23/10/2026 */
export const dateCell = (date: string) => date.split('-').reverse().join('/');
