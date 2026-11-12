alter table public.creators
  add column if not exists dashboard_permissions jsonb not null default
  '{"show_referral_link":true,"show_total_leads":true,"show_completed_clients":true,"show_total_clicks":false,"show_qualified_leads":false,"show_pending_clients":false,"show_rejected_leads":false,"show_conversion_rate":false,"show_commission_earned":false,"show_pending_commission":false,"show_paid_commission":false,"show_payment_history":false,"show_lead_performance_chart":false,"show_recent_activity":false,"show_monthly_performance":false}'::jsonb;

alter table public.leads alter column creator_id drop not null;
alter table public.leads alter column referral_code drop not null;

alter table public.creators drop constraint if exists creators_dashboard_permissions_object;
alter table public.creators add constraint creators_dashboard_permissions_object
  check (jsonb_typeof(dashboard_permissions) = 'object');

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
declare
  creator_row public.creators%rowtype;
  inserted_id uuid;
  normalized_email text := lower(trim(p_email));
  normalized_phone text := regexp_replace(p_phone, '[^0-9]', '', 'g');
begin
  if length(trim(p_customer_name)) < 2 or length(normalized_email) < 3 or length(normalized_phone) < 7 then
    raise exception 'invalid lead details';
  end if;
  if p_product_id is not null and not exists (select 1 from public.products where id = p_product_id and is_active = true) then
    raise exception 'invalid product';
  end if;

  if p_referral_code is not null and trim(p_referral_code) <> '' then
    select c.* into creator_row
    from public.creators c
    join public.referral_links rl on rl.creator_id = c.id
    where c.referral_code = trim(p_referral_code)
      and c.is_active = true and rl.is_active = true
      and rl.campaign_name = coalesce(nullif(trim(p_campaign_name), ''), 'General')
    limit 1;
    if not found then raise exception 'invalid or inactive referral'; end if;
  else
    creator_row.id := null;
    creator_row.referral_code := null;
  end if;

  perform pg_advisory_xact_lock(hashtext(normalized_email));
  perform pg_advisory_xact_lock(hashtext(normalized_phone));
  if exists (
    select 1 from public.leads l
    where lower(trim(l.email)) = normalized_email
       or regexp_replace(l.phone, '[^0-9]', '', 'g') = normalized_phone
  ) then raise exception 'duplicate lead'; end if;

  insert into public.leads (customer_name, email, phone, creator_id, referral_code, source, product_id, message)
  values (
    trim(p_customer_name), normalized_email, trim(p_phone), creator_row.id,
    creator_row.referral_code,
    case when creator_row.id is null then 'Direct' else coalesce(nullif(trim(p_source), ''), 'Referral form') end,
    p_product_id, nullif(trim(p_message), '')
  )
  returning id into inserted_id;
  return inserted_id;
end;
$$;

create or replace function public.generate_lead_commission()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  creator_row public.creators%rowtype;
  amount_value numeric(12,2);
begin
  if new.creator_id is null then return new; end if;
  select * into creator_row from public.creators where id = new.creator_id;
  if not found then return new; end if;

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

