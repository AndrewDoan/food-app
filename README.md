# Table

Private recipe and restaurant sharing for people you actually know. No
public profiles, no usernames, no discoverability — you add friends by
invite code only, and everything you post is only ever visible to your
accepted friends. Enforced at the database level via Postgres Row Level
Security, not just app logic.

Both core features are built out: **recipe sharing** (browse/search,
Lists, favorites, tags, photos, edit) and **restaurant reviews** (same
pattern, plus real Google Places search and up to 5 photos per review).

## What's here

```
src/app/
  login/              magic-link sign in
  auth/callback/      PKCE code exchange for the magic link
  friends/            add by invite code, accept/decline, view your circle
  profile/            set your display name
  lists/              create/rename/delete Lists, see what's on each
  recipes/            browse/search page, friend-selector, tag filters
  recipes/new/        share a recipe
  recipes/[id]/       recipe detail, favorite, add to Lists, edit, delete
  recipes/friend/[id] a person's page -- Recipes and Restaurants tabs
  restaurants/        browse/search restaurant reviews
  reviews/new/        share a restaurant (Google Places search, photos)
  reviews/[id]/       review detail, favorite, add to Lists, edit, delete
  api/places/search/  server-side proxy to Google Places (key never
                       reaches the browser)
  page.tsx            landing hub -- choose Recipes or Restaurants
src/components/
  TagInput.tsx         shared tag input with frequency-sorted suggestions
src/lib/supabase/      client + server Supabase helpers
src/middleware.ts       keeps auth session fresh, redirects signed-out users
supabase/schema.sql     run this once in your Supabase project
docs/ARCHITECTURE.md    design decisions, data model, bugs + lessons
```

## Setup (about 20 minutes)

1. **Create a Supabase project** — go to supabase.com, sign up, "New
   project." Pick any name/region, save the database password somewhere.

2. **Run the schema** — in your project dashboard, go to *SQL Editor* →
   *New query*, paste in the entire contents of `supabase/schema.sql`,
   and run it. This creates every table (`users`, `friendships`,
   `recipes`, `restaurant_reviews`, `lists`, `list_items`, favorites,
   nicknames) plus all the Row Level Security policies that enforce
   "friends only."

3. **Turn off email confirmation for faster local testing (optional)** —
   in *Authentication → Providers → Email*, disable "Confirm email"
   while developing so magic links work instantly. Turn it back on
   before real users sign up.

4. **Create two private Storage buckets** — in *Storage*, create
   `recipe-photos` and `review-photos`, both with **Public bucket**
   turned OFF. Then run the storage RLS policies for each (see
   `supabase/storage_policies_reviews.sql` for the review-photos ones;
   recipe-photos policies are in the main schema history — check
   `docs/ARCHITECTURE.md` if you need to reconstruct them).

5. **Get your Supabase API keys** — *Project Settings → API Keys*. Copy
   the "Project URL" and the publishable/anon key.

6. **Set up Google Places** — you'll need a Google Cloud project with
   the Places API enabled and billing turned on (free tier covers
   development use). Create an API key restricted to the Places API
   only. Full walkthrough in `docs/ARCHITECTURE.md`.

7. **Set up your local env** — copy `.env.local.example` to `.env.local`
   and fill in:
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   GOOGLE_PLACES_API_KEY=...
   ```
   Note the Places key has **no** `NEXT_PUBLIC_` prefix — it's used only
   server-side, in `/api/places/search`, and never sent to the browser.

8. **Install and run**:
   ```bash
   npm install
   npm run dev
   ```
   Open http://localhost:3000 — you'll land on the hub, then get
   redirected to `/login` if you're not signed in. Enter your email,
   check your inbox for the magic link, and you're in.

9. **Try the loop**: sign in with two different email addresses (two
   browser profiles, or one incognito), grab each account's invite code
   from the Friends page, add each other, accept. Post a recipe and a
   restaurant review from one account, confirm both show up for your
   friend but not for a third unrelated account.

## Why RLS matters here

`supabase/schema.sql` does the real work of the product's core promise.
Policies like this one on `recipes`:

```sql
create policy "view own or friends recipes"
  on public.recipes for select
  using (author_id = auth.uid() or public.is_friend(auth.uid(), author_id));
```

mean that even if someone opened dev tools and queried Supabase
directly, bypassing the React code entirely, the database itself
refuses to return recipes from non-friends. That's a stronger guarantee
than filtering in JavaScript, and it's worth understanding well since
it's the crux of the "no strangers" pitch. `docs/ARCHITECTURE.md` goes
deep on this, including two real bugs that came from RLS and
`GRANT`s being separate permission layers — worth reading if you want
to actually understand the pattern rather than just run it.

## What's built

- Magic-link auth, mutual friendships via invite code, private
  per-viewer nicknames
- **Recipes** — post with photo/ingredients/steps/tags/prep-time/
  servings/notes; browse/search with a friend-selector, tag filters,
  and a 4-tier ranking (in your Lists / yours / favorited / more from
  friends); full edit and delete
- **Restaurant reviews** — real Google Places search when posting (not
  raw GPS), up to 5 photos with a "make primary" thumbnail picker, a
  Review write-up separate from quick Notes, same browse/search pattern
  as recipes, full edit and delete
- **Lists** — user-defined, multi-membership (a recipe or review can be
  on more than one list at once), manageable in one place at `/lists`
- **Favorites** — a simple bookmark flag, independent of list membership
- A person's page (`/recipes/friend/[id]`) with tabs for their Recipes
  and Restaurants, shareable as a real URL

## What's not built yet

- Location/radius search for restaurants ("near me" or "near a place
  I'm about to travel to") — currently text search only, no distance
  query. This is the biggest remaining gap.
- Collapsing multiple friends' reviews of the same restaurant into one
  card (the data already supports it via `place_id`; no UI yet)
- QR-code add-friend flow
- Recipe multi-photo (recipes still support exactly one photo)

Full design decisions, data model, and bug write-ups live in
`docs/ARCHITECTURE.md`.
