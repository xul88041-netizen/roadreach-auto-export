import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("1. thumbnail 优先使用 thumb_url, 缺失时回退 public_url", async () => {
  const [vehicleJs, publicJs] = await Promise.all([
    read("assets/vehicle.js"),
    read("assets/public.js")
  ]);

  // vehicle.js thumbnail priority
  assert.match(vehicleJs, /const thumbUrl = img\.thumb_url \|\| img\.url \|\| fallbackImage/u);

  // public.js modal thumbnail priority
  assert.match(publicJs, /img\.thumb_url \|\| img\.url \|\| fallbackImage/u);

  // Simulation test: fallback logic
  const mockImageWithThumb = { thumb_url: "https://example.com/thumb.webp", url: "https://example.com/orig.jpg" };
  const mockImageWithoutThumb = { thumb_url: null, url: "https://example.com/orig.jpg" };
  assert.equal(mockImageWithThumb.thumb_url || mockImageWithThumb.url, "https://example.com/thumb.webp");
  assert.equal(mockImageWithoutThumb.thumb_url || mockImageWithoutThumb.url, "https://example.com/orig.jpg");
});

test("2. card 优先使用 card_url, 缺失时回退 public_url", async () => {
  const publicJs = await read("assets/public.js");
  assert.match(publicJs, /primaryImage\?\.card_url \|\| primaryImage\?\.url \|\| fallbackImage/u);

  // Simulation test
  const mockWithCard = { card_url: "https://example.com/card.webp", url: "https://example.com/orig.jpg" };
  const mockWithoutCard = { card_url: null, url: "https://example.com/orig.jpg" };
  assert.equal(mockWithCard.card_url || mockWithCard.url, "https://example.com/card.webp");
  assert.equal(mockWithoutCard.card_url || mockWithoutCard.url, "https://example.com/orig.jpg");
});

test("3. detail main 优先使用 detail_url, 缺失时回退 public_url", async () => {
  const [vehicleJs, publicJs] = await Promise.all([
    read("assets/vehicle.js"),
    read("assets/public.js")
  ]);

  // vehicle.js main image priority
  assert.match(vehicleJs, /imgObj\.detail_url \|\| imgObj\.url \|\| fallbackImage/u);

  // public.js modal main image priority
  assert.match(publicJs, /images\[0\]\?\.detail_url \|\| images\[0\]\?\.url/u);
  assert.match(publicJs, /images\[currentIdx\]\?\.detail_url \|\| images\[currentIdx\]\?\.url/u);
});

test("4 & 5. 增量 migration 保留原有 original public_url, 字段均为 nullable", async () => {
  const migrationSql = await read("supabase/migrations/202609270001_image_derivatives.sql");

  // Columns added with nullable and if not exists
  assert.match(migrationSql, /add column if not exists thumb_url text/u);
  assert.match(migrationSql, /add column if not exists card_url text/u);
  assert.match(migrationSql, /add column if not exists detail_url text/u);

  // Must NOT drop public_url or alter table destructively
  assert.doesNotMatch(migrationSql, /drop column/iu);
  assert.doesNotMatch(migrationSql, /drop table/iu);

  // public_url is retained in the view
  assert.match(migrationSql, /'url',\s*i\.public_url/u);
  assert.match(migrationSql, /'thumb_url',\s*i\.thumb_url/u);
  assert.match(migrationSql, /'card_url',\s*i\.card_url/u);
  assert.match(migrationSql, /'detail_url',\s*i\.detail_url/u);
});

test("6. 首图配置 fetchpriority=high 与 loading=eager", async () => {
  const [vehicleHtml, vehicleJs, publicJs] = await Promise.all([
    read("vehicle.html"),
    read("assets/vehicle.js"),
    read("assets/public.js")
  ]);

  // vehicle.html default markup
  assert.match(vehicleHtml, /id="detailMainImage"[^>]*fetchpriority="high"/u);
  assert.match(vehicleHtml, /id="detailMainImage"[^>]*loading="eager"/u);

  // vehicle.js dynamic setup
  assert.match(vehicleJs, /mainImg\.setAttribute\("fetchpriority",\s*"high"\)/u);
  assert.match(vehicleJs, /mainImg\.setAttribute\("loading",\s*"eager"\)/u);

  // public.js modal main image
  assert.match(publicJs, /id="modalMainImage"[^>]*fetchpriority="high"/u);
  assert.match(publicJs, /id="modalMainImage"[^>]*loading="eager"/u);
});

test("7 & 8. 缩略图配置 loading=lazy 与 decoding=async, 附带固定尺寸", async () => {
  const [vehicleJs, publicJs] = await Promise.all([
    read("assets/vehicle.js"),
    read("assets/public.js")
  ]);

  // vehicle.js gallery thumbnails
  assert.match(vehicleJs, /width="74"\s+height="52"\s+loading="lazy"\s+decoding="async"/u);

  // public.js modal thumbnails
  assert.match(publicJs, /width="74"\s+height="52"\s+loading="lazy"\s+decoding="async"/u);
});

