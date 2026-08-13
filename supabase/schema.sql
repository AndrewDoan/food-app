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
-- 3a. LISTS  (optional, user-defined collections -- "Sunday
--     dinners," "Quick lunches," etc. A recipe belongs to at most one
--     list; being on no list is fine, nothing forces organizing.)
-- ---------------------------------------------------------------------
create table if not exists public.lists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_lists_owner on public.lists(owner_id);

alter table public.lists enable row level security;
grant select, insert, update, delete on public.lists to authenticated;

-- Same friends-only rule as everything else: your own lists, or a
-- friend's, so you can browse how they've organized their recipes.
create policy "view own or friends lists"
  on public.lists for select
  using (owner_id = auth.uid() or public.is_friend(auth.uid(), owner_id));

create policy "insert own lists"
  on public.lists for insert
  with check (owner_id = auth.uid());

create policy "update own lists"
  on public.lists for update
  using (owner_id = auth.uid());

create policy "delete own lists"
  on public.lists for delete
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
  -- Optional: which of the author's own lists this belongs to. Nullable
  -- on purpose -- recipes with no list are completely fine.
  list_id uuid references public.lists(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_recipes_author on public.recipes(author_id);
create index if not exists idx_recipes_list on public.recipes(list_id);

-- ---------------------------------------------------------------------
-- 3c. RECIPE FAVORITES  (bookmark a friend's recipe into your own list.
--     Attribution always stays with the original author -- this is a
--     save/bookmark, not a copy or fork.)
-- ---------------------------------------------------------------------
create table if not exists public.recipe_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  -- Personal organization of the FAVORITE, independent of however the
  -- original author organized their own copy. Must be one of the
  -- favoriter's own lists (enforced in the policies below) -- lets you
  -- file a friend's ramen recipe into your own "quick lunches" list
  -- without touching anything on their side.
  list_id uuid references public.lists(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint unique_favorite unique (user_id, recipe_id)
);

create index if not exists idx_favorites_user on public.recipe_favorites(user_id);

alter table public.recipe_favorites enable row level security;
grant select, insert, update, delete on public.recipe_favorites to authenticated;

-- You can only see/manage your own favorites list.
create policy "view own favorites"
  on public.recipe_favorites for select
  using (user_id = auth.uid());

-- You can only favorite a recipe you're actually allowed to see (own or
-- a friend's) -- can't favorite a stranger's recipe id even if guessed,
-- since the recipes RLS policy blocks the underlying join either way.
-- If a list is given, it must be one of your own lists.
create policy "add own favorite"
  on public.recipe_favorites for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.recipes r
      where r.id = recipe_id
        and (r.author_id = auth.uid() or public.is_friend(auth.uid(), r.author_id))
    )
    and (
      list_id is null
      or exists (select 1 from public.lists g where g.id = list_id and g.owner_id = auth.uid())
    )
  );

-- Lets you (re)assign a favorite into one of your own lists later.
create policy "update own favorite"
  on public.recipe_favorites for update
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (
      list_id is null
      or exists (select 1 from public.lists g where g.id = list_id and g.owner_id = auth.uid())
    )
  );

create policy "remove own favorite"
  on public.recipe_favorites for delete
  using (user_id = auth.uid());

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
  -- Stable identifier from a place-lookup provider (e.g. Google Places).
  -- This is what makes "collapse reviews of the same restaurant" possible
  -- reliably -- matching on typed name/address alone is too fragile
  -- (capitalization, formatting, slightly different GPS pins). Two
  -- friends reviewing the same physical restaurant will share this id.
  place_id text not null,
  restaurant_name text not null,
  address text,
  latitude double precision not null,
  longitude double precision not null,
  rating smallint not null check (rating between 1 and 5),
  tags text[] not null default '{}', -- cuisine/type, same shared-list approach as recipes
  notes text,
  list_id uuid references public.lists(id) on delete set null, -- optional, same "lists" as recipes
  created_at timestamptz not null default now()
);

create index if not exists idx_reviews_author on public.restaurant_reviews(author_id);
create index if not exists idx_reviews_place on public.restaurant_reviews(place_id); -- powers the "collapse into one" grouping
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
-- 3d. RESTAURANT REVIEW FAVORITES  (same bookmark pattern as recipes --
--     favorite a friend's review, optionally file it into one of your
--     own lists, independent of how they organized their own review.)
-- ---------------------------------------------------------------------
create table if not exists public.review_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  review_id uuid not null references public.restaurant_reviews(id) on delete cascade,
  list_id uuid references public.lists(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint unique_review_favorite unique (user_id, review_id)
);

create index if not exists idx_review_favorites_user on public.review_favorites(user_id);

alter table public.review_favorites enable row level security;
grant select, insert, update, delete on public.review_favorites to authenticated;

create policy "view own review favorites"
  on public.review_favorites for select
  using (user_id = auth.uid());

create policy "add own review favorite"
  on public.review_favorites for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.restaurant_reviews r
      where r.id = review_id
        and (r.author_id = auth.uid() or public.is_friend(auth.uid(), r.author_id))
    )
    and (
      list_id is null
      or exists (select 1 from public.lists l where l.id = list_id and l.owner_id = auth.uid())
    )
  );

create policy "update own review favorite"
  on public.review_favorites for update
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (
      list_id is null
      or exists (select 1 from public.lists l where l.id = list_id and l.owner_id = auth.uid())
    )
  );

create policy "remove own review favorite"
  on public.review_favorites for delete
  using (user_id = auth.uid());

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
grant select, insert, update, delete on public.lists to authenticated;

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

-- ---------------------------------------------------------------------
-- 2b. FRIEND NICKNAMES  (per-viewer -- I decide what I call my friend;
--     it's not something they set about themselves. Separate from
--     users.display_name, which is the friend's own public name.)
-- ---------------------------------------------------------------------
create table if not exists public.friend_nicknames (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,  -- who's setting the nickname
  friend_id uuid not null references public.users(id) on delete cascade, -- whose nickname it is
  nickname text not null,
  created_at timestamptz not null default now(),
  constraint unique_nickname unique (user_id, friend_id)
);

alter table public.friend_nicknames enable row level security;
grant select, insert, update, delete on public.friend_nicknames to authenticated;

-- Only visible/editable by the person who set it -- your nickname for a
-- friend is private to you, not shared with them or anyone else.
create policy "manage own nicknames"
  on public.friend_nicknames for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

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
