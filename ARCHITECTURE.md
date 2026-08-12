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
`recipe_groups`, `friendships`, `users`) has a `select` policy shaped like:

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
- `recipes` — title, ingredients/steps (jsonb), photo, `tags` (shared
  suggested cuisine/type list), `prep_time_minutes`, `servings`, `notes`,
  optional `group_id`
- `recipe_groups` — user-defined collections (e.g. "Sunday dinners");
  optional, a recipe belongs to at most one group
- `restaurant_reviews` — restaurant name/address/lat/long, rating, notes.
  No separate "restaurants" directory table — each review stores its own
  place info; deduping via a shared place ID is a possible future
  enhancement, not needed for v1.

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
This reshaped the data model: added `tags`, `prep_time_minutes`,
`servings`, and optional user-defined `recipe_groups` to support
browsing/filtering rather than just reverse-chronological display.

**Storage RLS mirrors table RLS.** Recipe photos live in a *private*
Supabase Storage bucket, not a public one — photo access is gated by the
same friend-graph logic as the data rows, via storage policies that check
`(storage.foldername(name))[1]` (the uploader's user ID encoded in the
file path) against `is_friend()`. Consistent security story end to end,
not just for structured data.

---

## Built so far (as of most recent session)

- Auth (magic link, working end-to-end)
- Mutual friendships via invite code
- Recipe posting, photo upload (private storage), delete
- Profile / display name
- Restaurant review submission with geolocation capture (no display UI yet)
- Full schema for recipes, recipe groups, restaurant reviews, all RLS-gated

## Not yet built

- Browse/search UI for recipes (replacing the old simple feed page)
- Restaurant review display + radius/cuisine-filter search
- Recipe edit (delete exists, edit doesn't)
- QR-code add-friend flow

## Known deferred item

Pinned to Next.js `14.2.35` (patched for a Dec 2025 CVE) for local dev.
Needs a deliberate, tested upgrade to latest before any public deployment
or real user onboarding — not urgent for continued local development.
