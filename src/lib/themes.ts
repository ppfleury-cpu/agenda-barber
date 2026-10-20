// Aparência de cada negócio: tipo de negócio (textos e serviços de exemplo) e paleta de cores.
// As paletas são prontas e testadas para ter bom contraste (veja tests/themes.test.ts).
// Para criar uma paleta nova, copie um bloco abaixo, troque o id e as cores, e rode `npm test`.

export type NicheId = 'barbearia' | 'salao' | 'manicure';

export type Niche = {
  id: NicheId;
  label: string; // nome na lista de escolha
  place: string; // como chamamos o negócio nos textos
  feminine: boolean; // "a barbearia" ou "o salão"
  pro: string; // título da etapa de escolher o profissional
  proFirst: string; // nome do primeiro profissional criado
  theme: string; // paleta inicial
  example: string; // exemplo de nome
  services: { name: string; min: number; cents: number }[];
};

export const NICHES: Record<NicheId, Niche> = {
  barbearia: {
    id: 'barbearia', label: 'Barbearia', place: 'barbearia', feminine: true, pro: 'Barbeiro', proFirst: 'Barbeiro 1',
    theme: 'classico', example: 'Barbearia do João',
    services: [
      { name: 'Corte masculino', min: 30, cents: 4500 },
      { name: 'Barba', min: 30, cents: 3500 },
      { name: 'Corte + barba', min: 60, cents: 7000 },
      { name: 'Sobrancelha', min: 15, cents: 1500 },
    ],
  },
  salao: {
    id: 'salao', label: 'Salão de beleza', place: 'salão', feminine: false, pro: 'Profissional', proFirst: 'Profissional 1',
    theme: 'rose', example: 'Salão da Ana',
    services: [
      { name: 'Corte feminino', min: 60, cents: 8000 },
      { name: 'Escova', min: 45, cents: 5000 },
      { name: 'Coloração', min: 120, cents: 18000 },
      { name: 'Hidratação', min: 60, cents: 9000 },
    ],
  },
  manicure: {
    id: 'manicure', label: 'Manicure e unhas', place: 'estúdio', feminine: false, pro: 'Manicure', proFirst: 'Manicure 1',
    theme: 'coral', example: 'Estúdio da Bia',
    services: [
      { name: 'Mão', min: 45, cents: 3500 },
      { name: 'Pé', min: 60, cents: 4000 },
      { name: 'Mão + pé', min: 90, cents: 7000 },
      { name: 'Esmaltação em gel', min: 60, cents: 8000 },
      { name: 'Alongamento', min: 120, cents: 15000 },
    ],
  },
};

export const NICHE_IDS = Object.keys(NICHES) as NicheId[];

export function nicheOf(id: string | null | undefined): Niche {
  return NICHES[(id ?? '') as NicheId] ?? NICHES.barbearia;
}

/** Palavras com artigo certo para montar frases: "da barbearia", "do salão"... */
export function terms(id: string | null | undefined) {
  const n = nicheOf(id);
  const f = n.feminine;
  return {
    place: n.place,
    the: f ? 'a' : 'o',
    The: f ? 'A' : 'O',
    of: f ? 'da' : 'do',
    in: f ? 'na' : 'no',
    pro: n.pro,
  };
}

type Mode = {
  accent: string; // fundo dos botões principais
  ink: string; // texto sobre o accent
  accentText: string; // accent usado como texto sobre o fundo do cartão
  selBg: string; // fundo de item selecionado
  secText: string; // texto de chips e avatares
  secBg: string; // fundo de chips e avatares
  stripe2: string; // segunda cor da faixa do topo
};

export type Theme = { id: string; name: string; light: Mode; dark: Mode };

