-- Migration: 202609260001_security_hardening.sql
-- Description: Security hardening for public catalog boundary, atomic inquiry rate limiting, and anon visibility isolation.
-- Idempotent and non-destructive: Safe to run on live production databases with existing records.

-- 1. Atomic Rate Limit Function (eliminates concurrency bypass race condition)
create or replace function public.check_inquiry_rate_limit(
  p_fingerprint_hash text,
  p_window_started_at timestamptz,
  p_max_requests integer default 5
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  insert into public.inquiry_rate_limits (fingerprint_hash, window_started_at, request_count)
  values (p_fingerprint_hash, p_window_started_at, 1)
  on conflict (fingerprint_hash, window_started_at)
  do update set request_count = public.inquiry_rate_limits.request_count + 1
  returning request_count into v_count;

  -- Low-probability periodic cleanup of expired windows (> 24 hours)
  if random() < 0.02 then
    delete from public.inquiry_rate_limits where window_started_at < now() - interval '1 day';
  end if;

  return v_count <= p_max_requests;
end;
$$;

-- Enforce strict least privilege on rate limiting RPC:
-- Revoke execution from anonymous browsers and ordinary authenticated users.
revoke all on function public.check_inquiry_rate_limit(text, timestamptz, integer) from public, anon, authenticated;
-- Grant execution solely to service_role (used securely by the submit-inquiry Edge Function).
grant execute on function public.check_inquiry_rate_limit(text, timestamptz, integer) to service_role;

comment on function public.check_inquiry_rate_limit(text, timestamptz, integer)
is 'Atomic sliding-window inquiry rate limiter. Accessible only to service_role via backend Edge Function.';

-- 2. Restrict Public Catalog View Strictly to PUBLISHED Vehicles Only
-- (SOLD, ARCHIVED, and DRAFT vehicles are strictly excluded from the public showroom)
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
group by v.id;

comment on view public.public_vehicle_catalog
is 'Safe anonymous boundary. Returns only PUBLISHED vehicles. Never exposes full_vin, internal RMB costs, profit margins, or CRM data.';

-- 3. Idempotently Update Anonymous RLS Policies on vehicles and vehicle_images
drop policy if exists public_visible_vehicles on public.vehicles;
create policy public_visible_vehicles on public.vehicles for select to anon using (
  publication_status = 'PUBLISHED'
);

drop policy if exists public_visible_vehicle_images on public.vehicle_images;
create policy public_visible_vehicle_images on public.vehicle_images for select to anon using (
  exists (select 1 from public.vehicles v where v.id = vehicle_id and v.publication_status = 'PUBLISHED')
);