create or replace function public.creator_dashboard_data()
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  creator_row public.creators%rowtype;
  permission_set jsonb;
  result jsonb;
  item_count bigint;
  item_amount numeric;
  item_rate numeric;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;

  select c.* into creator_row
  from public.profiles p
  join public.creators c on c.id = p.creator_id and c.auth_user_id = p.id
  where p.id = auth.uid() and p.role = 'creator' and c.is_active = true;
  if not found then raise exception 'creator account unavailable'; end if;

  permission_set := creator_row.dashboard_permissions;
  result := jsonb_build_object('creator', jsonb_build_object('name', creator_row.name));

  if coalesce((permission_set->>'show_referral_link')::boolean, false) then
    result := result || jsonb_build_object(
      'referral_links',
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'campaign', rl.campaign_name,
          'code', creator_row.referral_code
        ) order by rl.created_at)
        from public.referral_links rl
        where rl.creator_id = creator_row.id and rl.is_active = true
      ), '[]'::jsonb)
    );
  end if;

  if coalesce((permission_set->>'show_total_clicks')::boolean, false) then
    select coalesce(sum(rl.click_count), 0) into item_count
      from public.referral_links rl where rl.creator_id = creator_row.id;
    result := result || jsonb_build_object('total_clicks', item_count);
  end if;
  if coalesce((permission_set->>'show_total_leads')::boolean, false) then
    select count(*) into item_count from public.leads l where l.creator_id = creator_row.id;
    result := result || jsonb_build_object('total_leads', item_count);
  end if;
  if coalesce((permission_set->>'show_qualified_leads')::boolean, false) then
    select count(*) into item_count from public.leads l where l.creator_id = creator_row.id and l.status = 'Qualified';
    result := result || jsonb_build_object('qualified_leads', item_count);
  end if;
  if coalesce((permission_set->>'show_completed_clients')::boolean, false) then
    select count(*) into item_count from public.leads l where l.creator_id = creator_row.id and l.status = 'Converted';
    result := result || jsonb_build_object('completed_clients', item_count);
  end if;
  if coalesce((permission_set->>'show_pending_clients')::boolean, false) then
    select count(*) into item_count from public.leads l where l.creator_id = creator_row.id and l.status in ('New', 'Contacted', 'Qualified');
    result := result || jsonb_build_object('pending_clients', item_count);
  end if;
  if coalesce((permission_set->>'show_rejected_leads')::boolean, false) then
    select count(*) into item_count from public.leads l where l.creator_id = creator_row.id and l.status = 'Rejected';
    result := result || jsonb_build_object('rejected_leads', item_count);
  end if;
  if coalesce((permission_set->>'show_conversion_rate')::boolean, false) then
    select case when count(*) = 0 then 0 else round(count(*) filter (where l.status = 'Converted')::numeric * 100 / count(*), 1) end
      into item_rate from public.leads l where l.creator_id = creator_row.id;
    result := result || jsonb_build_object('conversion_rate', item_rate);
  end if;
  if coalesce((permission_set->>'show_commission_earned')::boolean, false) then
    select coalesce(sum(cm.amount), 0) into item_amount from public.commissions cm where cm.creator_id = creator_row.id;
    result := result || jsonb_build_object('commission_earned', item_amount);
  end if;
  if coalesce((permission_set->>'show_pending_commission')::boolean, false) then
    select coalesce(sum(cm.amount), 0) into item_amount from public.commissions cm where cm.creator_id = creator_row.id and cm.status in ('pending', 'approved');
    result := result || jsonb_build_object('pending_commission', item_amount);
  end if;
  if coalesce((permission_set->>'show_paid_commission')::boolean, false) then
    select coalesce(sum(cm.amount), 0) into item_amount from public.commissions cm where cm.creator_id = creator_row.id and cm.status = 'paid';
    result := result || jsonb_build_object('paid_commission', item_amount);
  end if;

  if coalesce((permission_set->>'show_payment_history')::boolean, false) then
    result := result || jsonb_build_object(
      'payment_history',
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'amount', py.amount, 'date', py.payment_date, 'method', py.method
        ) order by py.payment_date desc)
        from (
          select p.amount, p.payment_date, p.method
          from public.payments p where p.creator_id = creator_row.id
          order by p.payment_date desc limit 50
        ) py
      ), '[]'::jsonb)
    );
  end if;

  if coalesce((permission_set->>'show_lead_performance_chart')::boolean, false) then
    result := result || jsonb_build_object(
      'lead_performance',
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'month', to_char(m.month_start, 'Mon'),
          'leads', (select count(*) from public.leads l where l.creator_id = creator_row.id and l.created_at >= m.month_start and l.created_at < m.month_start + interval '1 month'),
          'completed', (select count(*) from public.leads l where l.creator_id = creator_row.id and l.status = 'Converted' and l.created_at >= m.month_start and l.created_at < m.month_start + interval '1 month')
        ) order by m.month_start)
        from (select date_trunc('month', current_date) - (n * interval '1 month') as month_start from generate_series(5, 0, -1) n) m
      ), '[]'::jsonb)
    );
  end if;

  if coalesce((permission_set->>'show_monthly_performance')::boolean, false) then
    result := result || jsonb_build_object(
      'monthly_performance',
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'month', to_char(m.month_start, 'Mon'),
          'leads', (select count(*) from public.leads l where l.creator_id = creator_row.id and l.created_at >= m.month_start and l.created_at < m.month_start + interval '1 month'),
          'completed', (select count(*) from public.leads l where l.creator_id = creator_row.id and l.status = 'Converted' and l.created_at >= m.month_start and l.created_at < m.month_start + interval '1 month')
        ) order by m.month_start)
        from (select date_trunc('month', current_date) - (n * interval '1 month') as month_start from generate_series(5, 0, -1) n) m
      ), '[]'::jsonb)
    );
  end if;

  if coalesce((permission_set->>'show_recent_activity')::boolean, false) then
    result := result || jsonb_build_object(
      'recent_activity',
      coalesce((
        select jsonb_agg(jsonb_build_object('status', activity.status, 'date', activity.created_at) order by activity.created_at desc)
        from (
          select l.status, l.created_at from public.leads l
          where l.creator_id = creator_row.id order by l.created_at desc limit 10
        ) activity
      ), '[]'::jsonb)
    );
  end if;

  return result;
end;
$$;

drop policy if exists referral_links_select_active on public.referral_links;
drop policy if exists click_events_admin_or_creator_read on public.click_events;
drop policy if exists leads_admin_or_creator_read on public.leads;
drop policy if exists commissions_admin_or_creator_read on public.commissions;
drop policy if exists payments_admin_or_creator_read on public.payments;

drop policy if exists referral_links_admin_write on public.referral_links;
create policy referral_links_admin_write on public.referral_links for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists click_events_admin_read on public.click_events;
create policy click_events_admin_read on public.click_events for select to authenticated using (public.is_admin());

drop policy if exists leads_admin_read on public.leads;
create policy leads_admin_read on public.leads for select to authenticated using (public.is_admin());
drop policy if exists leads_admin_update on public.leads;
create policy leads_admin_update on public.leads for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists commissions_admin_read on public.commissions;
create policy commissions_admin_read on public.commissions for select to authenticated using (public.is_admin());
drop policy if exists commissions_admin_update on public.commissions;
create policy commissions_admin_update on public.commissions for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists payments_admin_read on public.payments;
create policy payments_admin_read on public.payments for select to authenticated using (public.is_admin());

drop policy if exists creators_self_select on public.creators;
create policy creators_self_select on public.creators for select to authenticated
  using (auth_user_id = auth.uid() and is_active and id = public.current_creator_id());

revoke all on function public.creator_dashboard_data() from public, anon;
grant execute on function public.creator_dashboard_data() to authenticated;
