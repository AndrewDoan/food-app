# Table — MVP v1

Private recipe sharing for people you actually know. No public profiles, no
usernames, no discoverability — you add friends by invite code only, and
recipes are only ever visible to your accepted friends. Enforced at the
database level via Postgres Row Level Security, not just app logic.

This is v1 of the two-feature app: **recipe sharing** is built out fully
here. **Restaurant reviews with geo-radius filtering** is the natural next
slice — same friend-graph pattern, plus a location + radius query (Postgres
has an extension called PostGIS for this when you're ready).

## What's here

```
src/app/
  login/          magic-link sign in
  friends/        add by invite code, accept/decline, view your circle
  recipes/        the feed (server-rendered, filtered by RLS)
  recipes/new/    the "share a recipe" form
src/lib/supabase/ client + server Supabase helpers
src/middleware.ts keeps auth session fresh, redirects signed-out users
supabase/schema.sql   run this once in your Supabase project
```

## Setup (about 10 minutes)

1. **Create a Supabase project** — go to supabase.com, sign up, "New project."
   Pick any name/region, save the database password somewhere.

2. **Run the schema** — in your project dashboard, go to *SQL Editor* → *New
   query*, paste in the entire contents of `supabase/schema.sql`, and run it.
   This creates the `users`, `friendships`, and `recipes` tables plus all the
   Row Level Security policies that enforce "friends only."

3. **Turn off email confirmation for faster local testing (optional)** — in
   *Authentication → Providers → Email*, you can disable "Confirm email" while
   developing so magic links work instantly. Turn it back on before real users
   sign up.

4. **Get your API keys** — *Project Settings → API*. Copy the "Project URL"
   and the `anon` `public` key.

5. **Set up your local env** — copy `.env.local.example` to `.env.local` and
   paste in those two values.

6. **Install and run**:
   ```bash
   npm install
   npm run dev
   ```
   Open http://localhost:3000 — you'll be redirected to `/login`. Enter your
   email, check your inbox for the magic link, and you're in.

7. **Try the loop**: sign in with two different email addresses (two browser
   profiles, or one incognito), grab each account's invite code from the
   Friends page, add each other, accept, then post a recipe and confirm it
   shows up for your friend but not for a third unrelated account.

## Why RLS matters here

The `supabase/schema.sql` file does the real work of your product's core
promise. Policies like this one on `recipes`:

```sql
create policy "view own or friends recipes"
  on public.recipes for select
  using (author_id = auth.uid() or public.is_friend(auth.uid(), author_id));
```

mean that even if someone opened dev tools and queried Supabase directly,
bypassing your React code entirely, the database itself refuses to return
recipes from non-friends. That's a stronger guarantee than filtering in
JavaScript, and it's worth understanding well since it's the crux of your
"no strangers" pitch — the schema file is the best place to start reading if
you want to actually learn the pattern rather than just run it.

## Next steps once this loop works

- Restaurant reviews table (mirrors `recipes`) + a `location` column
  (lat/long) and a radius query — this is where PostGIS comes in
- Recipe photos (Supabase Storage bucket, with an RLS policy same as above)
- QR code generation/scanning as a thin UI layer over the existing
  invite-code system (no schema changes needed)
