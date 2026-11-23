-- =============================================================================
-- ChainRoll — Supabase Postgres Schema & Row Level Security (M3b / M4 / 1-of-1 Prints)
-- Domain: https://chainroll.art · Chain: KUB Chain (96 Mainnet / 25925 Testnet)
-- =============================================================================

-- 1. Users & Photographer Profiles
create table if not exists public.users (
  address       text primary key check (address ~ '^0x[0-9a-f]{40}$'),
  wallet_kind   text not null default 'injected' check (wallet_kind in ('bitkub-next', 'injected', 'walletconnect', 'dev')),
  handle        text unique check (handle is null or handle ~ '^[a-z0-9._-]{2,24}$'),
  bio           text not null default '' check (char_length(bio) <= 160),
  avatar_url    text,
  role          text not null default 'user' check (role in ('user', 'curator', 'moderator', 'admin')),
  streak        integer not null default 0,
  banned_at     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 2. Film Stocks (mirrored from ChainRoll.getFilm)
create table if not exists public.films (
  id            smallint primary key,
  name          text not null,
  code          text not null,
  iso           smallint not null default 400,
  frames        smallint not null default 24 check (frames between 1 and 72),
  lut_url       text,
  is_limited    boolean not null default false,
  supply        integer,
  season        text,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- 3. Rolls (mirrored from ChainRoll events: RollClaimed / Developed)
create table if not exists public.rolls (
  id            bigint primary key,
  chain_id      integer not null default 96,
  owner         text not null references public.users(address) on delete cascade,
  film_id       smallint not null references public.films(id),
  frames        smallint not null default 24,
  frames_used   smallint not null default 0,
  developed_at  timestamptz,
  ready_at      timestamptz,
  claim_tx_hash text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_rolls_owner on public.rolls(owner);

-- 4. Shots (1 shot = 1 tx on KUB Chain; R2 object remains private until developed & posted)
create table if not exists public.shots (
  id            uuid primary key default gen_random_uuid(),
  roll_id       bigint not null references public.rolls(id) on delete cascade,
  frame         smallint not null check (frame between 1 and 72),
  photo_hash    text not null unique check (photo_hash ~ '^0x[0-9a-f]{64}$'),
  r2_key        text,
  tx_hash       text,
  status        text not null default 'pending' check (status in ('pending', 'confirmed', 'failed')),
  created_at    timestamptz not null default now(),
  unique (roll_id, frame)
);

create index if not exists idx_shots_roll on public.shots(roll_id);

-- 5. Public Feed Posts (opt-in from developed Contact Sheet)
create table if not exists public.posts (
  id            text primary key,
  shot_id       uuid references public.shots(id) on delete cascade,
  shooter       text not null references public.users(address) on delete cascade,
  roll_id       bigint not null,
  frame         smallint not null,
  film_id       smallint not null,
  photo_hash    text not null unique,
  tx_hash       text,
  r2_public_url text,
  scene         text not null default 'nature',
  featured      boolean not null default false,
  caption       text not null default '' check (char_length(caption) <= 240),
  visibility    text not null default 'public' check (visibility in ('public', 'unlisted', 'hidden')),
  like_count    integer not null default 0,
  hidden_at     timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists idx_posts_shooter on public.posts(shooter);
create index if not exists idx_posts_created_at on public.posts(created_at desc);

-- 6. Likes
create table if not exists public.likes (
  post_id       text not null references public.posts(id) on delete cascade,
  user_address  text not null references public.users(address) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (post_id, user_address)
);

-- 7. Moderation Reports
create table if not exists public.reports (
  id            uuid primary key default gen_random_uuid(),
  post_id       text not null references public.posts(id) on delete cascade,
  reporter      text not null,
  reason        text not null check (reason in ('nsfw', 'spam', 'copyright', 'harassment')),
  note          text,
  ai_confidence smallint check (ai_confidence is null or ai_confidence between 0 and 100),
  status        text not null default 'pending' check (status in ('pending', 'approved', 'hidden', 'banned')),
  resolved_by   text,
  resolved_at   timestamptz,
  created_at    timestamptz not null default now()
);

-- 8. 1/1 Film Print NFTs (mirrored from ChainRollPrints.sol)
create table if not exists public.prints (
  token_id         bigint primary key,
  post_id          text not null unique references public.posts(id) on delete cascade,
  photo_hash       text not null unique,
  roll_id          bigint not null,
  frame            smallint not null,
  film_id          smallint not null,
  photographer     text not null references public.users(address),
  owner            text not null references public.users(address),
  ask_price_kub    numeric(20, 4),
  last_sale_kub    numeric(20, 4),
  royalty_bps      smallint not null default 500,
  protocol_fee_bps smallint not null default 250,
  mint_tx_hash     text not null,
  history          jsonb not null default '[]'::jsonb,
  minted_at        timestamptz not null default now()
);

create index if not exists idx_prints_owner on public.prints(owner);

-- 9. Escrow Offers on 1/1 Prints (mirrored from ChainRollPrints.sol)
create table if not exists public.print_offers (
  id            text primary key,
  token_id      bigint not null references public.prints(token_id) on delete cascade,
  bidder        text not null references public.users(address),
  amount_kub    numeric(20, 4) not null check (amount_kub > 0),
  status        text not null default 'active' check (status in ('active', 'accepted', 'cancelled', 'outbid', 'expired')),
  tx_hash       text not null,
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_print_offers_token on public.print_offers(token_id, status);

-- 10. Darkroom Console Audit Log
create table if not exists public.admin_log (
  id            text primary key,
  actor         text not null,
  category      text not null check (category in ('moderation', 'films', 'users', 'gas', 'contract')),
  action        text not null,
  target        text not null,
  detail        text not null default '',
  tx_hash       text,
  payload       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

-- =============================================================================
-- Row Level Security (RLS) Policies (PROJECT_BRIEF §6 & §10.6)
-- =============================================================================
alter table public.users enable row level security;
alter table public.films enable row level security;
alter table public.rolls enable row level security;
alter table public.shots enable row level security;
alter table public.posts enable row level security;
alter table public.likes enable row level security;
alter table public.reports enable row level security;
alter table public.prints enable row level security;
alter table public.print_offers enable row level security;
alter table public.admin_log enable row level security;

-- Public read access for films, public posts, likes, prints, and active offers
create policy "Public can view films" on public.films for select using (true);
create policy "Public can view user profiles" on public.users for select using (true);
create policy "Public can view visible posts" on public.posts for select using (visibility = 'public' and hidden_at is null);
create policy "Public can view likes" on public.likes for select using (true);
create policy "Public can view 1/1 prints" on public.prints for select using (true);
create policy "Public can view print offers" on public.print_offers for select using (true);

-- Private darkroom shots & rolls: only the roll owner can view their undeveloped/unposted shots
create policy "Owner can view own rolls" on public.rolls for select
  using (owner = lower(coalesce(current_setting('request.jwt.claim.sub', true), '')));

create policy "Owner can view own shots" on public.shots for select
  using (
    exists (
      select 1 from public.rolls r
      where r.id = shots.roll_id
        and r.owner = lower(coalesce(current_setting('request.jwt.claim.sub', true), ''))
    )
  );
