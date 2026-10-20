// Telefones brasileiros. Guardamos só os dígitos, com DDD (10 ou 11 dígitos).

/** Devolve só os dígitos com DDD, ou null se não parecer um telefone brasileiro válido. */
export function normalizePhone(input: string): string | null {
  let d = String(input ?? '').replace(/\D/g, '');
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  const ddd = Number(d.slice(0, 2));
  if (ddd < 11 || ddd > 99 || d[0] === '0') return null;
  if (d.length === 11 && d[2] !== '9') return null; // celular tem 9 na frente
  return d;
}

/** Formata enquanto a pessoa digita: (62) 91234-5678 */
export function maskPhone(input: string): string {
  const d = String(input ?? '').replace(/\D/g, '').slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Número no formato internacional usado pelo WhatsApp: 5562912345678 */
export function toWhatsappNumber(digits: string): string {
  return digits.startsWith('55') && digits.length >= 12 ? digits : `55${digits}`;
}

/** Link wa.me com mensagem pronta (usado como alternativa manual no painel). */
export function waLink(digits: string, message: string): string {
  return `https://wa.me/${toWhatsappNumber(digits)}?text=${encodeURIComponent(message)}`;
}

export function firstName(name: string): string {
  return String(name ?? '').trim().split(/\s+/)[0] ?? '';
}
