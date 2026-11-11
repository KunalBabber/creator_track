create extension if not exists pgcrypto;

create sequence if not exists public.creator_ref_code_seq start 1;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'creator')),
  creator_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.creators (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  email text not null,
  phone text,
  platform text,
  profile_url text,
  referral_code text not null unique,
  commission_model text not null check (commission_model in ('qualified_lead', 'sale_fixed', 'sale_percent')),
  commission_value numeric(12,2) not null default 0 check (commission_value >= 0),
  is_active boolean not null default true,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.profiles drop constraint if exists profiles_creator_id_fkey;
alter table public.profiles add constraint profiles_creator_id_fkey foreign key (creator_id) references public.creators(id) on delete set null;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) between 1 and 120),
  price numeric(12,2) not null default 0 check (price >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.referral_links (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creators(id) on delete cascade,
  campaign_name text not null default 'General' check (length(trim(campaign_name)) between 1 and 120),
  is_active boolean not null default true,
  click_count bigint not null default 0 check (click_count >= 0),
  created_at timestamptz not null default now(),
  unique (creator_id, campaign_name)
);

create table if not exists public.click_events (
  id uuid primary key default gen_random_uuid(),
  referral_link_id uuid not null references public.referral_links(id) on delete cascade,
  creator_id uuid not null references public.creators(id) on delete cascade,
  clicked_at timestamptz not null default now(),
  user_agent text
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null check (length(trim(customer_name)) between 2 and 120),
  email text not null,
  phone text not null,
  creator_id uuid not null references public.creators(id),
  referral_code text not null,
  source text not null default 'Referral form',
  product_id uuid references public.products(id) on delete set null,
  status text not null default 'New' check (status in ('New', 'Contacted', 'Qualified', 'Converted', 'Rejected')),
  message text,
  notes text,
  revenue_amount numeric(12,2) not null default 0 check (revenue_amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists leads_email_unique on public.leads (lower(trim(email)));
create unique index if not exists leads_phone_normalized_unique on public.leads (regexp_replace(phone, '[^0-9]', '', 'g'));
create index if not exists leads_creator_created_idx on public.leads (creator_id, created_at desc);
create index if not exists leads_status_idx on public.leads (status);

create table if not exists public.commissions (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creators(id),
  lead_id uuid not null references public.leads(id) on delete cascade,
  amount numeric(12,2) not null check (amount >= 0),
  commission_type text not null check (commission_type in ('qualified_lead', 'sale_fixed', 'sale_percent')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'paid')),
  created_at timestamptz not null default now(),
  unique (lead_id, commission_type)
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creators(id),
  amount numeric(12,2) not null check (amount > 0),
  payment_date timestamptz not null default now(),
  method text not null check (length(trim(method)) between 1 and 80),
  transaction_reference text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.commissions add column if not exists payment_id uuid references public.payments(id);

create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('google_forms', 'google_sheets')),
  form_url text,
  sheet_url text,
  referral_entry_id text,
  campaign_entry_id text,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider)
);
alter table public.integrations add column if not exists referral_entry_id text;
alter table public.integrations add column if not exists campaign_entry_id text;

create table if not exists public.business_settings (
  id smallint primary key default 1 check (id = 1),
  business_name text not null default 'Your business',
  logo_url text,
  currency text not null default 'INR' check (currency = 'INR'),
  default_commission_model text not null default 'qualified_lead' check (default_commission_model in ('qualified_lead', 'sale_fixed', 'sale_percent')),
  default_commission_value numeric(12,2) not null default 0 check (default_commission_value >= 0),
  updated_at timestamptz not null default now()
);
insert into public.business_settings (id) values (1) on conflict (id) do nothing;

