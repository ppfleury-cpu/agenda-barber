'use client';

import { useActionState, useState } from 'react';
import { createShop, type OnboardingState } from './actions';
import { maskPhone } from '@/lib/phone';
import { slugify } from '@/lib/slug';
import { NICHES, NICHE_IDS, terms, type NicheId } from '@/lib/themes';

export function OnboardingForm({ host }: { host: string }) {
  const [state, action, pending] = useActionState(createShop, null as OnboardingState);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [phone, setPhone] = useState('');
  const [niche, setNiche] = useState<NicheId>('barbearia');
  const t = terms(niche);

  return (
    <form action={action} className="card">
      <div>
        <span className="lbl">Que tipo de negócio é o seu?</span>
        <div className="chips" role="radiogroup" aria-label="Tipo de negócio">
          {NICHE_IDS.map((id) => (
            <label className="chip" key={id}>
              <input type="radio" name="niche" value={id} checked={niche === id} onChange={() => setNiche(id)} />
              <span>{NICHES[id].label}</span>
            </label>
          ))}
        </div>
        <span className="note">Isso só escolhe os textos e os serviços de exemplo. Você muda tudo depois.</span>
      </div>
      <div className="field">
        <label htmlFor="name">Nome {t.of} {t.place}</label>
        <input
          id="name" name="name" required maxLength={80} placeholder={NICHES[niche].example} value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!slugTouched) setSlug(slugify(e.target.value));
          }}
        />
      </div>
      <div className="field">
        <label htmlFor="slug">Endereço do seu link</label>
        <input
          id="slug" name="slug" required maxLength={40} value={slug} autoCapitalize="none" spellCheck={false}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(slugify(e.target.value));
          }}
        />
        <span className="note">Seus clientes vão agendar em {host}/{slug || 'seu-negocio'}</span>
      </div>
      <div className="field">
        <label htmlFor="phone">WhatsApp {t.of} {t.place} (opcional)</label>
        <input
          id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="(62) 91234-5678" value={phone}
          onChange={(e) => setPhone(maskPhone(e.target.value))}
        />
        <span className="note">Aparece na página de agendamento para o cliente falar com você.</span>
      </div>
      {state?.error ? <p className="flash bad" role="alert">{state.error}</p> : null}
      <button className="btn primary" disabled={pending}>{pending ? 'Criando...' : 'Criar minha agenda'}</button>
    </form>
  );
}
