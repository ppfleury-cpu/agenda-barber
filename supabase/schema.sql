-- =====================================================================
-- Agenda Barber - estrutura do banco de dados (Supabase / PostgreSQL)
--
-- Como usar: no Supabase, abra "SQL Editor", clique em "New query",
-- cole TODO este arquivo e clique em "Run". Pode rodar uma vez só.
--
-- Ideia central: cada barbearia (shop) é um "inquilino". O dono só
-- enxerga as linhas da própria barbearia (Row Level Security). A página
-- pública de agendamento NÃO acessa o banco direto: ela passa pelo
-- servidor do app, que usa a chave de serviço (service_role).
-- =====================================================================

create extension if not exists btree_gist;

-- ---------------------------------------------------------------------
-- Barbearias
-- ---------------------------------------------------------------------
create table if not exists public.shops (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null unique references auth.users (id) on delete cascade,
  owner_email           text not null,
  slug                  text not null unique
                          check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 40),
  name                  text not null check (char_length(name) between 2 and 80),
  phone                 text check (phone is null or phone ~ '^[0-9]{10,11}$'),
  open_time             time not null default '09:00',
  close_time            time not null default '19:00',
  open_days             smallint[] not null default '{1,2,3,4,5,6}',   -- 0 = domingo ... 6 = sábado
  slot_minutes          smallint not null default 30 check (slot_minutes in (15, 30, 60)),
  loyalty_target        smallint not null default 10 check (loyalty_target between 2 and 50),
  whatsapp_enabled      boolean not null default true,
  -- cobrança da mensalidade (quem altera é o servidor/admin, nunca o dono)
  suspended             boolean not null default false,
  trial_ends_at         timestamptz not null default (now() + interval '14 days'),
  paid_until            timestamptz,
  asaas_customer_id     text,
  asaas_subscription_id text,
  created_at            timestamptz not null default now(),
  check (open_time < close_time)
);

