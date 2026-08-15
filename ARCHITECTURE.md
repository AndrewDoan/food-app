# Table — Project Cheat Sheet

A living reference for talking about this project in interviews. Organized
by concept, not chronology — update this as the project grows.

---

## 30-second pitch

Table is a private, invite-only app for sharing recipes and restaurant
reviews within your actual circle of friends and family — no public
profiles, no discoverability, no ads, no strangers. Built with Next.js and
Supabase, with the core "friends only" promise enforced at the database
layer via Postgres Row Level Security, not just app-level filtering.

---

## Stack, and why

- **Next.js (App Router, TypeScript)** — chosen over Rails (my more
  familiar stack from a bootcamp ~10 years ago) for portfolio
  marketability. JS/TS full-stack is more in-demand than Rails right now.
- **Supabase (Postgres)** — Postgres over MongoDB/Mongo-style because the
  data is inherently relational (friends, recipes, permissions all depend
  on joins — "recipes where author is in my friends list"). Supabase gives
  auth, RLS, and Storage out of the box, which matters a lot when building
  solo.
- **Why not just filter in the frontend?** Because a frontend filter is
  advisory, not enforced — a bug, or someone hitting the API directly,
  could leak data. RLS makes the guarantee live in the one place that
  can't be bypassed: the database itself.

---

## Core concept: Row Level Security (RLS)

**What it is:** Postgres policies that restrict which *rows* a query can
return, evaluated on every query regardless of what wrote the query. RLS
is separate from table-level `GRANT`s — a table needs both a `GRANT`
(can this role touch the table at all) and RLS policies (which specific
rows can it see) before data flows.

**How it's used here:** Every table (`recipes`, `restaurant_reviews`,
`lists`, `friendships`, `users`, etc.) has a `select` policy shaped like:

```sql
using (author_id = auth.uid() or public.is_friend(auth.uid(), author_id))
```

`is_friend()` is a reusable helper function checking for a mutual,
`accepted` row in `friendships`. Every table's permission logic reduces to
this one function — which is a good thing to point out in an interview:
the friend-graph logic exists in exactly one place, not copy-pasted per
table.

**The chicken-and-egg problem RLS created:** you can't look someone up by
invite code before you're friends with them, because the `users` SELECT
policy only allows seeing yourself or existing friends. Solved with a
narrow `security definer` Postgres function (`find_user_by_invite_code`)
that returns *only* a matching user ID — bypassing RLS deliberately, but
exposing nothing else about that user. This is a good talking point: RLS
is powerful but not automatically correct for every access pattern; you
have to think through the full lifecycle (including the "not friends yet"
state), not just the steady state.

---

## Data model (current)

- `users` — profile row separate from Supabase's own `auth.users`; has an
  auto-generated `invite_code`, no username/email lookup exposed
- `friendships` — `requester_id` / `addressee_id` / `status`
  (pending/accepted/declined); mutual-accept required
- `friend_nicknames` — per-viewer private nickname for a friend, separate
  from that friend's own `display_name` (I decide what I call my mom in
  my own app; she doesn't set that; she never sees the nickname either)