alter table public.creators drop constraint if exists creators_email_valid;
alter table public.creators add constraint creators_email_valid check (email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$');
alter table public.creators drop constraint if exists creators_profile_url_valid;
alter table public.creators add constraint creators_profile_url_valid check (profile_url is null or profile_url ~* '^https?://');
alter table public.leads drop constraint if exists leads_email_valid;
alter table public.leads add constraint leads_email_valid check (email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$');
alter table public.integrations drop constraint if exists integrations_urls_valid;
alter table public.integrations add constraint integrations_urls_valid check (
  (form_url is null or form_url ~* '^https?://')
  and (sheet_url is null or sheet_url ~* '^https?://')
  and (referral_entry_id is null or referral_entry_id ~ '^[0-9]+$')
  and (campaign_entry_id is null or campaign_entry_id ~ '^[0-9]+$')
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') $$;

create or replace function public.current_creator_id()
returns uuid language sql stable security definer set search_path = public, pg_temp
as $$ select creator_id from public.profiles where id = auth.uid() and role = 'creator' $$;

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
declare next_role text;
begin
  perform pg_advisory_xact_lock(72419831);
  if not exists (select 1 from public.profiles) then next_role := 'admin'; else next_role := 'creator'; end if;
  insert into public.profiles (id, email, role)
  values (new.id, coalesce(new.email, ''), next_role)
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created_creatortrack on auth.users;
create trigger on_auth_user_created_creatortrack after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.assign_creator_referral_code()
returns trigger language plpgsql set search_path = public, pg_temp
as $$
begin
  if new.referral_code is null or new.referral_code = '' then
    new.referral_code := 'REF' || lpad(nextval('public.creator_ref_code_seq')::text, 3, '0');
  end if;
  return new;
end;
$$;
drop trigger if exists creators_assign_referral_code on public.creators;
create trigger creators_assign_referral_code before insert on public.creators
for each row execute function public.assign_creator_referral_code();

create or replace function public.create_default_referral_link()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  insert into public.referral_links (creator_id, campaign_name) values (new.id, 'General')
  on conflict (creator_id, campaign_name) do nothing;
  return new;
end;
$$;
drop trigger if exists creators_default_referral_link on public.creators;
create trigger creators_default_referral_link after insert on public.creators
for each row execute function public.create_default_referral_link();

create or replace function public.track_referral_click(p_referral_code text, p_campaign_name text default 'General')
returns table(valid boolean, creator_name text)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare link_row public.referral_links%rowtype;
declare creator_label text;
begin
  select rl.* into link_row
  from public.referral_links rl
  join public.creators c on c.id = rl.creator_id
  where c.referral_code = p_referral_code
    and c.is_active = true and rl.is_active = true
    and rl.campaign_name = coalesce(nullif(trim(p_campaign_name), ''), 'General')
  limit 1;
  if not found then return query select false, null::text; return; end if;
  select c.name into creator_label from public.creators c where c.id = link_row.creator_id;
  insert into public.click_events (referral_link_id, creator_id) values (link_row.id, link_row.creator_id);
  update public.referral_links set click_count = click_count + 1 where id = link_row.id;
  return query select true, creator_label;
end;
$$;

create or replace function public.create_referral_lead(
  p_customer_name text,
  p_email text,
  p_phone text,
  p_product_id uuid,
  p_message text,
  p_referral_code text,
  p_campaign_name text default 'General',
  p_source text default 'Referral form'
)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare creator_row public.creators%rowtype;
declare inserted_id uuid;
declare normalized_email text := lower(trim(p_email));
declare normalized_phone text := regexp_replace(p_phone, '[^0-9]', '', 'g');
begin
  if length(trim(p_customer_name)) < 2 or length(normalized_email) < 3 or length(normalized_phone) < 7 then
    raise exception 'invalid lead details';
  end if;
  if p_product_id is not null and not exists (select 1 from public.products where id = p_product_id and is_active = true) then
    raise exception 'invalid product';
  end if;
  select c.* into creator_row
  from public.creators c
  join public.referral_links rl on rl.creator_id = c.id
  where c.referral_code = p_referral_code and c.is_active = true and rl.is_active = true
    and rl.campaign_name = coalesce(nullif(trim(p_campaign_name), ''), 'General')
  limit 1;
  if not found then raise exception 'invalid or inactive referral'; end if;

  perform pg_advisory_xact_lock(hashtext(normalized_email));
  perform pg_advisory_xact_lock(hashtext(normalized_phone));
  if exists (
    select 1 from public.leads l
    where lower(trim(l.email)) = normalized_email
       or regexp_replace(l.phone, '[^0-9]', '', 'g') = normalized_phone
  ) then raise exception 'duplicate lead'; end if;

  insert into public.leads (customer_name, email, phone, creator_id, referral_code, source, product_id, message)
  values (trim(p_customer_name), normalized_email, trim(p_phone), creator_row.id, creator_row.referral_code, coalesce(nullif(trim(p_source), ''), 'Referral form'), p_product_id, nullif(trim(p_message), ''))
  returning id into inserted_id;
  return inserted_id;
end;
$$;

create or replace function public.generate_lead_commission()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
declare creator_row public.creators%rowtype;
declare amount_value numeric(12,2);
begin
  select * into creator_row from public.creators where id = new.creator_id;
  if new.status = 'Qualified' then
    if creator_row.commission_model = 'qualified_lead' then
      amount_value := creator_row.commission_value;
      insert into public.commissions (creator_id, lead_id, amount, commission_type)
      values (new.creator_id, new.id, amount_value, 'qualified_lead')
      on conflict (lead_id, commission_type) do nothing;
    end if;
  elsif new.status = 'Converted' then
    if creator_row.commission_model = 'sale_fixed' then
      amount_value := creator_row.commission_value;
    elsif creator_row.commission_model = 'sale_percent' then
      amount_value := round(new.revenue_amount * creator_row.commission_value / 100, 2);
    else
      return new;
    end if;
    insert into public.commissions (creator_id, lead_id, amount, commission_type)
    values (new.creator_id, new.id, amount_value, creator_row.commission_model)
    on conflict (lead_id, commission_type) do update
      set amount = excluded.amount
      where commissions.status = 'pending';
  end if;
  return new;
end;
$$;
drop trigger if exists leads_generate_commission on public.leads;
create trigger leads_generate_commission after insert or update of status, revenue_amount on public.leads
for each row execute function public.generate_lead_commission();

create or replace function public.record_creator_payment(p_creator_id uuid, p_method text, p_reference text default null)
returns numeric
language plpgsql security definer set search_path = public, pg_temp
as $$
declare total_amount numeric(12,2);
declare new_payment_id uuid;
begin
  if not public.is_admin() then raise exception 'admin permission required'; end if;
  if length(trim(p_method)) < 1 then raise exception 'payment method is required'; end if;
  perform pg_advisory_xact_lock(hashtext(p_creator_id::text));
  select coalesce(sum(amount), 0) into total_amount from public.commissions
    where creator_id = p_creator_id and status = 'approved' and payment_id is null;
  if total_amount <= 0 then raise exception 'no approved commissions available'; end if;
  insert into public.payments (creator_id, amount, method, transaction_reference, created_by)
  values (p_creator_id, total_amount, trim(p_method), nullif(trim(p_reference), ''), auth.uid())
  returning id into new_payment_id;
  update public.commissions set status = 'paid', payment_id = new_payment_id
    where creator_id = p_creator_id and status = 'approved' and payment_id is null;
  return total_amount;
end;
$$;

alter table public.profiles enable row level security;
alter table public.creators enable row level security;
alter table public.products enable row level security;
alter table public.referral_links enable row level security;
alter table public.click_events enable row level security;
alter table public.leads enable row level security;
alter table public.commissions enable row level security;
alter table public.payments enable row level security;
alter table public.integrations enable row level security;
alter table public.business_settings enable row level security;

drop policy if exists profiles_select_own_or_admin on public.profiles;
create policy profiles_select_own_or_admin on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists creators_admin_all on public.creators;
create policy creators_admin_all on public.creators for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists creators_self_select on public.creators;
create policy creators_self_select on public.creators for select to authenticated using (auth_user_id = auth.uid() or id = public.current_creator_id());

drop policy if exists products_public_select_active on public.products;
create policy products_public_select_active on public.products for select to anon, authenticated using (is_active or public.is_admin());
drop policy if exists products_admin_write on public.products;
create policy products_admin_write on public.products for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists referral_links_select_active on public.referral_links;
create policy referral_links_select_active on public.referral_links for select to anon, authenticated using (is_active or public.is_admin() or creator_id = public.current_creator_id());
drop policy if exists referral_links_admin_write on public.referral_links;
create policy referral_links_admin_write on public.referral_links for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists click_events_admin_or_creator_read on public.click_events;
create policy click_events_admin_or_creator_read on public.click_events for select to authenticated using (public.is_admin() or creator_id = public.current_creator_id());

drop policy if exists leads_admin_or_creator_read on public.leads;
create policy leads_admin_or_creator_read on public.leads for select to authenticated using (public.is_admin() or creator_id = public.current_creator_id());
drop policy if exists leads_admin_update on public.leads;
create policy leads_admin_update on public.leads for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists commissions_admin_or_creator_read on public.commissions;
create policy commissions_admin_or_creator_read on public.commissions for select to authenticated using (public.is_admin() or creator_id = public.current_creator_id());
drop policy if exists commissions_admin_update on public.commissions;
create policy commissions_admin_update on public.commissions for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists payments_admin_or_creator_read on public.payments;
create policy payments_admin_or_creator_read on public.payments for select to authenticated using (public.is_admin() or creator_id = public.current_creator_id());

drop policy if exists integrations_admin_all on public.integrations;
create policy integrations_admin_all on public.integrations for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists settings_admin_all on public.business_settings;
create policy settings_admin_all on public.business_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant usage on schema public to anon, authenticated;
grant select on public.products to anon, authenticated;
grant select, insert, update, delete on public.creators, public.products, public.referral_links, public.leads, public.commissions, public.integrations, public.business_settings to authenticated;
grant select on public.profiles, public.click_events, public.payments to authenticated;
grant usage, select on sequence public.creator_ref_code_seq to authenticated;
grant execute on function public.track_referral_click(text, text) to anon, authenticated;
grant execute on function public.create_referral_lead(text, text, text, uuid, text, text, text, text) to anon, authenticated;
revoke all on function public.record_creator_payment(uuid, text, text) from public, anon;
grant execute on function public.record_creator_payment(uuid, text, text) to authenticated;