export const THEMES: Theme[] = [
  {
    id: 'classico', name: 'Clássico',
    light: { accent: '#c0302a', ink: '#ffffff', accentText: '#b02a24', selBg: '#fbeceb', secText: '#1e3a5f', secBg: '#e4ebf4', stripe2: '#2a4e80' },
    dark: { accent: '#e0574d', ink: '#14100f', accentText: '#f2766b', selBg: '#2b1b20', secText: '#9dbde8', secBg: '#1d2e47', stripe2: '#4170b4' },
  },
  {
    id: 'marinho', name: 'Marinho',
    light: { accent: '#1f4e8c', ink: '#ffffff', accentText: '#1b4a85', selBg: '#e6eefa', secText: '#1b4a85', secBg: '#e6eefa', stripe2: '#7fa3d4' },
    dark: { accent: '#5b93de', ink: '#0a1220', accentText: '#8fb6ee', selBg: '#1b2b44', secText: '#9dbde8', secBg: '#1d2e47', stripe2: '#7fa3d4' },
  },
  {
    id: 'floresta', name: 'Floresta',
    light: { accent: '#1f7a5a', ink: '#ffffff', accentText: '#1a6b4f', selBg: '#e3f3ec', secText: '#1a6b4f', secBg: '#e3f3ec', stripe2: '#b8892b' },
    dark: { accent: '#3fae85', ink: '#06140f', accentText: '#6cd3a5', selBg: '#15302a', secText: '#6cd3a5', secBg: '#143125', stripe2: '#d6a94a' },
  },
  {
    id: 'onix', name: 'Ônix e dourado',
    light: { accent: '#20242b', ink: '#ffffff', accentText: '#20242b', selBg: '#f3ecdc', secText: '#6b4f00', secBg: '#f6edd2', stripe2: '#b8892b' },
    dark: { accent: '#d6a94a', ink: '#14110a', accentText: '#e5bf6a', selBg: '#2a2519', secText: '#e5bf6a', secBg: '#2e2714', stripe2: '#8a6d2a' },
  },
  {
    id: 'rose', name: 'Rosé',
    light: { accent: '#c2336b', ink: '#ffffff', accentText: '#b02c60', selBg: '#fcebf2', secText: '#8a2a55', secBg: '#f8e3ec', stripe2: '#e8a3bf' },
    dark: { accent: '#e0659a', ink: '#1a0a12', accentText: '#f08fb8', selBg: '#321a27', secText: '#f4a3c4', secBg: '#3a1f2e', stripe2: '#a14a72' },
  },
  {
    id: 'ameixa', name: 'Ameixa',
    light: { accent: '#7a3b8f', ink: '#ffffff', accentText: '#6d3380', selBg: '#f3e8f7', secText: '#6d3380', secBg: '#efe3f5', stripe2: '#c79ad6' },
    dark: { accent: '#b87bcf', ink: '#170b1c', accentText: '#d3a2e6', selBg: '#2c1b34', secText: '#d3a2e6', secBg: '#35223f', stripe2: '#7a3b8f' },
  },
  {
    id: 'coral', name: 'Coral',
    light: { accent: '#c4402f', ink: '#ffffff', accentText: '#b53d31', selBg: '#fdeceb', secText: '#8f2f26', secBg: '#fbe4e1', stripe2: '#f0a398' },
    dark: { accent: '#ee7b6e', ink: '#1c0c09', accentText: '#f59a90', selBg: '#34201e', secText: '#f59a90', secBg: '#3d2522', stripe2: '#a9473d' },
  },
  {
    id: 'terracota', name: 'Terracota',
    light: { accent: '#a4533a', ink: '#ffffff', accentText: '#944a33', selBg: '#f8ece6', secText: '#7a3f2b', secBg: '#f3e3da', stripe2: '#d9a58f' },
    dark: { accent: '#d98a6c', ink: '#1c0f0a', accentText: '#e5a68c', selBg: '#33241d', secText: '#e5a68c', secBg: '#3a2a22', stripe2: '#8f4a35' },
  },
];

export const THEME_IDS = THEMES.map((t) => t.id);

export function themeOf(id: string | null | undefined, niche?: string | null): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES.find((t) => t.id === nicheOf(niche).theme) ?? THEMES[0];
}

const vars = (m: Mode) =>
  `--accent:${m.accent};--accent-ink:${m.ink};--accent-text:${m.accentText};--sel-bg:${m.selBg};` +
  `--navy-text:${m.secText};--navy-bg:${m.secBg};--pole-blue:${m.stripe2};`;

/** CSS das paletas (claro e escuro). Os valores vêm só da lista acima. */
export function themeCss(): string {
  const light = THEMES.map((t) => `[data-brand="${t.id}"]{${vars(t.light)}}`).join('\n');
  const dark = THEMES.map((t) => `[data-brand="${t.id}"]{${vars(t.dark)}}`).join('\n');
  return `${light}\n@media (prefers-color-scheme: dark){\n${dark}\n}`;
}

/** Endereço público de um arquivo enviado (logo ou capa). */
export function assetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/shop-assets/${path}`;
}
