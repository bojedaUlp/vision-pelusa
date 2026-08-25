-- Datos de ejemplo para probar la app con Supabase
-- Ejecutar después de schema.sql

insert into public.matches (id, slug, title, subtitle, venue, played_at, cover_url, status)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'pelusa-vs-lanus',
    'Pelusa vs Lanús',
    'Partido especial en el estadio del club',
    'Estadio Pelusa',
    '2026-08-15T20:30:00-03:00',
    'https://images.unsplash.com/photo-1547347298-4074fc3086f0?auto=format&fit=crop&w=1200&q=80',
    'published'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'pelusa-vs-aldosivi',
    'Pelusa vs Aldosivi',
    'Fecha clave con mucho color y movimiento',
    'Cancha Norte',
    '2026-08-22T19:00:00-03:00',
    'https://images.unsplash.com/photo-1517649763962-0c623066013b?auto=format&fit=crop&w=1200&q=80',
    'published'
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    'pelusa-vs-boca',
    'Pelusa vs Boca',
    'Clásico emocional con gran convocatoria',
    'Estadio Central',
    '2026-08-29T21:00:00-03:00',
    'https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=1200&q=80',
    'published'
  )
on conflict (id) do nothing;

with match_rows as (
  select * from public.matches
)
insert into public.photos (id, match_id, title, sort_order, price, image_url, watermark_url, is_published)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', (select id from match_rows where slug = 'pelusa-vs-lanus'), 'Acción 01', 1, 1500, 'https://images.unsplash.com/photo-1517466787929-bc90951d0974?auto=format&fit=crop&w=900&q=80', 'https://images.unsplash.com/photo-1517466787929-bc90951d0974?auto=format&fit=crop&w=900&q=80', true),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', (select id from match_rows where slug = 'pelusa-vs-lanus'), 'Acción 02', 2, 1800, 'https://images.unsplash.com/photo-1521412644187-c49fa049e84d?auto=format&fit=crop&w=900&q=80', 'https://images.unsplash.com/photo-1521412644187-c49fa049e84d?auto=format&fit=crop&w=900&q=80', true),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', (select id from match_rows where slug = 'pelusa-vs-lanus'), 'Celebración 01', 3, 2200, 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=900&q=80', 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=900&q=80', true),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', (select id from match_rows where slug = 'pelusa-vs-lanus'), 'Aplausos 01', 4, 1700, 'https://images.unsplash.com/photo-1556056504-5c7696c4c28d?auto=format&fit=crop&w=900&q=80', 'https://images.unsplash.com/photo-1556056504-5c7696c4c28d?auto=format&fit=crop&w=900&q=80', true),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', (select id from match_rows where slug = 'pelusa-vs-lanus'), 'Detalle 01', 5, 2100, 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=900&q=80', 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=900&q=80', true),

  ('ffffffff-ffff-4fff-8fff-ffffffffffff', (select id from match_rows where slug = 'pelusa-vs-aldosivi'), 'Juego 01', 1, 1500, 'https://images.unsplash.com/photo-1543353071-873f17a7a088?auto=format&fit=crop&w=900&q=80', 'https://images.unsplash.com/photo-1543353071-873f17a7a088?auto=format&fit=crop&w=900&q=80', true),
  ('12121212-1212-4121-8121-121212121212', (select id from match_rows where slug = 'pelusa-vs-aldosivi'), 'Juego 02', 2, 1600, 'https://images.unsplash.com/photo-1531415074968-036ba1b575da?auto=format&fit=crop&w=900&q=80', 'https://images.unsplash.com/photo-1531415074968-036ba1b575da?auto=format&fit=crop&w=900&q=80', true),
  ('13131313-1313-4131-8131-131313131313', (select id from match_rows where slug = 'pelusa-vs-aldosivi'), 'Gol 01', 3, 1900, 'https://images.unsplash.com/photo-1518604666860-9ed391f76460?auto=format&fit=crop&w=900&q=80', 'https://images.unsplash.com/photo-1518604666860-9ed391f76460?auto=format&fit=crop&w=900&q=80', true),
  ('14141414-1414-4141-8141-141414141414', (select id from match_rows where slug = 'pelusa-vs-aldosivi'), 'Alineación 01', 4, 2000, 'https://images.unsplash.com/photo-1529900748604-07564a03e7a0?auto=format&fit=crop&w=900&q=80', 'https://images.unsplash.com/photo-1529900748604-07564a03e7a0?auto=format&fit=crop&w=900&q=80', true),
  ('15151515-1515-4151-8151-151515151515', (select id from match_rows where slug = 'pelusa-vs-aldosivi'), 'Público 01', 5, 2300, 'https://images.unsplash.com/photo-1517927033932-b3d18e61fb3a?auto=format&fit=crop&w=900&q=80', 'https://images.unsplash.com/photo-1517927033932-b3d18e61fb3a?auto=format&fit=crop&w=900&q=80', true),

  ('16161616-1616-4161-8161-161616161616', (select id from match_rows where slug = 'pelusa-vs-boca'), 'Clásico 01', 1, 2000, 'https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=900&q=80', 'https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=900&q=80', true),
  ('17171717-1717-4171-8171-171717171717', (select id from match_rows where slug = 'pelusa-vs-boca'), 'Clásico 02', 2, 2200, 'https://images.unsplash.com/photo-1517649763962-0c623066013b?auto=format&fit=crop&w=900&q=80', 'https://images.unsplash.com/photo-1517649763962-0c623066013b?auto=format&fit=crop&w=900&q=80', true),
  ('18181818-1818-4181-8181-181818181818', (select id from match_rows where slug = 'pelusa-vs-boca'), 'Festejo 01', 3, 2400, 'https://images.unsplash.com/photo-1547347298-4074fc3086f0?auto=format&fit=crop&w=900&q=80', 'https://images.unsplash.com/photo-1547347298-4074fc3086f0?auto=format&fit=crop&w=900&q=80', true),
  ('19191919-1919-4191-8191-191919191919', (select id from match_rows where slug = 'pelusa-vs-boca'), 'Tensión 01', 4, 2100, 'https://images.unsplash.com/photo-1534158914592-062992fbe900?auto=format&fit=crop&w=900&q=80', 'https://images.unsplash.com/photo-1534158914592-062992fbe900?auto=format&fit=crop&w=900&q=80', true),
  ('20202020-2020-4202-8202-202020202020', (select id from match_rows where slug = 'pelusa-vs-boca'), 'Detalle 02', 5, 2500, 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=900&q=80', 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=900&q=80', true)
