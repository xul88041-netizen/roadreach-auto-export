-- Migration: 202609270001_image_derivatives.sql
-- Purpose: Add non-breaking derived image URLs (thumb_url, card_url, detail_url) to vehicle_images
-- and expose them in public_vehicle_catalog view for high-performance delivery.

-- 1. Add nullable columns to public.vehicle_images without altering existing original public_url
alter table public.vehicle_images
  add column if not exists thumb_url text,
  add column if not exists card_url text,
  add column if not exists detail_url text;

comment on column public.vehicle_images.thumb_url is 'Optimized 160px WebP thumbnail URL for gallery and preview grids';
comment on column public.vehicle_images.card_url is 'Optimized 640px WebP card URL for inventory lists';
comment on column public.vehicle_images.detail_url is 'Optimized 1200px WebP detail URL for vehicle hero and gallery zoom';

-- 2. Update public_vehicle_catalog view strictly including derived URLs in images JSON array
-- Maintains all P0/P1 security guarantees:
-- - strictly publication_status = 'PUBLISHED'
-- - strictly excludes full_vin, internal RMB costs, profit margins, and CRM data
-- - with (security_invoker = true)
create or replace view public.public_vehicle_catalog
with (security_invoker = true)
as
select
  v.id, v.stock_id, v.brand, v.model, v.year, v.body_type, v.fuel_type, v.steering,
  v.mileage, v.exterior_color, v.interior_color, v.condition, v.sourcing_status,
  v.publication_status, v.public_reference_fob_price_usd, v.vehicle_notes_en,
  v.vehicle_notes_ru, v.masked_vin, v.featured, v.published_at, v.sold_at,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', i.id,
        'url', i.public_url,
        'thumb_url', i.thumb_url,
        'card_url', i.card_url,
        'detail_url', i.detail_url,
        'alt', i.alt_text_en,
        'sort_order', i.sort_order
      )
      order by i.sort_order
    ) filter (where i.id is not null), '[]'::jsonb
  ) as images
from public.vehicles v
left join public.vehicle_images i on i.vehicle_id = v.id
where v.publication_status = 'PUBLISHED'
group by v.id;

comment on view public.public_vehicle_catalog
is 'Safe anonymous boundary. Returns only PUBLISHED vehicles with responsive derived image URLs. Never exposes full_vin, internal RMB costs, profit margins, or CRM data.';
