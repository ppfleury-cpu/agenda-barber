// Endereço público da barbearia: agendabarber.com.br/barbearia-do-joao

export const RESERVED_SLUGS = new Set([
  'login', 'cadastro', 'painel', 'admin', 'api', 'onboarding', 'auth', 'redefinir-senha', 'esqueci-senha',
  'privacidade', 'termos', 'sobre', 'precos', 'contato', 'suporte', 'app', 'static', 'public', 'favicon',
  'robots', 'sitemap', 'www', 'agenda', 'barbearia', 'salao', 'teste',
]);

/** "Barbearia do João!" -> "barbearia-do-joao" */
export function slugify(input: string): string {
  return String(input ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

export function validateSlug(slug: string): string | null {
  if (slug.length < 3) return 'O endereço precisa ter pelo menos 3 letras.';
  if (slug.length > 40) return 'O endereço pode ter no máximo 40 caracteres.';
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return 'Use só letras minúsculas, números e hífen.';
  if (RESERVED_SLUGS.has(slug)) return 'Esse endereço não pode ser usado. Escolha outro.';
  return null;
}