on conflict (id) do nothing;

insert into public.price_tiers (id, max_count, amount, sort_order)
values
  ('30000000-0000-4300-8300-000000000000', 1, 1500, 1),
  ('30000000-0000-4300-8300-000000000001', 3, 4200, 2),
  ('30000000-0000-4300-8300-000000000002', 5, 6500, 3),
  ('30000000-0000-4300-8300-000000000003', 10, 12000, 4)
on conflict (id) do nothing;

insert into public.purchases (id, buyer_email, buyer_phone, status, total_amount, created_at)
values
  ('40000000-0000-4400-8400-000000000001', 'juan.perez@gmail.com', '+5491123456789', 'paid', 4200, '2026-08-16T10:30:00-03:00'),
  ('40000000-0000-4400-8400-000000000002', 'maria.lopez@gmail.com', '+5491134567890', 'paid', 6500, '2026-08-18T14:45:00-03:00'),
  ('40000000-0000-4400-8400-000000000003', 'carlos.ramirez@gmail.com', '+5491145678901', 'pending', 1500, '2026-08-20T09:00:00-03:00')
on conflict (id) do nothing;

insert into public.purchase_items (id, purchase_id, photo_id, quantity, unit_price, created_at)
values
  ('50000000-0000-4500-8500-000000000001', '40000000-0000-4400-8400-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 2, 1500, '2026-08-16T10:30:00-03:00'),
  ('50000000-0000-4500-8500-000000000002', '40000000-0000-4400-8400-000000000002', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 1, 2100, '2026-08-18T14:45:00-03:00'),
  ('50000000-0000-4500-8500-000000000003', '40000000-0000-4400-8400-000000000002', 'ffffffff-ffff-4fff-8fff-ffffffffffff', 2, 1500, '2026-08-18T14:45:00-03:00'),
  ('50000000-0000-4500-8500-000000000004', '40000000-0000-4400-8400-000000000003', '16161616-1616-4161-8161-161616161616', 1, 2000, '2026-08-20T09:00:00-03:00')
on conflict (id) do nothing;

insert into public.download_access (id, purchase_id, photo_id, download_url, expires_at, created_at)
values
  ('60000000-0000-4600-8600-000000000001', '40000000-0000-4400-8400-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'https://example.com/download/purchase_1_photo_1.jpg', '2026-09-16T10:30:00-03:00', '2026-08-16T10:30:00-03:00'),
  ('60000000-0000-4600-8600-000000000002', '40000000-0000-4400-8400-000000000002', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'https://example.com/download/purchase_2_photo_1.jpg', '2026-09-18T14:45:00-03:00', '2026-08-18T14:45:00-03:00')
on conflict (id) do nothing;
