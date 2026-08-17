# Table

Private recipe and restaurant sharing for people you actually know. No
public profiles, no usernames, no discoverability — you add friends by
invite code (typed, or scanned via QR) only, and everything you post is
only ever visible to your accepted friends. Enforced at the database
level via Postgres Row Level Security, not just app logic.

Both core features are fully built out: **recipe sharing** and
**restaurant reviews**, sharing the same underlying patterns — browse/
search, tags, multi-photo, Lists, favorites, full edit/delete — plus
restaurants get real Google Places search, a live map, and location
search ("near me" or near anywhere you type).

## What's here

```
src/app/
  login/              magic-link sign in
  auth/callback/      PKCE code exchange for the magic link
  friends/            add by invite code (typed or QR scan), view your circle
  profile/            display name + profile photo
  lists/              create/rename/delete Lists (recipe-type and
                       restaurant-type are kept separate), see what's on each
  recipes/            browse/search page, friend-selector, tag filters
  recipes/new/        share a recipe (up to 5 photos)
  recipes/[id]/       recipe detail, favorite, add to Lists, edit, delete
  restaurants/        browse/search restaurant reviews, live map, location search
  reviews/new/        share a restaurant (Google Places search, up to 5 photos)
  reviews/[id]/       review detail, favorite, add to Lists, edit, delete
  people/[id]/        a person's page -- Recipes and Restaurants tabs,
                       works identically for a friend or yourself ("Me")
  api/places/search/  server-side proxy to Google Places (key never
                       reaches the browser)
  api/geocode/        server-side proxy for turning a typed address/city
                       into coordinates
  page.tsx            landing hub -- choose Recipes or Restaurants
src/components/
  TagInput.tsx         shared tag input with frequency-sorted suggestions
src/lib/
  supabase/            client + server Supabase helpers
  distance.ts          Haversine distance calculation for "near me"
src/middleware.ts       keeps auth session fresh, redirects signed-out users
supabase/schema.sql     run this once in your Supabase project
docs/ARCHITECTURE.md    design decisions, data model, bugs + lessons
```

## Setup (about 30 minutes)

1. **Create a Supabase project** — go to supabase.com, sign up, "New
   project." Pick any name/region, save the database password somewhere.

2. **Run the schema** — in your project dashboard, go to *SQL Editor* →
   *New query*, paste in the entire contents of `supabase/schema.sql`,
   and run it. This creates every table plus all the Row Level Security
   policies that enforce "friends only."

3. **Turn off email confirmation for faster local testing (optional)** —
   in *Authentication → Providers → Email*, disable "Confirm email"
   while developing so magic links work instantly. Turn it back on
   before real users sign up.

4. **Create three private Storage buckets** — in *Storage*, create
   `recipe-photos`, `review-photos`, and `avatars`, all with **Public
   bucket** turned OFF. Then run each bucket's RLS policies — see the
   `supabase/storage_policies_*.sql` files, or `docs/ARCHITECTURE.md`
   for the full set.

5. **Get your Supabase API keys** — *Project Settings → API Keys*. Copy
   the "Project URL" and the publishable/anon key.

6. **Set up Google Places + Geocoding** — you'll need a Google Cloud
   project with the Places API and Geocoding API both enabled, and
   billing turned on (free tier covers development use). Create an API
   key restricted to just those two APIs — used server-side only, so it
   stays secret.

7. **Set up Google Maps (for the live map view)** — enable the Maps
   JavaScript API on the same project, then create a **second**,
   separate API key restricted to Maps JavaScript API with an HTTP
   referrer restriction (`http://localhost:3000/*` for dev). This one
   *is* exposed to the browser, which is why it needs the domain
   restriction instead of staying secret.

8. **Set up your local env** — copy `.env.local.example` to `.env.local`
   and fill in:
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   GOOGLE_PLACES_API_KEY=...
   NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=...
   ```
   Note only the Maps key has the `NEXT_PUBLIC_` prefix — the Places key
   is used server-side only (`/api/places/search`, `/api/geocode`) and
   is never sent to the browser.

9. **Install and run**:
   ```bash
   npm install
   npm run dev
   ```
   Open http://localhost:3000 — you'll land on the hub, then get
   redirected to `/login` if you're not signed in. Enter your email,
   check your inbox for the magic link, and you're in.

10. **Try the loop**: sign in with two different email addresses (two
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
deep on this, including several real bugs that came from getting RLS
subtly wrong — worth reading if you want to actually understand the
pattern rather than just run it.

## What's built

- Magic-link auth, mutual friendships via invite code (typed or QR
  scan), private per-viewer nicknames, profile photos
- **Recipes** — post with up to 5 photos ("make primary" to pick the
  thumbnail), ingredients/steps/tags/prep-time/servings/notes;
  browse/search with a friend-selector, tag filters, and a 4-tier
  ranking (in your Lists / yours / favorited / more from friends); full
  edit and delete
- **Restaurant reviews** — real Google Places search when posting (not
  raw GPS), up to 5 photos, a Review write-up separate from quick Notes,
  same browse/search pattern as recipes, full edit and delete
- **Restaurant map + location search** — a live map with markers grouped
  by restaurant (multiple friends' reviews of the same place collapse
  into one pin/card instead of duplicating), "near me" with an
  adjustable radius, or type any city/address to search there instead
- **Lists** — user-defined, multi-membership (a recipe or review can be
  on more than one list at once), kept type-specific (recipe lists and
  restaurant lists never mix), manageable in one place at `/lists`
- **Favorites** — a simple bookmark flag, independent of list membership
- A person's page (`/people/[id]`) with tabs for their Recipes and
  Restaurants, works identically for a friend or yourself, shareable as
  a real URL

## What's not built yet

- Possible "You Pick" rename — floated as an idea, never formally
  decided
- QR add-friend flow hasn't been tested phone-to-phone across two real
  devices yet (camera access needs HTTPS or localhost, so it's only
  been verified with two browser tabs on one machine so far)

Full design decisions, data model, and bug write-ups (including several
genuinely instructive ones — an RLS policy that silently hid pending
friend requests, a hydration crash from nesting a button inside a link)
live in `docs/ARCHITECTURE.md`.
