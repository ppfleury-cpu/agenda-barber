import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Cliente com a chave de SERVIÇO: ignora as regras de acesso. Só pode ser usado no servidor,
 * sempre depois de conferir manualmente quem está pedindo e a que barbearia o pedido se refere.
 * Nunca importe este arquivo em componentes de navegador.
 */
export function createAdminClient(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
