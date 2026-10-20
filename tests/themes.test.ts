import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, THEME_IDS, NICHES, NICHE_IDS, nicheOf, terms, themeOf, themeCss, assetUrl } from '../src/lib/themes';
import { sniffImage } from '../src/lib/image';

// contraste WCAG entre duas cores #rrggbb
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const SURFACE = { light: '#ffffff', dark: '#162131' };
const INK = { light: '#141f2e', dark: '#e7ecf3' };

test('paletas: contraste mínimo 4,5:1 nos textos, nos dois modos', () => {
  for (const t of THEMES) {
    for (const mode of ['light', 'dark'] as const) {
      const m = t[mode];
      const check = (label: string, fg: string, bg: string) => {
        const r = contrast(fg, bg);
        assert.ok(r >= 4.5, `${t.id}/${mode} ${label}: ${r.toFixed(2)} (${fg} sobre ${bg})`);
      };
      check('texto do botão', m.ink, m.accent);
      check('cor de destaque como texto', m.accentText, SURFACE[mode]);
      check('texto dos chips', m.secText, m.secBg);
      check('texto normal em item selecionado', INK[mode], m.selBg);
      for (const k of ['accent', 'ink', 'accentText', 'selBg', 'secText', 'secBg', 'stripe2'] as const) assert.match(m[k], /^#[0-9a-f]{6}$/i, `${t.id} ${k}`);
    }
  }
});

test('paletas e tipos de negócio: consistência', () => {
  assert.equal(new Set(THEME_IDS).size, THEME_IDS.length);
  for (const id of NICHE_IDS) {
    const n = NICHES[id];
    assert.ok(THEME_IDS.includes(n.theme), `${id} usa paleta inexistente`);
    assert.ok(n.services.length >= 4);
    for (const s of n.services) assert.ok(s.min >= 5 && s.min <= 240 && s.cents > 0, s.name);
  }
  assert.equal(nicheOf('xyz').id, 'barbearia');
  assert.equal(themeOf('nope', 'salao').id, 'rose');
  assert.equal(themeOf('onix').id, 'onix');
  assert.deepEqual([terms('barbearia').the, terms('barbearia').of, terms('barbearia').in], ['a', 'da', 'na']);
  assert.deepEqual([terms('salao').the, terms('salao').of, terms('salao').in], ['o', 'do', 'no']);
  assert.equal(terms('manicure').place, 'estúdio');
});

test('css das paletas', () => {
  const css = themeCss();
  for (const id of THEME_IDS) assert.equal(css.split(`[data-brand="${id}"]`).length - 1, 2, id); // claro + escuro
  assert.match(css, /@media \(prefers-color-scheme: dark\)/);
  assert.ok(!/[<>]/.test(css));
});

test('imagens: reconhece pelo conteúdo', () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  const jpg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
  const webp = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  const exe = Uint8Array.from([0x4d, 0x5a, 0x90, 0x00]);
  assert.equal(sniffImage(png), 'png');
  assert.equal(sniffImage(jpg), 'jpeg');
  assert.equal(sniffImage(webp), 'webp');
  assert.equal(sniffImage(svg), null);
  assert.equal(sniffImage(exe), null);
  assert.equal(sniffImage(new Uint8Array()), null);
});

test('assetUrl', () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co';
  assert.equal(assetUrl('s1/logo-1.png'), 'https://abc.supabase.co/storage/v1/object/public/shop-assets/s1/logo-1.png');
  assert.equal(assetUrl(null), null);
});
