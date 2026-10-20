// Formato das linhas do banco (escrito à mão para o projeto ficar simples).
export type Shop = {
  id: string;
  owner_id: string;
  owner_email: string;
  slug: string;
  name: string;
  phone: string | null;
  open_time: string;
  close_time: string;
  open_days: number[];
  slot_minutes: number;
  loyalty_target: number;
  whatsapp_enabled: boolean;
  suspended: boolean;
  trial_ends_at: string;
  paid_until: string | null;
  asaas_customer_id: string | null;
  asaas_subscription_id: string | null;
  niche: string;
  theme: string;
  welcome_text: string | null;
  logo_path: string | null;
  cover_path: string | null;
  created_at: string;
};

export type Professional = { id: string; shop_id: string; name: string; work_days: number[]; active: boolean };
export type Service = { id: string; shop_id: string; name: string; duration_min: number; price_cents: number; active: boolean };
export type Client = { id: string; shop_id: string; name: string; phone: string; wa_consent: boolean };

export type AppointmentStatus = 'confirmed' | 'done' | 'noshow' | 'cancelled';

export type Appointment = {
  id: string;
  shop_id: string;
  professional_id: string;
  service_id: string | null;
  client_id: string;
  service_name: string;
  price_cents: number;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  source: 'online' | 'painel';
  confirmation_sent_at: string | null;
  reminder_sent_at: string | null;
};

export type TimeBlock = {
  id: string;
  shop_id: string;
  professional_id: string | null;
  starts_at: string;
  ends_at: string;
  reason: string | null;
};

/** Campos da barbearia que a página pública pode ver. */
export type PublicShop = Pick<
  Shop,
  | 'id' | 'slug' | 'name' | 'phone' | 'open_time' | 'close_time' | 'open_days' | 'slot_minutes'
  | 'whatsapp_enabled' | 'suspended' | 'trial_ends_at' | 'paid_until'
  | 'niche' | 'theme' | 'welcome_text' | 'logo_path' | 'cover_path'
>;

export const PUBLIC_SHOP_COLUMNS =
  'id, slug, name, phone, open_time, close_time, open_days, slot_minutes, whatsapp_enabled, suspended, trial_ends_at, paid_until, niche, theme, welcome_text, logo_path, cover_path';
