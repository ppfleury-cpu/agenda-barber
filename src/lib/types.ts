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
  timezone: string;
  booking_window_days: number;
  min_lead_min: number;
  cancel_hours: number;
  reminder_day_before: boolean;
  reminder_lead_min: number;
  created_at: string;
};

export type Professional = {
  id: string;
  shop_id: string;
  name: string;
  work_days: number[];
  active: boolean;
  start_time: string | null; // vazio = horário do negócio
  end_time: string | null;
  break_start: string | null; // almoço fixo
  break_end: string | null;
  service_ids: string[] | null; // vazio = faz todos os serviços
};
export type Service = { id: string; shop_id: string; name: string; duration_min: number; price_cents: number; active: boolean };
export type Client = { id: string; shop_id: string; name: string; phone: string; wa_consent: boolean };

export type AppointmentStatus = 'confirmed' | 'done' | 'noshow' | 'cancelled';

export type Appointment = {
  id: string;
  shop_id: string;
  professional_id: string;
  service_id: string | null;
  service_ids: string[] | null;
  client_id: string;
  service_name: string;
  price_cents: number;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  source: 'online' | 'painel';
  manage_token: string;
  presence: 'yes' | 'no' | null;
  cancelled_by: 'client' | 'owner' | null;
  confirmation_sent_at: string | null;
  reminder_sent_at: string | null;
  reminder_due_at: string | null;
  day_reminder_sent_at: string | null;
  day_reminder_due_at: string | null;
};

export type WaitlistEntry = {
  id: string;
  shop_id: string;
  date: string;
  name: string;
  phone: string;
  service_ids: string[];
  professional_id: string | null;
  created_at: string;
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
  | 'timezone' | 'booking_window_days' | 'min_lead_min' | 'cancel_hours' | 'reminder_day_before' | 'reminder_lead_min'
>;

export const PUBLIC_SHOP_COLUMNS =
  'id, slug, name, phone, open_time, close_time, open_days, slot_minutes, whatsapp_enabled, suspended, trial_ends_at, paid_until, niche, theme, welcome_text, logo_path, cover_path,' +
  ' timezone, booking_window_days, min_lead_min, cancel_hours, reminder_day_before, reminder_lead_min';
