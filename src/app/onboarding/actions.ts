'use server';

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizePhone } from '@/lib/phone';
import { slugify, validateSlug } from '@/lib/slug';
import { nicheOf, terms } from '@/lib/themes';

export type OnboardingState = { error?: string } | null;

export async function createShop(_prev: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const { user } = await requireUser();
  const admin = createAdminClient();

  const { data: existing } = await admin.from('shops').select('id').eq('owner_id', user.id).maybeSingle();
  if (existing) redirect('/painel');

  const nicheRaw = String(formData.get('niche') ?? '');
  const niche = nicheOf(nicheRaw);
  const t = terms(niche.id);
  const name = String(formData.get('name') ?? '').trim().replace(/\s+/g, ' ');
  const slug = slugify(String(formData.get('slug') ?? ''));
  const phoneRaw = String(formData.get('phone') ?? '').trim();
  if (name.length < 2 || name.length > 80) return { error: `Digite o nome ${t.of} ${t.place}.` };
  const slugError = validateSlug(slug);
  if (slugError) return { error: slugError };
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  if (phoneRaw && !phone) return { error: 'Digite um WhatsApp válido com DDD, por exemplo (62) 91234-5678.' };

  const { data: shop, error } = await admin
    .from('shops')
    .insert({ owner_id: user.id, owner_email: user.email ?? '', slug, name, phone, niche: niche.id, theme: niche.theme })
    .select('id')
    .single();
  if (error || !shop) {
    if (error?.code === '23505') {
      if (/owner_id/.test(error.message)) redirect('/painel');
      return { error: 'Esse endereço já está em uso por outro negócio. Escolha outro.' };
    }
    return { error: 'Não foi possível criar sua agenda. Tente de novo.' };
  }

  // Exemplos para o painel não começar vazio. O dono edita ou apaga depois.
  await admin.from('services').insert(
    niche.services.map((x) => ({ shop_id: shop.id, name: x.name, duration_min: x.min, price_cents: x.cents })),
  );
  await admin.from('professionals').insert({ shop_id: shop.id, name: niche.proFirst });

  redirect('/painel?novo=1');
}
