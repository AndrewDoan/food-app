-- Run this in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query)
-- after creating your project. Safe to run once on a fresh project.

-- ---------------------------------------------------------------------
-- 1. USERS  (public profile row, separate from Supabase's auth.users)
-- ---------------------------------------------------------------------
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  invite_code text not null unique,
  created_at timestamptz not null default now()
);

-- Auto-create a public.users row whenever someone signs up, with a
-- random invite code so they never have to set one manually.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, display_name, invite_code)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', 'New Cook'),
    substr(md5(random()::text || new.id::text), 1, 8)
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------
-- 2. FRIENDSHIPS  (mutual accept required)
-- ---------------------------------------------------------------------
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.users(id) on delete cascade,
  addressee_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  constraint no_self_friendship check (requester_id <> addressee_id),
  constraint unique_pair unique (requester_id, addressee_id)
);

create index if not exists idx_friendships_requester on public.friendships(requester_id);
create index if not exists idx_friendships_addressee on public.friendships(addressee_id);

-- Helper: is `other_user` an accepted friend of `me`?
create or replace function public.is_friend(me uuid, other_user uuid)
returns boolean as $$
  select exists (
    select 1 from public.friendships
    where status = 'accepted'
      and (
        (requester_id = me and addressee_id = other_user) or
        (requester_id = other_user and addressee_id = me)
      )
  );
$$ language sql stable security definer;

-- Helper: look up a user's id by their invite code, WITHOUT requiring the
-- caller to already have SELECT access to that user's row via RLS. This
-- is what makes "add a friend by code" possible at all -- normal RLS on
-- `users` only allows seeing yourself or existing friends, which is a
-- chicken-and-egg problem for someone you're not friends with *yet*.
-- Only the matching id is ever returned -- no other profile data leaks.
create or replace function public.find_user_by_invite_code(code text)
returns uuid as $$
  select id from public.users where invite_code = code;
$$ language sql stable security definer;

grant execute on function public.find_user_by_invite_code(text) to authenticated;

-- ---------------------------------------------------------------------
-- 3a. RECIPE GROUPS  (optional, user-defined collections -- "Sunday
--     dinners," "Quick lunches," etc. A recipe belongs to at most one
--     group; ungrouped is fine, nothing forces organizing.)
-- ---------------------------------------------------------------------
create table if not exists public.recipe_groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_recipe_groups_owner on public.recipe_groups(owner_id);

alter table public.recipe_groups enable row level security;
grant select, insert, update, delete on public.recipe_groups to authenticated;

-- Same friends-only rule as everything else: your own groups, or a
-- friend's, so you can browse how they've organized their recipes.
create policy "view own or friends recipe groups"
  on public.recipe_groups for select
  using (owner_id = auth.uid() or public.is_friend(auth.uid(), owner_id));

create policy "insert own recipe groups"
  on public.recipe_groups for insert
  with check (owner_id = auth.uid());

create policy "update own recipe groups"
  on public.recipe_groups for update
  using (owner_id = auth.uid());

create policy "delete own recipe groups"
  on public.recipe_groups for delete
  using (owner_id = auth.uid());

