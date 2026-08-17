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

alter table public.users enable row level security;
alter table public.friendships enable row level security;

grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on public.users to authenticated;
grant select, insert, update, delete on public.friendships to authenticated;

-- USERS: you can see your own row, and the row of anyone you're friends
-- with (needed to render their name/avatar on shared content).
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

-- ---------------------------------------------------------------------
-- 3a. LISTS  (user-defined collections -- "Sunday dinners," "Abe's
--     favorites," "Tokyo trip," etc. Optional -- being on no list is
--     completely fine. A recipe or review can be on MULTIPLE lists at
--     once -- see list_items below -- since the same dish can
--     legitimately belong to more than one collection, e.g. both of
--     your kids' separate "favorites" lists.)
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
  photo_urls text[] not null default '{}', -- capped at 5, see constraint below
  tags text[] not null default '{}',       -- e.g. {"weeknight", "vegetarian", "dessert"} -- for browse/search, not a feed
  prep_time_minutes integer,
  servings integer,
  notes text,                              -- free-text extras from the creator (substitutions, tips, "my mom's version," etc.)
  created_at timestamptz not null default now()
);

create index if not exists idx_recipes_author on public.recipes(author_id);

alter table public.recipes
  add constraint recipe_photo_urls_max_five
  check (array_length(photo_urls, 1) is null or array_length(photo_urls, 1) <= 5);

alter table public.recipes enable row level security;
grant select, insert, update, delete on public.recipes to authenticated;

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

-- ---------------------------------------------------------------------
-- 3b. RESTAURANT REVIEWS
--     No separate "restaurants" directory table -- each review stores
--     its own place info, but ALSO a stable place_id from a place-lookup
--     provider (e.g. Google Places). That id is what makes it possible
--     to reliably tell that two different reviews are about the same
--     physical restaurant, so they can be grouped/collapsed together --
--     matching on typed name/address alone would be too fragile
--     (formatting differences, slightly different GPS pins).
-- ---------------------------------------------------------------------
create table if not exists public.restaurant_reviews (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.users(id) on delete cascade,
  place_id text not null,
  restaurant_name text not null,
  address text,
  latitude double precision not null,
  longitude double precision not null,
  rating smallint not null check (rating between 1 and 5),
  tags text[] not null default '{}', -- cuisine/type, same shared-list approach as recipes
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_reviews_author on public.restaurant_reviews(author_id);
create index if not exists idx_reviews_place on public.restaurant_reviews(place_id); -- powers the "collapse into one" grouping
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
-- 3c. LIST ITEMS  (many-to-many: a recipe or review can be on multiple
--     lists at once, and a list can hold many items. Replaces an
--     earlier single list_id-per-recipe design once it became clear a
--     dish can legitimately belong to more than one list -- e.g. both
--     of your kids' separate "favorites" lists.)
-- ---------------------------------------------------------------------
create table if not exists public.list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists(id) on delete cascade,
  recipe_id uuid references public.recipes(id) on delete cascade,
  review_id uuid references public.restaurant_reviews(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint one_item_type check (
    (recipe_id is not null and review_id is null) or
    (recipe_id is null and review_id is not null)
  ),
  constraint unique_recipe_in_list unique (list_id, recipe_id),
  constraint unique_review_in_list unique (list_id, review_id)
);

create index if not exists idx_list_items_list on public.list_items(list_id);
create index if not exists idx_list_items_recipe on public.list_items(recipe_id);
create index if not exists idx_list_items_review on public.list_items(review_id);

alter table public.list_items enable row level security;
grant select, insert, delete on public.list_items to authenticated;

-- Viewable by whoever can see the list itself (owner or friend).
create policy "view items in own or friends lists"
  on public.list_items for select
  using (
    exists (
      select 1 from public.lists l
      where l.id = list_id
        and (l.owner_id = auth.uid() or public.is_friend(auth.uid(), l.owner_id))
    )
  );

-- You can only add to a list YOU own, and only items you can actually
-- see (your own, or a friend's) -- so you can file a friend's recipe
-- into your own list, but never add to someone else's list.
create policy "add item to own list"
  on public.list_items for insert
  with check (
    exists (select 1 from public.lists l where l.id = list_id and l.owner_id = auth.uid())
    and (
      (recipe_id is not null and exists (
        select 1 from public.recipes r
        where r.id = recipe_id
          and (r.author_id = auth.uid() or public.is_friend(auth.uid(), r.author_id))
      ))
      or
      (review_id is not null and exists (
        select 1 from public.restaurant_reviews rr
        where rr.id = review_id
          and (rr.author_id = auth.uid() or public.is_friend(auth.uid(), rr.author_id))
      ))
    )
  );

create policy "remove item from own list"
  on public.list_items for delete
  using (
    exists (select 1 from public.lists l where l.id = list_id and l.owner_id = auth.uid())
  );

-- ---------------------------------------------------------------------
-- 3d. RECIPE FAVORITES  (bookmark a friend's -- or your own -- recipe.
--     Just a flag: "I like this." List membership is handled entirely
--     by list_items above, kept separate on purpose -- a favorite can
--     be on zero, one, or many lists, and being on a list doesn't
--     require having favorited it first.)
-- ---------------------------------------------------------------------
create table if not exists public.recipe_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint unique_favorite unique (user_id, recipe_id)
);

create index if not exists idx_favorites_user on public.recipe_favorites(user_id);

alter table public.recipe_favorites enable row level security;
grant select, insert, delete on public.recipe_favorites to authenticated;

create policy "view own favorites"
  on public.recipe_favorites for select
  using (user_id = auth.uid());

-- Can't favorite a stranger's recipe id even if guessed, since the
-- recipes RLS policy blocks the underlying join either way.
create policy "add own favorite"
  on public.recipe_favorites for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.recipes r
      where r.id = recipe_id
        and (r.author_id = auth.uid() or public.is_friend(auth.uid(), r.author_id))
    )
  );

create policy "remove own favorite"
  on public.recipe_favorites for delete
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 3e. RESTAURANT REVIEW FAVORITES  (same bookmark pattern as recipes.)
-- ---------------------------------------------------------------------
create table if not exists public.review_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  review_id uuid not null references public.restaurant_reviews(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint unique_review_favorite unique (user_id, review_id)
);

create index if not exists idx_review_favorites_user on public.review_favorites(user_id);

alter table public.review_favorites enable row level security;
grant select, insert, delete on public.review_favorites to authenticated;

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
  );

create policy "remove own review favorite"
  on public.review_favorites for delete
  using (user_id = auth.uid());
