import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Conta uma tentativa para `key` e diz se ainda está dentro do limite (`max` por `windowSec` segundos).
 * A contagem fica no banco (função hit_rate_limit), então vale para todos os servidores da Vercel.
 * Se a função não existir (schema antigo), deixa passar e avisa no log, para não derrubar a agenda.
 */
export async function withinLimit(admin: SupabaseClient, key: string, windowSec: number, max: number): Promise<boolean> {
  const { data, error } = await admin.rpc('hit_rate_limit', { p_key: key, p_window_seconds: windowSec, p_max: max });
  if (error) {
    console.error('rate limit indisponível:', error.message);
    return true;
  }
  return data !== false;
}

export const LIMITS = {
  availability: { windowSec: 300, max: 150 },
  code: { windowSec: 3600, max: 6 },
  booking: { windowSec: 3600, max: 12 },
  waitlist: { windowSec: 3600, max: 10 },
  manage: { windowSec: 300, max: 60 },
} as const;
