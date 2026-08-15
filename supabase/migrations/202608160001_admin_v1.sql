-- RoadReach Auto Export independent MVP schema.
-- Apply with the Supabase CLI; never paste credentials into this migration.

create extension if not exists pgcrypto with schema extensions;

create type public.publication_status as enum ('DRAFT', 'PUBLISHED', 'SOLD', 'ARCHIVED');
create type public.sourcing_status as enum ('IN_STOCK', 'AVAILABLE_TO_SOURCE');
create type public.crm_priority as enum ('HIGH', 'MEDIUM', 'LOW');
create type public.customer_status as enum ('NEW', 'ACTIVE', 'QUALIFIED', 'DECLINED', 'INACTIVE', 'WON');
create type public.customer_type as enum ('DEALER', 'IMPORTER', 'FLEET', 'PERSONAL_BUYER', 'OTHER');
create type public.followup_status as enum ('OPEN', 'DONE', 'CANCELLED');
create type public.quote_status as enum ('DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED');

create table public.admin_allowlist (
  email text primary key check (email = lower(trim(email))),
  display_name text,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.admin_allowlist (email, display_name)
values ('xuli58836@gmail.com', 'RoadReach Administrator');

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.admin_allowlist a
    where a.email = lower(coalesce(auth.jwt() ->> 'email', ''))
      and a.enabled
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, service_role;

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  stock_id text not null unique check (length(trim(stock_id)) between 2 and 40),
  brand text not null,
  model text not null,
  year integer not null check (year between 1980 and 2100),
  body_type text not null,
  fuel_type text not null,
  steering text not null check (steering in ('LHD', 'RHD')),
  mileage integer check (mileage is null or mileage >= 0),
  exterior_color text,
  interior_color text,
  condition text,
  sourcing_status public.sourcing_status not null default 'IN_STOCK',
  publication_status public.publication_status not null default 'DRAFT',
  public_reference_fob_price_usd numeric(12,2) check (public_reference_fob_price_usd is null or public_reference_fob_price_usd >= 0),
  internal_vehicle_cost_rmb numeric(12,2) not null default 0 check (internal_vehicle_cost_rmb >= 0),
  exchange_rate numeric(12,6) not null default 7.20 check (exchange_rate > 0),
  domestic_transport_cost_rmb numeric(12,2) not null default 0 check (domestic_transport_cost_rmb >= 0),
  refurbishment_cost_rmb numeric(12,2) not null default 0 check (refurbishment_cost_rmb >= 0),
  export_document_cost_rmb numeric(12,2) not null default 0 check (export_document_cost_rmb >= 0),
  port_loading_cost_rmb numeric(12,2) not null default 0 check (port_loading_cost_rmb >= 0),
  other_cost_rmb numeric(12,2) not null default 0 check (other_cost_rmb >= 0),
  total_other_cost_rmb numeric(12,2) not null default 0,
  target_profit_rmb numeric(12,2) not null default 5000 check (target_profit_rmb >= 0),
  suggested_fob_price_usd numeric(12,2) not null default 0,
  expected_profit_rmb numeric(12,2) not null default 0,
  expected_margin numeric(8,4) not null default 0,
  vehicle_notes_en text,
  vehicle_notes_ru text,
  full_vin text check (full_vin is null or length(trim(full_vin)) between 8 and 32),
  masked_vin text,
  featured boolean not null default false,
  published_at timestamptz,
  sold_at timestamptz,
  archive_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index vehicles_publication_status_idx on public.vehicles (publication_status, published_at desc);
create index vehicles_catalog_filters_idx on public.vehicles (brand, model, year, fuel_type, steering, body_type, sourcing_status);

create or replace function public.prepare_vehicle()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  sale_rmb numeric;
begin
  new.stock_id := upper(trim(new.stock_id));
  new.brand := trim(new.brand);
  new.model := trim(new.model);
  new.full_vin := nullif(upper(regexp_replace(coalesce(new.full_vin, ''), '\s+', '', 'g')), '');
  new.total_other_cost_rmb :=
    coalesce(new.domestic_transport_cost_rmb, 0) +
    coalesce(new.refurbishment_cost_rmb, 0) +
    coalesce(new.export_document_cost_rmb, 0) +
    coalesce(new.port_loading_cost_rmb, 0) +
    coalesce(new.other_cost_rmb, 0);
  new.suggested_fob_price_usd := round((new.internal_vehicle_cost_rmb + new.total_other_cost_rmb + new.target_profit_rmb) / new.exchange_rate, 2);
  sale_rmb := coalesce(new.public_reference_fob_price_usd, new.suggested_fob_price_usd) * new.exchange_rate;
  new.expected_profit_rmb := round(sale_rmb - new.internal_vehicle_cost_rmb - new.total_other_cost_rmb, 2);
  new.expected_margin := case when sale_rmb > 0 then round(new.expected_profit_rmb / sale_rmb, 4) else 0 end;
  new.masked_vin := case
    when new.sourcing_status = 'IN_STOCK' and length(coalesce(new.full_vin, '')) >= 12
      then left(new.full_vin, 8) || '****' || right(new.full_vin, 4)
    else null
  end;
  if tg_op = 'INSERT' then
    if new.publication_status = 'PUBLISHED' then new.published_at := coalesce(new.published_at, now()); end if;
    if new.publication_status = 'SOLD' then
      new.sold_at := coalesce(new.sold_at, now());
      new.archive_at := coalesce(new.archive_at, now() + interval '90 days');
    end if;
    if new.publication_status = 'ARCHIVED' then new.archive_at := coalesce(new.archive_at, now()); end if;
  else
    if new.publication_status = 'PUBLISHED' and old.publication_status is distinct from 'PUBLISHED' then
      new.published_at := coalesce(new.published_at, now());
    end if;
    if new.publication_status = 'SOLD' and old.publication_status is distinct from 'SOLD' then
      new.sold_at := coalesce(new.sold_at, now());
      new.archive_at := coalesce(new.archive_at, now() + interval '90 days');
    end if;
    if new.publication_status = 'ARCHIVED' and old.publication_status is distinct from 'ARCHIVED' then
      new.archive_at := coalesce(new.archive_at, now());
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger vehicles_prepare_before_write
before insert or update on public.vehicles
for each row execute function public.prepare_vehicle();

create table public.vehicle_images (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  storage_path text not null unique,
  public_url text not null,
  alt_text_en text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (vehicle_id, sort_order) deferrable initially immediate
);

create index vehicle_images_vehicle_idx on public.vehicle_images (vehicle_id, sort_order);

create or replace function public.limit_vehicle_images()
returns trigger language plpgsql set search_path = public as $$
begin
  if (select count(*) from public.vehicle_images where vehicle_id = new.vehicle_id) >= 15 then
    raise exception 'A vehicle may have at most 15 images';
  end if;
  return new;
end;
$$;

create trigger vehicle_images_limit before insert on public.vehicle_images for each row execute function public.limit_vehicle_images();

create or replace function public.reorder_vehicle_images(p_vehicle_id uuid, p_image_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if array_length(p_image_ids, 1) > 15 then raise exception 'Too many images'; end if;
  set constraints all deferred;
  update public.vehicle_images i set sort_order = ordered.position - 1
  from unnest(p_image_ids) with ordinality as ordered(image_id, position)
  where i.id = ordered.image_id and i.vehicle_id = p_vehicle_id;
end;
$$;

revoke all on function public.reorder_vehicle_images(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_vehicle_images(uuid, uuid[]) to authenticated, service_role;

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  company text,
  country text,
  city text,
  customer_type public.customer_type not null default 'OTHER',
  contact_name text not null,
  email text,
  backup_email text,
  whatsapp text,
  phone text,
  priority public.crm_priority not null default 'MEDIUM',
  suggested_priority public.crm_priority not null default 'MEDIUM',
  status public.customer_status not null default 'NEW',
  interested_vehicles uuid[] not null default '{}',
  requirements text,
  budget numeric(12,2),
  quantity integer check (quantity is null or quantity > 0),
  destination_port text,
  purchase_timing text,
  last_contact_at timestamptz,
  next_followup_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index customers_email_unique_idx on public.customers (lower(email)) where email is not null;
create index customers_company_lookup_idx on public.customers (lower(company), country, city);
create index customers_followup_idx on public.customers (next_followup_at) where next_followup_at is not null;

create table public.inquiries (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  name text not null,
  company text,
  country text not null,
  city text,
  customer_type public.customer_type not null default 'OTHER',
  email text,
  whatsapp_or_phone text,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  stock_id text,
  preferred_model text,
  quantity integer not null default 1 check (quantity > 0 and quantity <= 1000),
  target_budget numeric(12,2) check (target_budget is null or target_budget >= 0),
  destination_port text,
  purchase_timing text,
  message text,
  request_full_vin boolean not null default false,
  language text not null default 'en' check (language in ('en', 'ru')),
  source_page text,
  submitted_at timestamptz not null default now(),
  status text not null default 'NEW' check (status in ('NEW', 'REVIEWED', 'QUALIFIED', 'CLOSED', 'SPAM')),
  notification_status text not null default 'NOT_CONFIGURED' check (notification_status in ('NOT_CONFIGURED', 'PENDING', 'SENT', 'FAILED')),
  created_at timestamptz not null default now(),
  check (email is not null or whatsapp_or_phone is not null)
);

create index inquiries_submitted_idx on public.inquiries (submitted_at desc);
create index inquiries_customer_idx on public.inquiries (customer_id);

create table public.followups (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  inquiry_id uuid references public.inquiries(id) on delete set null,
  due_at timestamptz not null,
  status public.followup_status not null default 'OPEN',
  priority public.crm_priority not null default 'MEDIUM',
  note text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index followups_dashboard_idx on public.followups (status, due_at);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  reference_fob_usd numeric(12,2) not null check (reference_fob_usd >= 0),
  currency text not null default 'USD',
  quantity integer not null default 1 check (quantity > 0),
  destination_port text,
  shipping_note text,
  valid_until date,
  status public.quote_status not null default 'DRAFT',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  country text,
  city text,
  destination_port text,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  model text not null,
  year integer,
  fuel_type text,
  quantity integer not null default 1 check (quantity > 0),
  expected_public_price numeric(12,2),
  actual_deal_price numeric(12,2),
  expected_vehicle_cost numeric(12,2),
  actual_vehicle_cost numeric(12,2),
  expected_other_cost numeric(12,2),
  actual_other_cost numeric(12,2),
  actual_total_cost numeric(12,2),
  expected_profit numeric(12,2),
  actual_profit numeric(12,2),
  expected_margin numeric(8,4),
  actual_margin numeric(8,4),
  deal_date date not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customer_email_messages (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  gmail_message_id text not null unique,
  gmail_thread_id text not null,
  direction text not null check (direction in ('INBOUND', 'OUTBOUND')),
  from_address text not null,
  to_addresses text[] not null default '{}',
  cc_addresses text[] not null default '{}',
  subject text,
  body_text text,
  attachment_metadata jsonb not null default '[]'::jsonb,
  sent_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index customer_email_timeline_idx on public.customer_email_messages (customer_id, sent_at desc);
create index customer_email_thread_idx on public.customer_email_messages (gmail_thread_id);

create table public.gmail_sync_state (
  mailbox text primary key,
  last_history_id text,
  last_synced_at timestamptz,
  last_result jsonb,
  updated_at timestamptz not null default now()
);

create table public.inquiry_rate_limits (
  fingerprint_hash text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 1,
  primary key (fingerprint_hash, window_started_at)
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end;
$$;

create trigger customers_touch before update on public.customers for each row execute function public.touch_updated_at();
create trigger followups_touch before update on public.followups for each row execute function public.touch_updated_at();
create trigger quotes_touch before update on public.quotes for each row execute function public.touch_updated_at();
create trigger deals_touch before update on public.deals for each row execute function public.touch_updated_at();
create trigger gmail_sync_touch before update on public.gmail_sync_state for each row execute function public.touch_updated_at();

create or replace function public.suggest_customer_priority(
  p_company text, p_customer_type public.customer_type, p_budget numeric,
  p_quantity integer, p_destination_port text, p_purchase_timing text,
  p_contact text, p_request_full_vin boolean
)
returns public.crm_priority
language plpgsql immutable set search_path = public as $$
declare score integer := 0;
begin
  if nullif(trim(coalesce(p_company, '')), '') is not null then score := score + 2; end if;
  if p_customer_type in ('DEALER', 'IMPORTER', 'FLEET') then score := score + 2; end if;
  if p_budget is not null then score := score + 1; end if;
  if coalesce(p_quantity, 0) > 1 then score := score + 2; end if;
  if nullif(trim(coalesce(p_destination_port, '')), '') is not null then score := score + 1; end if;
  if nullif(trim(coalesce(p_purchase_timing, '')), '') is not null then score := score + 1; end if;
  if nullif(trim(coalesce(p_contact, '')), '') is not null then score := score + 1; end if;
  -- A VIN request is useful context but intentionally never raises the score by itself.
  return case when score >= 7 then 'HIGH'::public.crm_priority when score >= 4 then 'MEDIUM'::public.crm_priority else 'LOW'::public.crm_priority end;
end;
$$;

create or replace function public.submit_public_inquiry(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_inquiry_id uuid;
  v_email text := nullif(lower(trim(payload ->> 'email')), '');
  v_contact text := nullif(trim(payload ->> 'whatsapp_or_phone'), '');
  v_type public.customer_type := coalesce(nullif(payload ->> 'customer_type', ''), 'OTHER')::public.customer_type;
  v_priority public.crm_priority;
  v_followup_days integer;
begin
  if length(trim(coalesce(payload ->> 'name', ''))) < 2 or length(trim(coalesce(payload ->> 'country', ''))) < 2 then
    raise exception 'Name and country are required';
  end if;
  if v_email is null and v_contact is null then raise exception 'Email or phone is required'; end if;

  v_priority := public.suggest_customer_priority(
    payload ->> 'company', v_type, nullif(payload ->> 'target_budget', '')::numeric,
    coalesce(nullif(payload ->> 'quantity', '')::integer, 1), payload ->> 'destination_port',
    payload ->> 'purchase_timing', coalesce(v_email, v_contact), coalesce((payload ->> 'request_full_vin')::boolean, false)
  );

  if v_email is not null then
    select id into v_customer_id from public.customers where lower(email) = v_email limit 1;
  end if;
  if v_customer_id is null then
    insert into public.customers (
      company, country, city, customer_type, contact_name, email, whatsapp,
      priority, suggested_priority, requirements, budget, quantity,
      destination_port, purchase_timing, last_contact_at
    ) values (
      nullif(trim(payload ->> 'company'), ''), trim(payload ->> 'country'), nullif(trim(payload ->> 'city'), ''),
      v_type, trim(payload ->> 'name'), v_email, v_contact, v_priority, v_priority,
      nullif(trim(coalesce(payload ->> 'message', payload ->> 'preferred_model')), ''),
      nullif(payload ->> 'target_budget', '')::numeric, coalesce(nullif(payload ->> 'quantity', '')::integer, 1),
      nullif(trim(payload ->> 'destination_port'), ''), nullif(trim(payload ->> 'purchase_timing'), ''), now()
    ) returning id into v_customer_id;
  else
    update public.customers set
      company = coalesce(nullif(trim(payload ->> 'company'), ''), company),
      country = coalesce(nullif(trim(payload ->> 'country'), ''), country),
      city = coalesce(nullif(trim(payload ->> 'city'), ''), city),
      whatsapp = coalesce(v_contact, whatsapp),
      last_contact_at = now(),
      suggested_priority = v_priority
    where id = v_customer_id;
  end if;

  insert into public.inquiries (
    customer_id, name, company, country, city, customer_type, email, whatsapp_or_phone,
    vehicle_id, stock_id, preferred_model, quantity, target_budget, destination_port,
    purchase_timing, message, request_full_vin, language, source_page
  ) values (
    v_customer_id, trim(payload ->> 'name'), nullif(trim(payload ->> 'company'), ''), trim(payload ->> 'country'),
    nullif(trim(payload ->> 'city'), ''), v_type, v_email, v_contact,
    nullif(payload ->> 'vehicle_id', '')::uuid, nullif(trim(payload ->> 'stock_id'), ''),
    nullif(trim(payload ->> 'preferred_model'), ''), coalesce(nullif(payload ->> 'quantity', '')::integer, 1),
    nullif(payload ->> 'target_budget', '')::numeric, nullif(trim(payload ->> 'destination_port'), ''),
    nullif(trim(payload ->> 'purchase_timing'), ''), nullif(trim(payload ->> 'message'), ''),
    coalesce((payload ->> 'request_full_vin')::boolean, false), coalesce(nullif(payload ->> 'language', ''), 'en'),
    nullif(trim(payload ->> 'source_page'), '')
  ) returning id into v_inquiry_id;

  v_followup_days := case when v_priority = 'HIGH' then 1 when v_priority = 'MEDIUM' then 3 else 7 end;
  insert into public.followups (customer_id, inquiry_id, due_at, priority, note)
  values (v_customer_id, v_inquiry_id, now() + make_interval(days => v_followup_days), v_priority, 'Automatic follow-up suggestion from public inquiry');
  update public.customers set next_followup_at = now() + make_interval(days => v_followup_days) where id = v_customer_id;
  return v_inquiry_id;
end;
$$;

revoke all on function public.submit_public_inquiry(jsonb) from public, anon, authenticated;
grant execute on function public.submit_public_inquiry(jsonb) to service_role;

create or replace function public.archive_expired_sold_vehicles()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare affected integer;
begin
  update public.vehicles set publication_status = 'ARCHIVED', archive_at = now()
  where publication_status = 'SOLD' and sold_at <= now() - interval '90 days';
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.archive_expired_sold_vehicles() from public, anon;
grant execute on function public.archive_expired_sold_vehicles() to authenticated, service_role;

create or replace function public.merge_customers(p_primary_id uuid, p_duplicate_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare primary_email text; duplicate_email text;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_primary_id = p_duplicate_id then raise exception 'Customers must be different'; end if;
  select email into primary_email from public.customers where id = p_primary_id for update;
  select email into duplicate_email from public.customers where id = p_duplicate_id for update;
  if primary_email is null or duplicate_email is null or lower(primary_email) = lower(duplicate_email) then
    raise exception 'Merge is only for separately reviewed customers with different emails';
  end if;
  update public.inquiries set customer_id = p_primary_id where customer_id = p_duplicate_id;
  update public.followups set customer_id = p_primary_id where customer_id = p_duplicate_id;
  update public.quotes set customer_id = p_primary_id where customer_id = p_duplicate_id;
  update public.deals set customer_id = p_primary_id where customer_id = p_duplicate_id;
  update public.customer_email_messages set customer_id = p_primary_id where customer_id = p_duplicate_id;
  update public.customers p set
    backup_email = coalesce(p.backup_email, duplicate_email),
    notes = concat_ws(E'\n', p.notes, 'Merged customer ' || p_duplicate_id::text || ' after administrator review.'),
    updated_at = now()
  where p.id = p_primary_id;
  delete from public.customers where id = p_duplicate_id;
  return p_primary_id;
end;
$$;

revoke all on function public.merge_customers(uuid, uuid) from public, anon;
grant execute on function public.merge_customers(uuid, uuid) to authenticated, service_role;

create or replace view public.public_vehicle_catalog
with (security_invoker = true)
as
select
  v.id, v.stock_id, v.brand, v.model, v.year, v.body_type, v.fuel_type, v.steering,
  v.mileage, v.exterior_color, v.interior_color, v.condition, v.sourcing_status,
  v.publication_status, v.public_reference_fob_price_usd, v.vehicle_notes_en,
  v.vehicle_notes_ru, v.masked_vin, v.featured, v.published_at, v.sold_at,
  coalesce(
    jsonb_agg(jsonb_build_object('id', i.id, 'url', i.public_url, 'alt', i.alt_text_en, 'sort_order', i.sort_order)
      order by i.sort_order) filter (where i.id is not null), '[]'::jsonb
  ) as images
from public.vehicles v
left join public.vehicle_images i on i.vehicle_id = v.id
where v.publication_status = 'PUBLISHED'
   or (v.publication_status = 'SOLD' and v.sold_at > now() - interval '90 days')
group by v.id;

alter table public.admin_allowlist enable row level security;
alter table public.vehicles enable row level security;
alter table public.vehicle_images enable row level security;
alter table public.customers enable row level security;
alter table public.inquiries enable row level security;
alter table public.followups enable row level security;
alter table public.quotes enable row level security;
alter table public.deals enable row level security;
alter table public.customer_email_messages enable row level security;
alter table public.gmail_sync_state enable row level security;
alter table public.inquiry_rate_limits enable row level security;

create policy admin_read_own_allowlist on public.admin_allowlist for select to authenticated using (public.is_admin());
create policy admin_all_vehicles on public.vehicles for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy public_visible_vehicles on public.vehicles for select to anon using (
  publication_status = 'PUBLISHED' or (publication_status = 'SOLD' and sold_at > now() - interval '90 days')
);
create policy admin_all_vehicle_images on public.vehicle_images for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy public_visible_vehicle_images on public.vehicle_images for select to anon using (
  exists (select 1 from public.vehicles v where v.id = vehicle_id and (v.publication_status = 'PUBLISHED' or (v.publication_status = 'SOLD' and v.sold_at > now() - interval '90 days')))
);
create policy admin_all_customers on public.customers for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all_inquiries on public.inquiries for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all_followups on public.followups for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all_quotes on public.quotes for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all_deals on public.deals for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all_email_messages on public.customer_email_messages for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all_gmail_sync on public.gmail_sync_state for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select (id, stock_id, brand, model, year, body_type, fuel_type, steering, mileage, exterior_color,
  interior_color, condition, sourcing_status, publication_status, public_reference_fob_price_usd,
  vehicle_notes_en, vehicle_notes_ru, masked_vin, featured, published_at, sold_at) on public.vehicles to anon;
grant select on public.vehicle_images, public.public_vehicle_catalog to anon;
grant select on public.admin_allowlist to authenticated;
grant select, insert, update, delete on public.vehicles, public.vehicle_images, public.customers, public.inquiries,
  public.followups, public.quotes, public.deals, public.customer_email_messages, public.gmail_sync_state to authenticated;
grant select on public.public_vehicle_catalog to authenticated;
grant all on all tables in schema public to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vehicle-images', 'vehicle-images', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy admin_view_vehicle_objects on storage.objects for select to authenticated using (bucket_id = 'vehicle-images' and public.is_admin());
create policy admin_upload_vehicle_objects on storage.objects for insert to authenticated with check (bucket_id = 'vehicle-images' and public.is_admin());
create policy admin_update_vehicle_objects on storage.objects for update to authenticated using (bucket_id = 'vehicle-images' and public.is_admin()) with check (bucket_id = 'vehicle-images' and public.is_admin());
create policy admin_delete_vehicle_objects on storage.objects for delete to authenticated using (bucket_id = 'vehicle-images' and public.is_admin());

-- Supabase Cron is optional locally, but hosted projects can run the lifecycle job daily.
create extension if not exists pg_cron;
select cron.schedule(
  'roadreach-archive-sold-daily',
  '15 1 * * *',
  $$select public.archive_expired_sold_vehicles();$$
)
where not exists (select 1 from cron.job where jobname = 'roadreach-archive-sold-daily');

comment on view public.public_vehicle_catalog is 'Safe anonymous boundary. Never add full_vin, RMB costs, expected profit/margin, or CRM fields.';
comment on function public.submit_public_inquiry(jsonb) is 'Service-role-only public inquiry transaction called by the submit-inquiry Edge Function.';