create table if not exists public.professionals (
  id         uuid primary key default gen_random_uuid(),
  shop_id    uuid not null references public.shops (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 60),
  work_days  smallint[] not null default '{1,2,3,4,5,6}',
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.services (
  id           uuid primary key default gen_random_uuid(),
  shop_id      uuid not null references public.shops (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 80),
  duration_min smallint not null check (duration_min between 5 and 480),
  price_cents  integer not null check (price_cents >= 0),
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

create table if not exists public.clients (
  id         uuid primary key default gen_random_uuid(),
  shop_id    uuid not null references public.shops (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 80),
  phone      text not null check (phone ~ '^[0-9]{10,11}$'),   -- só dígitos, com DDD
  wa_consent boolean not null default true,
  created_at timestamptz not null default now(),
  unique (shop_id, phone)
);

create table if not exists public.appointments (
  id                    uuid primary key default gen_random_uuid(),
  shop_id               uuid not null references public.shops (id) on delete cascade,
  professional_id       uuid not null references public.professionals (id) on delete restrict,
  service_id            uuid references public.services (id) on delete set null,
  client_id             uuid not null references public.clients (id) on delete cascade,
  service_name          text not null,
  price_cents           integer not null check (price_cents >= 0),
  starts_at             timestamptz not null,
  ends_at               timestamptz not null,
  status                text not null default 'confirmed'
                          check (status in ('confirmed', 'done', 'noshow', 'cancelled')),
  source                text not null default 'online' check (source in ('online', 'painel')),
  confirmation_sent_at  timestamptz,
  confirmation_attempts smallint not null default 0,
  confirmation_error    text,
  reminder_sent_at      timestamptz,
  reminder_attempts     smallint not null default 0,
  reminder_error        text,
  created_at            timestamptz not null default now(),
  check (ends_at > starts_at),
  -- Garantia final contra horário duplo: o mesmo profissional não pode ter
  -- dois atendimentos ativos que se sobrepõem, mesmo com dois cliques ao mesmo tempo.
  constraint no_double_booking exclude using gist (
    professional_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status in ('confirmed', 'done'))
);

-- Bloqueios de horário (almoço, compromisso, folga pontual).
-- professional_id nulo = vale para a barbearia inteira.
create table if not exists public.time_blocks (
  id              uuid primary key default gen_random_uuid(),
  shop_id         uuid not null references public.shops (id) on delete cascade,
  professional_id uuid references public.professionals (id) on delete cascade,
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  reason          text,
  created_at      timestamptz not null default now(),
  check (ends_at > starts_at)
);

-- Eventos de cobrança já processados (evita processar o mesmo aviso duas vezes).
create table if not exists public.billing_events (
  event_id    text primary key,
  event       text not null,
  payload     jsonb,
  received_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Aparência da página de cada negócio (pode rodar de novo sem problema)
-- ---------------------------------------------------------------------
alter table public.shops add column if not exists niche        text not null default 'barbearia' check (char_length(niche) <= 30);
alter table public.shops add column if not exists theme        text not null default 'classico'  check (char_length(theme) <= 30);
alter table public.shops add column if not exists welcome_text text check (welcome_text is null or char_length(welcome_text) <= 200);
alter table public.shops add column if not exists logo_path    text;
alter table public.shops add column if not exists cover_path   text;

-- Pasta pública para logo e foto de capa. Só o servidor grava (não existe política de escrita).
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('shop-assets', 'shop-assets', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
    on conflict (id) do update
      set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];
  end if;
end $$;

create index if not exists professionals_shop_idx on public.professionals (shop_id);
create index if not exists services_shop_idx      on public.services (shop_id);
create index if not exists clients_shop_idx       on public.clients (shop_id);
create index if not exists appts_shop_start_idx   on public.appointments (shop_id, starts_at);
create index if not exists appts_client_idx       on public.appointments (client_id);
create index if not exists appts_reminder_idx     on public.appointments (starts_at)
  where status = 'confirmed' and reminder_sent_at is null;
create index if not exists appts_confirmation_idx on public.appointments (created_at)
  where status = 'confirmed' and confirmation_sent_at is null;
create index if not exists blocks_shop_start_idx  on public.time_blocks (shop_id, starts_at);

-- ---------------------------------------------------------------------
-- Segurança (Row Level Security)
-- ---------------------------------------------------------------------
alter table public.shops          enable row level security;
alter table public.professionals  enable row level security;
alter table public.services       enable row level security;
alter table public.clients        enable row level security;
alter table public.appointments   enable row level security;
alter table public.time_blocks    enable row level security;
alter table public.billing_events enable row level security;

-- Função auxiliar: "o usuário logado é dono desta barbearia?"
create or replace function public.owns_shop(sid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.shops s
    where s.id = sid and s.owner_id = (select auth.uid())
  );
$$;

-- shops: o dono lê e altera a própria barbearia (só algumas colunas, veja os GRANTs abaixo)
drop policy if exists shops_select on public.shops;
create policy shops_select on public.shops for select to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists shops_update on public.shops;
create policy shops_update on public.shops for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- profissionais, serviços e bloqueios: o dono faz tudo na própria barbearia
drop policy if exists professionals_all on public.professionals;
create policy professionals_all on public.professionals for all to authenticated
  using (public.owns_shop(shop_id)) with check (public.owns_shop(shop_id));

drop policy if exists services_all on public.services;
create policy services_all on public.services for all to authenticated
  using (public.owns_shop(shop_id)) with check (public.owns_shop(shop_id));

drop policy if exists time_blocks_all on public.time_blocks;
create policy time_blocks_all on public.time_blocks for all to authenticated
  using (public.owns_shop(shop_id)) with check (public.owns_shop(shop_id));

-- clientes e agendamentos: o dono lê (criação passa pelo servidor); agendamento: só muda o status
drop policy if exists clients_select on public.clients;
create policy clients_select on public.clients for select to authenticated
  using (public.owns_shop(shop_id));

drop policy if exists appointments_select on public.appointments;
create policy appointments_select on public.appointments for select to authenticated
  using (public.owns_shop(shop_id));

drop policy if exists appointments_update on public.appointments;
create policy appointments_update on public.appointments for update to authenticated
  using (public.owns_shop(shop_id)) with check (public.owns_shop(shop_id));

-- billing_events: sem política nenhuma = só o servidor (service_role) acessa.

-- ---------------------------------------------------------------------
-- Permissões por tabela e coluna
-- ---------------------------------------------------------------------
-- Visitante não logado (anon) não acessa nada direto.
revoke all on public.shops, public.professionals, public.services, public.clients,
              public.appointments, public.time_blocks, public.billing_events from anon;
revoke all on public.billing_events from authenticated;

-- O dono NÃO pode inserir/apagar barbearia nem mexer em cobrança.
revoke insert, delete, truncate on public.shops from authenticated;
revoke update on public.shops from authenticated;
grant select on public.shops to authenticated;
grant update (name, phone, open_time, close_time, open_days, slot_minutes,
              loyalty_target, whatsapp_enabled, niche, theme, welcome_text) on public.shops to authenticated;
-- logo_path e cover_path só mudam pelo servidor (depois de validar o arquivo enviado).

-- Clientes e agendamentos: o dono só lê; no agendamento só altera o status.
revoke insert, delete, truncate on public.clients from authenticated;
revoke update on public.clients from authenticated;
revoke insert, delete, truncate on public.appointments from authenticated;
revoke update on public.appointments from authenticated;
grant update (status) on public.appointments to authenticated;

-- billing_events: já revogado acima.