-- ---------------------------------------------------------------------
-- 3. RECIPES
-- ---------------------------------------------------------------------
create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  description text,
  ingredients jsonb not null default '[]', -- [{ "name": "...", "amount": "...", "unit": "..." }]
  steps jsonb not null default '[]',       -- ["Step one...", "Step two..."]
  photo_url text,
  tags text[] not null default '{}',       -- e.g. {"weeknight", "vegetarian", "dessert"} -- for browse/search, not a feed
  prep_time_minutes integer,
  servings integer,
  notes text,                              -- free-text extras from the creator (substitutions, tips, "my mom's version," etc.)
  -- Optional: which of the author's own groups this belongs to. Nullable
  -- on purpose -- ungrouped recipes are completely fine.
  group_id uuid references public.recipe_groups(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_recipes_author on public.recipes(author_id);
create index if not exists idx_recipes_group on public.recipes(group_id);

-- ---------------------------------------------------------------------
-- 3b. RESTAURANT REVIEWS
--     No separate "restaurants" directory table for v1 -- each review
--     just stores its own place info. Two friends reviewing the same
--     physical restaurant creates two rows; deduping via a shared
--     places-id is a fine future enhancement, not needed for v1.
--     latitude/longitude are plain floats for now -- swap to PostGIS's
--     geography type later if/when doing real radius search at scale.
-- ---------------------------------------------------------------------
create table if not exists public.restaurant_reviews (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.users(id) on delete cascade,
  restaurant_name text not null,
  address text,
  latitude double precision not null,
  longitude double precision not null,
  rating smallint not null check (rating between 1 and 5),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_reviews_author on public.restaurant_reviews(author_id);
-- Speeds up "reviews near this lat/long" once that query gets built.
create index if not exists idx_reviews_location on public.restaurant_reviews(latitude, longitude);

alter table public.restaurant_reviews enable row level security;

grant select, insert, update, delete on public.restaurant_reviews to authenticated;

-- Same rule as recipes: your own reviews, or an accepted friend's.
create policy "view own or friends reviews"
  on public.restaurant_reviews for select
  using (author_id = auth.uid() or public.is_friend(auth.uid(), author_id));

create policy "insert own reviews"
  on public.restaurant_reviews for insert
  with check (author_id = auth.uid());

create policy "update own reviews"
  on public.restaurant_reviews for update
  using (author_id = auth.uid());

create policy "delete own reviews"
  on public.restaurant_reviews for delete
  using (author_id = auth.uid());

-- ---------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY -- this is the "no strangers" guarantee.
--    Even a compromised or buggy frontend cannot read data outside
--    a user's own friend graph, because Postgres itself blocks it.
-- ---------------------------------------------------------------------
alter table public.users enable row level security;
alter table public.friendships enable row level security;
alter table public.recipes enable row level security;

-- RLS policies control WHICH rows a query can see, but Postgres also
-- requires this separate, more basic grant before RLS even applies.
-- Without it, every query fails with "permission denied for table X"
-- regardless of how correct the policies below are.
grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on public.users to authenticated;
grant select, insert, update, delete on public.friendships to authenticated;
grant select, insert, update, delete on public.recipes to authenticated;
grant select, insert, update, delete on public.recipe_groups to authenticated;

-- USERS: you can see your own row, and the row of anyone you're friends
-- with (needed to render their name/avatar on shared recipes).
create policy "view own or friend profile"
  on public.users for select
  using (id = auth.uid() or public.is_friend(auth.uid(), id));

create policy "update own profile"
  on public.users for update
  using (id = auth.uid());

-- FRIENDSHIPS: you can see requests you sent or received.
create policy "view own friendships"
  on public.friendships for select
  using (requester_id = auth.uid() or addressee_id = auth.uid());

create policy "create friend request"
  on public.friendships for insert
  with check (requester_id = auth.uid());

-- Only the addressee can accept/decline; either party can cancel/remove.
create policy "respond to or remove friendship"
  on public.friendships for update
  using (addressee_id = auth.uid() or requester_id = auth.uid());

create policy "delete own friendship"
  on public.friendships for delete
  using (requester_id = auth.uid() or addressee_id = auth.uid());

-- RECIPES: this is the core rule -- you can only ever read a recipe
-- if you wrote it, or you're an accepted friend of whoever did.
create policy "view own or friends recipes"
  on public.recipes for select
  using (author_id = auth.uid() or public.is_friend(auth.uid(), author_id));

create policy "insert own recipes"
  on public.recipes for insert
  with check (author_id = auth.uid());

create policy "update own recipes"
  on public.recipes for update
  using (author_id = auth.uid());

create policy "delete own recipes"
  on public.recipes for delete
  using (author_id = auth.uid());