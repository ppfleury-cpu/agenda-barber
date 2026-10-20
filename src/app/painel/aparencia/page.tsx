import type { Metadata } from 'next';
import { requireShop } from '@/lib/auth';
import { NICHES, NICHE_IDS, THEMES, assetUrl, terms } from '@/lib/themes';
import { removeImage, saveAppearance, uploadImage } from '../actions';

export const metadata: Metadata = { title: 'Aparência' };

export default async function AppearancePage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { shop } = await requireShop();
  const sp = await searchParams;
  const t = terms(shop.niche);
  const logo = assetUrl(shop.logo_path);
  const cover = assetUrl(shop.cover_path);

  return (
    <>
      {sp.ok ? <p className="flash ok" role="status">{sp.ok}</p> : null}
      {sp.err ? <p className="flash bad" role="alert">{sp.err}</p> : null}

      <form action={saveAppearance} className="card stack" style={{ gap: 16 }}>
        <h3>Cores e textos</h3>
        <p className="hint">É assim que seus clientes veem a página de agendamento. Clique em "Ver página de agendamento" no topo para conferir depois de salvar.</p>
        <div>
          <span className="lbl">Tipo de negócio</span>
          <div className="chips" role="radiogroup" aria-label="Tipo de negócio">
            {NICHE_IDS.map((id) => (
              <label className="chip" key={id}>
                <input type="radio" name="niche" value={id} defaultChecked={shop.niche === id} />
                <span>{NICHES[id].label}</span>
              </label>
            ))}
          </div>
          <span className="note">Muda o desenho do topo e as palavras da página. Seus serviços não mudam.</span>
        </div>
        <div>
          <span className="lbl">Cor da página</span>
          <div className="swatches" role="radiogroup" aria-label="Cor da página">
            {THEMES.map((th) => (
              <label className="swatch" key={th.id}>
                <input type="radio" name="theme" value={th.id} defaultChecked={shop.theme === th.id} />
                <span>
                  <span className="dots" aria-hidden="true">
                    <i style={{ background: th.light.accent }} />
                    <i style={{ background: th.light.stripe2 }} />
                  </span>
                  {th.name}
                </span>
              </label>
            ))}
          </div>
        </div>
        <div className="field">
          <label htmlFor="welcome">Texto de boas-vindas (opcional)</label>
          <textarea id="welcome" name="welcome" rows={3} maxLength={200} defaultValue={shop.welcome_text ?? ''} placeholder={`Ex.: Bem-vindo ${t.in} ${shop.name}! Atendemos com hora marcada.`} />
          <span className="note">Aparece no topo da página, até 200 letras.</span>
        </div>
        <div><button className="btn primary">Salvar aparência</button></div>
      </form>

      <section className="card stack" style={{ gap: 16 }}>
        <h3>Logo</h3>
        <div className="asset-row">
          {logo ? <img className="logo-img" src={logo} alt="Logo atual" /> : <span className="hint">Nenhuma logo enviada.</span>}
          <form action={uploadImage} className="row" encType="multipart/form-data">
            <input type="hidden" name="kind" value="logo" />
            <input type="file" name="file" accept="image/png,image/jpeg,image/webp" required aria-label="Escolher logo" />
            <button className="btn sm">Enviar logo</button>
          </form>
          {logo ? (
            <form action={removeImage}><input type="hidden" name="kind" value="logo" /><button className="btn sm">Remover</button></form>
          ) : null}
        </div>
        <p className="note">PNG, JPG ou WebP, até 1 MB. Quadrada fica melhor.</p>
      </section>

      <section className="card stack" style={{ gap: 16 }}>
        <h3>Foto de capa</h3>
        {cover ? <img className="cover" style={{ marginTop: 0 }} src={cover} alt="Capa atual" /> : <span className="hint">Nenhuma capa enviada.</span>}
        <div className="asset-row">
          <form action={uploadImage} className="row" encType="multipart/form-data">
            <input type="hidden" name="kind" value="cover" />
            <input type="file" name="file" accept="image/png,image/jpeg,image/webp" required aria-label="Escolher capa" />
            <button className="btn sm">Enviar capa</button>
          </form>
          {cover ? (
            <form action={removeImage}><input type="hidden" name="kind" value="cover" /><button className="btn sm">Remover</button></form>
          ) : null}
        </div>
        <p className="note">PNG, JPG ou WebP, até 2 MB. Imagem larga (paisagem) fica melhor.</p>
      </section>
    </>
  );
}