test("9. 首页卡片配置 decoding=async 与 loading=lazy, 附带固定尺寸", async () => {
  const publicJs = await read("assets/public.js");
  assert.match(publicJs, /width="360"\s+height="240"\s+loading="lazy"\s+decoding="async"/u);
});

test("10. fallback 不再引用 737KB SVG, 改用轻量 < 30KB vehicle-fallback.webp", async () => {
  const [vehicleHtml, vehicleJs, publicJs] = await Promise.all([
    read("vehicle.html"),
    read("assets/vehicle.js"),
    read("assets/public.js")
  ]);

  // No active references to rr-0001-cover.svg in production frontend code
  assert.doesNotMatch(vehicleHtml, /assets\/rr-0001-cover\.svg/u);
  assert.doesNotMatch(vehicleJs, /assets\/rr-0001-cover\.svg/u);
  assert.doesNotMatch(publicJs, /assets\/rr-0001-cover\.svg/u);

  // Must reference vehicle-fallback.webp
  assert.match(vehicleHtml, /assets\/vehicle-fallback\.webp/u);
  assert.match(vehicleJs, /assets\/vehicle-fallback\.webp/u);
  assert.match(publicJs, /assets\/vehicle-fallback\.webp/u);

  // Physical file exists and is strictly under 30 KB
  const fileStat = await stat(new URL("../assets/vehicle-fallback.webp", import.meta.url));
  const sizeKb = fileStat.size / 1024;
  assert.ok(sizeKb < 30, `vehicle-fallback.webp size (${sizeKb.toFixed(2)} KB) must be under 30 KB`);
  assert.ok(sizeKb > 1, `vehicle-fallback.webp size (${sizeKb.toFixed(2)} KB) must be valid non-empty file`);
});

test("11. public_vehicle_catalog 不暴露任何内部敏感与 CRM 字段", async () => {
  const sql = await read("supabase/migrations/202609270001_image_derivatives.sql");
  const viewMatch = sql.match(/create or replace view public\.public_vehicle_catalog[\s\S]+?group by v\.id;/u);
  assert.ok(viewMatch, "view must exist");
  const viewSql = viewMatch[0];

  for (const forbidden of [
    "full_vin",
    "internal_vehicle_cost_rmb",
    "total_other_cost_rmb",
    "target_profit_rmb",
    "suggested_fob_price_usd",
    "expected_profit_rmb",
    "expected_margin",
    "customer_email_messages"
  ]) {
    assert.doesNotMatch(viewSql, new RegExp(`\\b${forbidden}\\b`, "u"), `view must not expose ${forbidden}`);
  }
});

test("12. public_vehicle_catalog 严格限制只显示 PUBLISHED 车辆", async () => {
  const sql = await read("supabase/migrations/202609270001_image_derivatives.sql");
  assert.match(sql, /where v\.publication_status = 'PUBLISHED'/u);
  assert.doesNotMatch(sql, /publication_status = 'SOLD'/u);
  assert.doesNotMatch(sql, /publication_status = 'ARCHIVED'/u);
  assert.doesNotMatch(sql, /publication_status = 'DRAFT'/u);
});

test("13. CSS 显式定义 aspect-ratio 防止累积布局位移 (CLS)", async () => {
  const css = await read("assets/styles.css");
  assert.match(css, /\.vehicle-image\{[^}]*aspect-ratio:3 \/ 2/u);
  assert.match(css, /\.vehicle-image img\{[^}]*aspect-ratio:3 \/ 2/u);
  assert.match(css, /\.detail-gallery-main\{[^}]*aspect-ratio:3 \/ 2/u);
  assert.match(css, /\.detail-gallery-main img\{[^}]*aspect-ratio:3 \/ 2/u);
  assert.match(css, /\.thumb-btn\{[^}]*aspect-ratio:74 \/ 52/u);
  assert.match(css, /\.thumb-btn img\{[^}]*aspect-ratio:74 \/ 52/u);
});

