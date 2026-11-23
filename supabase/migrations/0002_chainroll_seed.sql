-- =============================================================================
-- ChainRoll — Local Development Seed Data (0002_chainroll_seed.sql)
-- Automatically loaded by Docker Postgres (/docker-entrypoint-initdb.d/)
-- =============================================================================

-- 1. Seed Film Stocks
insert into public.films (id, name, code, iso, frames, active) values
  (1, 'KUB 400',   'KUB 400', 400, 24, true),
  (2, 'ขาวดำ 400', 'BW 400',  400, 24, true),
  (3, 'Night 800', 'NT 800',  800, 24, true),
  (4, 'Warm 160',  'WM 160',  160, 24, false)
on conflict (id) do update
  set name = excluded.name, code = excluded.code, iso = excluded.iso, frames = excluded.frames, active = excluded.active;

-- 2. Seed Photographer & Collector Profiles
insert into public.users (address, wallet_kind, handle, bio, role, streak) values
  ('0x243d88c9ed9a8ce9023e1406182ed593bffe9350', 'injected',    'chainroll.lab',    'ChainRoll Darkroom Admin & Curator on KUB Chain',              'admin', 14),
  ('0x60612433089a707938c149d56e2835f818781140', 'bitkub-next', 'ploy.shoots',      'ถ่ายแสงเช้ากับแม่น้ำเจ้าพระยา · ชอบ KUB 400 กับ Night 800',     'user',  12),
  ('0x60c534789a56e83556fb511420066a901c347704', 'injected',    'bank_35mm',        'ขาวดำ 35mm รอบเจริญกรุง–ทรงวาด · เกรนหนักคือชีวิต',             'user',  8),
  ('0x39b06d9598d7304176895543e78a522a3519e45d', 'bitkub-next', 'oat.charoenkrung', 'เดินถ่ายไฟนีออนตอนดึกหลังเลิกงาน · สะสม 1/1 Prints',           'user',  19),
  ('0x346720534887091b25387482d2092185c5f80283', 'bitkub-next', 'nong.film',        'บันทึกคาเฟ่และโต๊ะทำงานวันละแชะ',                               'user',  5),
  ('0x978a472285401001c70980028024e2b850284c27', 'injected',    'tee.k',            'พอร์ตเทรตหลังเวทีดนตรี · ล้างฟิล์มเองทุกสุดสัปดาห์',            'user',  7),
  ('0xc80f58011572630562624361085513339d7b128a', 'bitkub-next', 'mint_roll',        'นักสะสมภาพฟิล์ม 1/1 บน KUB Chain',                              'user',  3),
  ('0x628084509665417574108280005161977046841f', 'injected',    'ken.bkk',          'Street photography & analog print collector · Bangkok',         'user',  4)
on conflict (address) do nothing;