- `lists` — user-defined collections (e.g. "Sunday dinners," "Abe's
  favorites," "Tokyo trip"); named "Lists" in the UI
- `recipes` — title, ingredients/steps (jsonb), photo, `tags` (shared
  suggested cuisine/type list), `prep_time_minutes`, `servings`, `notes`.
  No `list_id` column — see `list_items` below.
- `restaurant_reviews` — restaurant name/address/lat/long, rating, tags,
  `review_text` (the write-up) separate from `notes` (quick practical
  tips — same description/notes split as recipes), and `photo_urls`
  (array of storage paths, capped at 5 via a check constraint). Includes
  a `place_id` from Google Places — this is what makes it possible to
  reliably tell that two different reviews are about the *same physical
  restaurant* (matching on typed name/address alone would be too
  fragile). The **first** entry in `photo_urls` is the "primary" photo
  used as the thumbnail — order in the array *is* the meaning; there's
  no separate `is_primary` flag, "make primary" in the UI just reorders
  the array.
- `list_items` — many-to-many join: a recipe or review can belong to
  **multiple** lists at once, and a list can hold many items
  (`recipe_id` xor `review_id` per row, enforced by a check constraint).
  Replaced an earlier single-`list_id`-per-recipe design — see "Real
  bugs" and "Product decisions" below for why.
- `recipe_favorites` / `review_favorites` — a simple "I like this" flag
  (bookmark), completely separate from list membership. A favorite can be
  on zero, one, or many lists via `list_items`; being on a list doesn't
  require favoriting first, and vice versa.

---

## Real bugs hit, and the lesson each one teaches

**1. Magic link redirected back to login, no session created**
Root cause: the login page pointed `emailRedirectTo` straight at
`/recipes`, skipping the required PKCE code-exchange step entirely.
Fix: added a proper `/auth/callback` route handler that calls
`exchangeCodeForSession()` before redirecting anywhere.
*Lesson:* Supabase's magic-link flow needs an explicit exchange step —
skipping it doesn't error loudly, it just silently never creates a session.

**2. The callback route itself got blocked by middleware**
Root cause: middleware redirected any unauthenticated request to
`/login` — including `/auth/callback`, which is the *one* route that's
supposed to run before authentication exists. Classic chicken-and-egg bug.
Fix: explicitly excluded `/auth/*` from the "must be logged in" check.
*Lesson:* auth middleware needs special-casing for the routes that
establish auth in the first place — it's an easy blind spot.

**3. "permission denied for table X" despite correct RLS policies**
Root cause: RLS policies control *which rows* are visible, but Postgres
separately requires a base `GRANT` on the table before RLS even applies.
The original schema enabled RLS and wrote policies but never granted
`SELECT`/`INSERT`/etc. to the `authenticated` role.
Fix: added explicit `grant select, insert, update, delete ... to
authenticated` for every table.
*Lesson:* RLS and grants are two separate permission layers in Postgres —
a common trap even for people who already know RLS exists.

**4. "No one found with that code" — invite-code lookup blocked by RLS**
Root cause: the `users` SELECT policy only allows seeing your own row or
an *existing* friend's — so there was no way to look someone up in order
to become friends with them in the first place.
Fix: added a `security definer` function returning only a matching ID.
*Lesson:* RLS policies need to be checked against every state in a
feature's lifecycle, not just the "already set up" state.

**5. Multi-list migration silently half-completed — bug #3 recurred**
Root cause: mid-session, `recipes.list_id`/`recipe_favorites.list_id`
(single-list) got replaced with a `list_items` join table (multi-list).
The migration script creating `list_items`'s grant *and* its three RLS
policies got interrupted partway through — but the SQL editor showed
"success" for whatever ran before the interruption, giving false
confidence the whole thing had completed. Checking boxes silently failed
until traced through: 403 → missing grant (fixed) → still failing →
`select policyname from pg_policies where tablename = 'list_items'`
returned **zero rows**, revealing the entire policy block never ran.
*Lesson:* the exact same bug class (RLS vs. grants as separate layers)
showed up twice. The real fix isn't just "remember both layers exist" —
it's a *habit*: after any multi-statement migration, explicitly query
`pg_policies` (and check grants) for the affected table(s) rather than
trusting that "no red error at the end" means "everything ran."

**6. "Back" links that weren't actually back**
Root cause: several pages (Profile, and initially the create/edit forms)
used a `<Link href="/recipes">` labeled "← Back" — which always goes to
one hardcoded place, regardless of where the person actually came from.
Reached Profile from the hub, or from a friend's page, or from
Restaurants? Didn't matter — "Back" always dumped you on `/recipes`.
Fix: swapped hardcoded destination links for `router.back()` (real
browser-history back) wherever the label says "Back" or "Cancel."
*Lesson:* a Link with a fixed `href` and a button that calls
`router.back()` look identical in the UI but mean different things — the
label "Back" is a promise about *history*, not a promise about a specific
route, and only one of those two implementations keeps that promise.

---

## Product decisions worth being able to explain

**Invite code instead of usernames/search.** Deliberately no
discoverability — no username system, no directory, no public search.
Adding a friend requires already knowing them well enough to be handed
their code directly (text, in person, eventually QR). This is a direct
expression of the product's core promise: no strangers, ever.

**Moved away from a chronological "feed" model.** Originally planned as a
feed for both recipes and restaurant reviews (like a mini social feed).
Reconsidered deliberately: a feed encourages passive, recurring
checking-in, which conflicts with the whole point of the app (no ads, no
influencer dynamics, no engagement-bait). Repositioned as a **browse/search
utility** instead — you open it when you have an actual need (deciding
what to cook, finding a place to eat while traveling), not to scroll.

**Storage RLS mirrors table RLS.** Recipe photos live in a *private*
Supabase Storage bucket, not a public one — photo access is gated by the
same friend-graph logic as the data rows, via storage policies that check
`(storage.foldername(name))[1]` (the uploader's user ID encoded in the
file path) against `is_friend()`. Consistent security story end to end,
not just for structured data.

**Multi-list via a join table, not a single `list_id` column.** The
original design (a recipe belongs to at most one list) broke on a real
scenario: two kids, each with their own "favorites" list, sharing one
recipe between them. A single foreign key can't represent "in two lists
at once." Refactored to `list_items` — a small schema change that
actually *simplified* the model, since it unified two previously separate
mechanisms (an author's own `list_id` on recipes, and a favoriter's
`list_id` on favorites) into one consistent join table used everywhere.
*Lesson:* a concrete edge case (not an abstract "what if") is what
actually surfaces whether a data model is right — this one held up fine
right until a real scenario broke it.

**Favorites are a separate flag from list membership, on purpose.**
Originally planned as one combined action ("favorite → prompts you to
pick a list"). Once list membership became many-to-many, keeping them
separate turned out cleaner: a favorite means "I like this," a list
membership means "I've filed this somewhere," and neither requires the
other. The recipe detail page shows both controls side by side rather
than one triggering the other.

**Search matches recipe title, tags, AND the searcher's own private
nickname for a friend, alongside that friend's real name.** Both are
checked — a nickname is additive, not a replacement for the real name in
search. Avatars in the friend-selector row hide entirely when they don't
match an active search, *unless* that person has a recipe matching the
search term even if their name doesn't (so searching "ramen" still
surfaces Mom's avatar even though her name isn't "Ramen").

**Friend "pages" are real routes, not just a filtered view.**
`/recipes/friend/[id]` is a dedicated, shareable URL (not a query-param
filter on the main browse page) — deliberately, since the product idea is
for this to feel like a person's own space rather than a search result.
Your own collection uses this exact same route/component
(`/recipes/friend/<your-own-id>`) rather than a separate "my recipes" UI
— "Me" is just another person in the same system, which the RLS logic
already treated as true (`own or friend's`). Author names/nicknames
shown anywhere (cards, detail pages) link here too, including on your
own content — clicking your own name just goes to your own page, which
is harmless and occasionally useful rather than something worth special-
casing away.

**Google Places is called through a server-side proxy, never from the
browser directly.** `/api/places/search` holds the API key server-side
(`GOOGLE_PLACES_API_KEY`, no `NEXT_PUBLIC_` prefix) and the client only
ever talks to that route. Same security posture as everything else in
this app: secrets stay on the server. The alternative — calling Google's
Places JS SDK straight from the browser — would expose the key and
require locking it down with HTTP-referrer restrictions instead; the
proxy avoids that class of problem entirely.

**Restaurants page was deliberately scoped down from Recipes.** Recipes
has per-friend dedicated pages and Lists filter tabs; Restaurants (built
in the same session as the Places integration) intentionally shipped
*without* those — just search, tag chips, and the 4-tier ranking — to
get the core feature working end-to-end first. This was a conscious cut,
not an oversight: better to have a working, smaller Restaurants page than
a half-built one matching Recipes' full feature set. Bringing it up to
parity is explicit future work, not a bug.

**Tag suggestions are sourced from an unfiltered RLS query, for free.**
The tag input (shared between recipe and review forms) suggests
previously-used tags, sorted by frequency. The suggestion query is just
`select tags from recipes` (or `restaurant_reviews`) with **no manual
friend-filtering at all** — RLS already restricts that query to rows the
signed-in user can see (their own + friends'), so the suggestion pool is
automatically "my circle's vocabulary" without writing that logic twice.
A good example of RLS doing double duty: it's not just an access-control
mechanism, it's also implicitly the right scope for a feature that has
nothing to do with security on its face.

**Multi-photo "make primary" needed one unified list, not two.** The
review edit form tracks existing (already-uploaded) photos separately
from newly-added ones during editing — but letting the user promote
*either* kind to be the main photo meant both needed to live in one
single, reorderable array (a small discriminated union: `{type:
"existing", path, url} | {type: "new", file}`), with final save order
walking that one list in sequence. Keeping them as two separate arrays
(as the very first version did) made it impossible for a newly-added
photo to ever end up before an existing one.

---

## Recipe browse & search (built)

The whole browse/search experience was deliberately designed in a
dedicated planning session *before* any UI code was written for it —
catching structural decisions (multi-list, favorites-vs-lists, friend
pages as real routes) early rather than backtracking after building the
wrong thing. It's now built:

- **`/recipes`** — search bar (debounced, no need to press Enter),
  friend-selector row ("Everyone" + "Me" + friends, filtered/highlighted
  by the active search), and results grouped into a 4-tier ranking:
  1. **In your lists** — recipes (yours, or a friend's you favorited)
     filed into one of your own Lists
  2. **Your recipes** — your own, not yet filed into a list
  3. **Favorited** — a friend's recipe you've bookmarked, not filed
  4. **More from friends** — visible via the friend graph, untouched

  Empty tiers are hidden entirely. This ranking rewards personal
  curation without hiding anything friends have shared — just sorted by
  how much you've engaged with it.
- **`/recipes/friend/[id]`** — a person's dedicated page (works
  identically for a friend or for yourself): header, scoped search, their
  Lists as filter tabs, tag chips, same tiered results.
- **`/recipes/[id]`** — recipe detail page: full ingredients/steps/notes,
  a favorite toggle (friends' recipes) or a multi-select Lists checklist
  (any recipe you can see, own or friend's) to file it into any number of
  your own lists at once. Edit and delete for the author (edit form now
  collects tags/prep-time/servings/notes too — the original creation form
  had shipped without them, a real gap since the database and detail page
  already supported those fields with no way to actually set them).
- **`/lists`** — manage all your Lists in one place: create new, and an
  accordion per list (expand in place rather than navigating away) to
  rename, delete, or remove individual items — reusing the same
  components as the recipe detail page's list picker.
- **Landing hub (`/`)** — a real hub page (two tiles: Recipes,
  Restaurants) rather than redirecting straight into Recipes, matching
  the original two-feature product concept instead of treating Recipes
  as the default.

---

## Restaurant reviews (built)

Built in one long session together with the Google Places integration —
the biggest single feature addition so far:

- **Review creation/edit** — search a real restaurant via Google Places
  (server-proxied, see below) instead of the earlier raw-geolocation
  approach; rating; up to 5 photos with a "make primary" control (tap a
  star to promote any photo — existing or newly added — to be the
  thumbnail); a **Review** write-up separate from quick **Notes**; tags
  with the same frequency-sorted suggestions as recipes.
- **`/restaurants`** — search, tag chips, the same 4-tier ranking as
  Recipes (in your lists / your reviews / favorited / more from friends).
  Deliberately scoped smaller than Recipes for now — no per-friend pages
  or Lists tabs yet (see "Product decisions").
- **`/reviews/[id]`** — detail page: photo gallery, full review/notes
  text, rating, tags, a favorite toggle or Lists checklist depending on
  ownership, edit/delete for the author.
- **Google Places integration** — `/api/places/search` is a small
  server-side proxy (Next.js Route Handler) that holds the API key and
  forwards text search requests to Places API (New). The client never
  talks to Google directly.

---

## Not yet built

- Restaurant "collapse same restaurant into one card" via `place_id`
  when multiple friends review the same place — schema fully supports
  this (`place_id` is stable and shared across reviews of the same
  restaurant); no grouping UI built yet
- Location search for restaurants ("near Tokyo" vs. "near me right
  now") and any map/radius view — current search is Places text search
  only, no geo-distance query yet. This is the one still-missing piece
  that matters most for the "traveling somewhere, what have friends
  reviewed nearby" use case the whole restaurant feature was originally
  imagined for.
- Recipe multi-photo (recipes still support exactly one photo; reviews
  got multi-photo + "make primary" first)
- QR-code add-friend flow
- Possible "You Pick" rename

## Recently resolved (kept here briefly for context)

- ~~Dedicated per-friend restaurant pages~~ — solved differently than
  planned: rather than a separate `/restaurants/friend/[id]` route,
  restaurant reviews were folded into the *same* `/recipes/friend/[id]`
  page as a second tab (Recipes / Restaurants), sharing one header,
  search bar, and Lists-tabs pattern instead of duplicating a whole page.

## Known deferred items

- Pinned to Next.js `14.2.35` (patched for a Dec 2025 CVE) for local dev.
  Needs a deliberate, tested upgrade to latest before any public
  deployment or real user onboarding — not urgent for continued local
  development.
- Google Places billing is live on a real Google Cloud project (free
  tier covers development usage) — worth keeping an eye on usage before
  any public deployment, and revisiting the API key's restrictions at
  that point too.