test("14. 向后兼容性：当 thumb_url/card_url/detail_url 全为 NULL 时，前端必须 100% 回退使用 public_url", async () => {
  const [vehicleJs, publicJs, migrationSql] = await Promise.all([
    read("assets/vehicle.js"),
    read("assets/public.js"),
    read("supabase/migrations/202609270001_image_derivatives.sql")
  ]);

  // Schema check: columns must be nullable without default constraints
  assert.match(migrationSql, /add column if not exists thumb_url text/u);
  assert.match(migrationSql, /add column if not exists card_url text/u);
  assert.match(migrationSql, /add column if not exists detail_url text/u);
  assert.doesNotMatch(migrationSql, /thumb_url text not null/iu);
  assert.doesNotMatch(migrationSql, /card_url text not null/iu);
  assert.doesNotMatch(migrationSql, /detail_url text not null/iu);

  // Simulated row where all derived fields are NULL (pre-migration or legacy data)
  const legacyImage = {
    id: "legacy-img-uuid-001",
    url: "https://smjbzjzsmmisdrmdfjby.supabase.co/storage/v1/object/public/vehicle-images/test/legacy-master.jpg",
    thumb_url: null,
    card_url: null,
    detail_url: null,
    alt: "Legacy vehicle photo",
    sort_order: 0
  };

  // 1. Detail Main image fallback contract
  const resolvedDetailMain = legacyImage.detail_url || legacyImage.url || "assets/vehicle-fallback.webp";
  assert.equal(resolvedDetailMain, legacyImage.url, "detail main must fall back to original public_url");

  // 2. Detail Thumbnails fallback contract
  const resolvedThumb = legacyImage.thumb_url || legacyImage.url || "assets/vehicle-fallback.webp";
  assert.equal(resolvedThumb, legacyImage.url, "thumbnail must fall back to original public_url");

  // 3. Homepage Card fallback contract
  const resolvedCard = legacyImage.card_url || legacyImage.url || "assets/vehicle-fallback.webp";
  assert.equal(resolvedCard, legacyImage.url, "card must fall back to original public_url");

  // 4. Ensure srcset is NOT generated when derived URLs are null (prevents browser malformed srcset errors)
  assert.match(publicJs, /if \(primaryImage\?\.card_url && primaryImage\?\.detail_url\)/u);
  assert.match(vehicleJs, /if \(imgObj\.card_url && imgObj\.detail_url\)/u);

  // 5. Ultimate fallback if even url is null or image completely fails
  const emptyImage = { thumb_url: null, card_url: null, detail_url: null, url: null };
  const fallbackResult = emptyImage.card_url || emptyImage.url || "assets/vehicle-fallback.webp";
  assert.equal(fallbackResult, "assets/vehicle-fallback.webp");
});

test("15. Storage 存储策略验证：vehicle-images 桶为 public=true，天然支持匿名 GET 读取 WebP 派生图", async () => {
  const sql = await read("supabase/migrations/202608160001_admin_v1.sql");
  const bucketMatch = sql.match(/insert into storage\.buckets[\s\S]+?values\s*\('vehicle-images',\s*'vehicle-images',\s*true[\s\S]+?on conflict/u);
  assert.ok(bucketMatch, "vehicle-images bucket definition must exist in baseline migration");
  const bucketSql = bucketMatch[0];

  // Bucket is explicitly configured as public
  assert.match(bucketSql, /'vehicle-images',\s*'vehicle-images',\s*true/u);

  // Allowed mime types explicitly include webp
  assert.match(bucketSql, /image\/webp/u);
});

test("16. Release Manifest 契约测试：结构规范、无敏感字段、原图及派生路径确定性绑定", async () => {
  const manifestRaw = await read("scripts/image_derivatives_manifest.json");
  const manifest = JSON.parse(manifestRaw);

  assert.equal(Array.isArray(manifest), true);
  assert.equal(manifest.length, 14, "Manifest must cover all 14 PUBLISHED vehicle images");

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  for (const item of manifest) {
    assert.match(item.vehicle_id, uuidRegex, "vehicle_id must be valid UUID");
    assert.match(item.vehicle_image_id, uuidRegex, "vehicle_image_id must be valid UUID");
    assert.ok(item.stock_id, "stock_id must be present");
    assert.match(item.original_url, /^https:\/\/smjbzjzsmmisdrmdfjby\.supabase\.co\/storage\/v1\/object\/public\/vehicle-images\//u);

    // Derived paths must match <vehicle_uuid>/derived/<type>/<image-id>.webp
    assert.equal(item.thumb_object_path, `${item.vehicle_id}/derived/thumb/${item.vehicle_image_id}.webp`);
    assert.equal(item.card_object_path, `${item.vehicle_id}/derived/card/${item.vehicle_image_id}.webp`);
    assert.equal(item.detail_object_path, `${item.vehicle_id}/derived/detail/${item.vehicle_image_id}.webp`);
  }

  // Strictly omit secrets, service keys, tokens, VIN, costs
  for (const forbidden of ["service_role", "bearer", "secret", "token", "full_vin", "internal_vehicle_cost_rmb", "target_profit_rmb"]) {
    assert.doesNotMatch(manifestRaw, new RegExp(`\\b${forbidden}\\b`, "i"), `manifest must not contain ${forbidden}`);
  }
});

test("17. 确定性派生生成器脚本契约测试：规格固定、质量锁定、小图禁放大、不直传生产", async () => {
  const scriptContent = await read("scripts/generate_image_derivatives.py");

  // Fixed widths
  assert.match(scriptContent, /process_single_derivative\(im,\s*160,\s*75,\s*thumb_path\)/u);
  assert.match(scriptContent, /process_single_derivative\(im,\s*640,\s*80,\s*card_path\)/u);
  assert.match(scriptContent, /process_single_derivative\(im,\s*1200,\s*82,\s*detail_path\)/u);

  // No upscaling logic
  assert.match(scriptContent, /target_w\s*=\s*min\(target_width,\s*orig_w\)/u);

  // Never direct upload to production
  assert.doesNotMatch(scriptContent, /\.upload\(/u);
  assert.doesNotMatch(scriptContent, /service_role/iu);
});