-- 3. Seed Public Posts (all 6 initial community frames)
insert into public.posts (id, shooter, roll_id, frame, film_id, photo_hash, tx_hash, scene, featured, caption, like_count, created_at) values
  ('p-101', '0x60612433089a707938c149d56e2835f818781140', 14, 7,  1, '0x9f4c81b03e22a7d1c9844e01b6a55f209c88d14a7b33e09112c480a77126e81a', '0x3a91c00214ef98123400a19c2208f7109d443e21f99a1204b88c012345678901', 'nature',   true,  'แสงเย็นริมแม่น้ำเจ้าพระยา รอเรือข้ามฟากเที่ยวสุดท้ายของวัน', 42, now() - interval '38 minutes'),
  ('p-102', '0x60c534789a56e83556fb511420066a901c347704', 11, 19, 2, '0x3b1281b03e22a7d1c9844e01b6a55f209c88d14a7b33e09112c480a77126c09d', '0x4b91c00214ef98123400a19c2208f7109d443e21f99a1204b88c012345678902', 'portrait', false, 'เงาพาดกำแพงตึกแถวเจริญกรุง เที่ยงตรงแดดจัด', 29, now() - interval '115 minutes'),
  ('p-103', '0x39b06d9598d7304176895543e78a522a3519e45d', 16, 23, 3, '0x7a8e81b03e22a7d1c9844e01b6a55f209c88d14a7b33e09112c480a77126441f', '0x5c91c00214ef98123400a19c2208f7109d443e21f99a1204b88c012345678903', 'night',    false, 'ป้ายไฟร้านบะหมี่หลังฝนหยุด 800 เอาอยู่ทุกซอย', 64, now() - interval '240 minutes'),
  ('p-104', '0x346720534887091b25387482d2092185c5f80283', 9,  4,  1, '0x5d2081b03e22a7d1c9844e01b6a55f209c88d14a7b33e09112c480a7712692b4', '0x6d91c00214ef98123400a19c2208f7109d443e21f99a1204b88c012345678904', 'indoor',   false, 'กาแฟแก้วแรกก่อนเริ่มงาน โต๊ะไม้ริมหน้าต่างบานเดิม', 18, now() - interval '410 minutes'),
  ('p-105', '0x60612433089a707938c149d56e2835f818781140', 12, 24, 3, '0x8e1181b03e22a7d1c9844e01b6a55f209c88d14a7b33e09112c480a77126a012', '0x7e91c00214ef98123400a19c2208f7109d443e21f99a1204b88c012345678905', 'night',    true,  'เฟรมสุดท้ายของม้วนที่สถานีหัวลำโพง', 51, now() - interval '760 minutes'),
  ('p-106', '0x978a472285401001c70980028024e2b850284c27', 8,  12, 2, '0x1c9981b03e22a7d1c9844e01b6a55f209c88d14a7b33e09112c480a77126b771', '0x8f91c00214ef98123400a19c2208f7109d443e21f99a1204b88c012345678906', 'portrait', false, 'ขาวดำเกรนหนัก ๆ ล้างเสร็จแล้วคุ้มที่รอหนึ่งชั่วโมง', 33, now() - interval '1320 minutes')
on conflict (id) do nothing;

-- 4. Seed 1/1 Film Print NFTs
insert into public.prints (token_id, post_id, photo_hash, roll_id, frame, film_id, photographer, owner, ask_price_kub, last_sale_kub, mint_tx_hash, history) values
  (1, 'p-101', '0x9f4c81b03e22a7d1c9844e01b6a55f209c88d14a7b33e09112c480a77126e81a', 14, 7,  1, '0x60612433089a707938c149d56e2835f818781140', '0x60612433089a707938c149d56e2835f818781140', 4.5000, null,   '0x8101c00214ef98123400a19c2208f7109d443e21f99a1204b88c012345678901', '[{"id":"ev-102","kind":"offer_made","actor":"0x60c534789a56e83556fb511420066a901c347704","actorHandle":"bank_35mm","amountKub":3.8,"txHash":"0x8201c00214ef98123400a19c2208f7109d443e21f99a1204b88c012345678901","timestamp":1795347720000},{"id":"ev-101","kind":"minted","actor":"0x60612433089a707938c149d56e2835f818781140","actorHandle":"ploy.shoots","amountKub":4.5,"txHash":"0x8101c00214ef98123400a19c2208f7109d443e21f99a1204b88c012345678901","timestamp":1795347000000}]'::jsonb),
  (2, 'p-103', '0x7a8e81b03e22a7d1c9844e01b6a55f209c88d14a7b33e09112c480a77126441f', 16, 23, 3, '0x39b06d9598d7304176895543e78a522a3519e45d', '0xc80f58011572630562624361085513339d7b128a', null,   6.0000, '0x8102c00214ef98123400a19c2208f7109d443e21f99a1204b88c012345678902', '[{"id":"ev-203","kind":"offer_made","actor":"0x628084509665417574108280005161977046841f","actorHandle":"ken.bkk","amountKub":7.5,"txHash":"0x8202c00214ef98123400a19c2208f7109d443e21f99a1204b88c012345678902","timestamp":1795346100000},{"id":"ev-202","kind":"bought","actor":"0xc80f58011572630562624361085513339d7b128a","actorHandle":"mint_roll","amountKub":6.0,"txHash":"0x8199c00214ef98123400a19c2208f7109d443e21f99a1204b88c012345678999","timestamp":1795340400000},{"id":"ev-201","kind":"minted","actor":"0x39b06d9598d7304176895543e78a522a3519e45d","actorHandle":"oat.charoenkrung","amountKub":6.0,"txHash":"0x8102c00214ef98123400a19c2208f7109d443e21f99a1204b88c012345678902","timestamp":1795336200000}]'::jsonb),
  (3, 'p-105', '0x8e1181b03e22a7d1c9844e01b6a55f209c88d14a7b33e09112c480a77126a012', 12, 24, 3, '0x60612433089a707938c149d56e2835f818781140', '0x60612433089a707938c149d56e2835f818781140', 5.2000, null,   '0x8103c00214ef98123400a19c2208f7109d443e21f99a1204b88c012345678903', '[{"id":"ev-301","kind":"minted","actor":"0x60612433089a707938c149d56e2835f818781140","actorHandle":"ploy.shoots","amountKub":5.2,"txHash":"0x8103c00214ef98123400a19c2208f7109d443e21f99a1204b88c012345678903","timestamp":1795312800000}]'::jsonb)
on conflict (token_id) do nothing;

-- 5. Seed Active Escrow Offers
insert into public.print_offers (id, token_id, bidder, amount_kub, status, tx_hash, expires_at) values
  ('off-101', 1, '0x60c534789a56e83556fb511420066a901c347704', 3.8000, 'active', '0x8201c00214ef98123400a19c2208f7109d443e21f99a1204b88c012345678901', now() + interval '48 hours'),
  ('off-100', 1, '0x628084509665417574108280005161977046841f', 3.2000, 'active', '0x8200c00214ef98123400a19c2208f7109d443e21f99a1204b88c012345678900', now() + interval '24 hours'),
  ('off-201', 2, '0x628084509665417574108280005161977046841f', 7.5000, 'active', '0x8202c00214ef98123400a19c2208f7109d443e21f99a1204b88c012345678902', now() + interval '72 hours')
on conflict (id) do nothing;

-- 6. Seed Darkroom Console Audit Log
insert into public.admin_log (id, actor, category, action, target, detail, tx_hash, created_at) values
  ('aud-1', '0x243d88c9ed9a8ce9023e1406182ed593bffe9350', 'contract',   'contract.deploy', 'ChainRoll (0x8a4e…2ED5)', 'Deployed to KUB Testnet (25925) · developDelay=3600s', '0x4b1281b03e22a7d1c9844e01b6a55f209c88d14a7b33e09112c480a77126c001', now() - interval '180 minutes'),
  ('aud-2', '0x243d88c9ed9a8ce9023e1406182ed593bffe9350', 'films',      'film.publish',    'Film #1 · KUB 400',       '24 frames · active=true',                              '0x4b1281b03e22a7d1c9844e01b6a55f209c88d14a7b33e09112c480a77126c002', now() - interval '175 minutes'),
  ('aud-3', '0x243d88c9ed9a8ce9023e1406182ed593bffe9350', 'films',      'film.publish',    'Film #2 · Mono 400',      '24 frames · active=true',                              '0x4b1281b03e22a7d1c9844e01b6a55f209c88d14a7b33e09112c480a77126c003', now() - interval '174 minutes'),
  ('aud-4', '0x243d88c9ed9a8ce9023e1406182ed593bffe9350', 'films',      'film.publish',    'Film #3 · Night 800',     '24 frames · active=true',                              '0x4b1281b03e22a7d1c9844e01b6a55f209c88d14a7b33e09112c480a77126c004', now() - interval '173 minutes'),
  ('aud-5', '0x243d88c9ed9a8ce9023e1406182ed593bffe9350', 'moderation', 'post.hide',       'post-831',                'Spam link in caption',                                 null,                                                                  now() - interval '92 minutes')
on conflict (id) do nothing;
