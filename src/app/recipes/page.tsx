import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SearchBar from "./SearchBar";
import FavoriteButton from "./[id]/FavoriteButton";

export default async function RecipesPage({
  searchParams,
}: {
  searchParams: { friend?: string; q?: string; tag?: string; list?: string };
}) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const friendParam = searchParams.friend ?? "all";
  const q = searchParams.q ?? "";
  const activeTag = searchParams.tag ?? "";
  const activeList = searchParams.list ?? "";

  // ---- Build the friend selector row --------------------------------
  const { data: friendships } = await supabase
    .from("friendships")
    .select("requester_id, addressee_id")
    .eq("status", "accepted")
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

  const friendIds = (friendships ?? []).map((f) =>
    f.requester_id === user.id ? f.addressee_id : f.requester_id
  );

  const { data: friendProfiles } = friendIds.length
    ? await supabase.from("users").select("id, display_name, avatar_url").in("id", friendIds)
    : { data: [] };

  const { data: ownProfile } = await supabase
    .from("users")
    .select("display_name, avatar_url")
    .eq("id", user.id)
    .single();

  // Signed URLs for anyone with an uploaded avatar photo.
  const avatarUrlById = new Map<string, string>();
  const avatarSources = [
    ...(ownProfile?.avatar_url ? [{ id: user.id, path: ownProfile.avatar_url }] : []),
    ...(friendProfiles ?? [])
      .filter((f) => f.avatar_url)
      .map((f) => ({ id: f.id, path: f.avatar_url as string })),
  ];
  await Promise.all(
    avatarSources.map(async ({ id, path }) => {
      const { data } = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60);
      if (data?.signedUrl) avatarUrlById.set(id, data.signedUrl);
    })
  );

  // My private nicknames for friends -- fallback to their real name
  // wherever a nickname isn't set.
  const { data: nicknameRows } = friendIds.length
    ? await supabase
        .from("friend_nicknames")
        .select("friend_id, nickname")
        .eq("user_id", user.id)
        .in("friend_id", friendIds)
    : { data: [] };
  const nicknameByFriendId = new Map(
    (nicknameRows ?? []).map((n) => [n.friend_id, n.nickname])
  );
  function labelFor(id: string, realName: string | null) {
    return nicknameByFriendId.get(id) ?? realName ?? "?";
  }

  // ---- Determine scope: everyone / me / one specific friend ---------
  const scopeAuthorId =
    friendParam === "all" ? null : friendParam === "me" ? user.id : friendParam;

  // Your own Lists, shown as a filter row -- always your own, regardless
  // of who's currently in the "friend" scope, since Lists are a personal
  // organizing tool, not tied to whoever's being browsed.
  const { data: myLists } = await supabase
    .from("lists")
    .select("id, name")
    .eq("owner_id", user.id)
    .eq("type", "recipe");

  // If a list tab is active, narrow to just the recipe ids in that list.
  let listFilterRecipeIds: string[] | null = null;
  if (activeList) {
    const { data: itemsInList } = await supabase
      .from("list_items")
      .select("recipe_id")
      .eq("list_id", activeList)
      .not("recipe_id", "is", null);
    listFilterRecipeIds = (itemsInList ?? []).map((i) => i.recipe_id as string);
  }

  // ---- Fetch recipes for this scope ----------------------------------
  // RLS already guarantees this only ever returns our own recipes plus
  // accepted friends' -- scope/search/tag are just narrowing further.
  let query = supabase
    .from("recipes")
    .select(
      "id, author_id, title, tags, prep_time_minutes, servings, photo_urls, author:author_id(display_name)"
    )
    .order("created_at", { ascending: false });

  // Search matches recipe title, tags, OR the author's name -- name
  // matching is done against the friend list already fetched above, no
  // extra query needed since that's the entire visible circle anyway.
  const qLower = q.trim().toLowerCase();
  const nameMatchIds = new Set<string>();
  if (qLower) {
    if (ownProfile?.display_name?.toLowerCase().includes(qLower)) {
      nameMatchIds.add(user.id);
    }
    (friendProfiles ?? []).forEach((f) => {
      const nick = nicknameByFriendId.get(f.id);
      const realMatches = f.display_name?.toLowerCase().includes(qLower);
      const nickMatches = nick?.toLowerCase().includes(qLower);
      if (realMatches || nickMatches) nameMatchIds.add(f.id);
    });
  }

  // An avatar should show if the person's NAME matches, OR they have at
  // least one matching recipe -- checked across the whole circle
  // (unscoped by the currently-selected friend), so e.g. Mom still shows
  // up highlighted for "ramen" even while you're browsing Jordan's list.
  const visibleAuthorIds = new Set(nameMatchIds);
  if (qLower) {
    const { data: matchesAcrossCircle } = await supabase
      .from("recipes")
      .select("author_id")
      .or(`title.ilike.%${q}%,tags.cs.{${q}}`);
    (matchesAcrossCircle ?? []).forEach((r) => visibleAuthorIds.add(r.author_id));
  }

  if (scopeAuthorId) query = query.eq("author_id", scopeAuthorId);
  if (activeTag) query = query.contains("tags", [activeTag]);
  if (listFilterRecipeIds) query = query.in("id", listFilterRecipeIds);
  if (q) {
    const orParts = [`title.ilike.%${q}%`, `tags.cs.{${q}}`];
    if (nameMatchIds.size > 0) {
      orParts.push(`author_id.in.(${[...nameMatchIds].join(",")})`);
    }
    query = query.or(orParts.join(","));
  }

  const { data: recipes } = await query;
  const allRecipes = await Promise.all(
    (recipes ?? []).map(async (r: any) => {
      if (!r.photo_urls?.length) return { ...r, thumbUrl: null };
      const { data } = await supabase.storage
        .from("recipe-photos")
        .createSignedUrl(r.photo_urls[0], 60 * 60);
      return { ...r, thumbUrl: data?.signedUrl ?? null };
    })
  );

  // ---- Tag chips: frequency-sorted across the current result set ----
  const tagCounts = new Map<string, number>();
  allRecipes.forEach((r: any) => {
    (r.tags ?? []).forEach((t: string) => tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1));
  });
  const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  // ---- My engagement, for the 4-tier ranking -------------------------
  const { data: myListItems } = await supabase
    .from("list_items")
    .select("recipe_id, list:list_id!inner(owner_id)")
    .eq("list.owner_id", user.id)
    .not("recipe_id", "is", null);
  const myListedRecipeIds = new Set((myListItems ?? []).map((i: any) => i.recipe_id));

  const { data: myFavorites } = await supabase
    .from("recipe_favorites")
    .select("recipe_id")
    .eq("user_id", user.id);
  const myFavoritedRecipeIds = new Set((myFavorites ?? []).map((f) => f.recipe_id));

  const tiers: Record<1 | 2 | 3 | 4, any[]> = { 1: [], 2: [], 3: [], 4: [] };
  for (const r of allRecipes) {
    if (myListedRecipeIds.has(r.id)) tiers[1].push(r);
    else if (r.author_id === user.id) tiers[2].push(r);
    else if (myFavoritedRecipeIds.has(r.id)) tiers[3].push(r);
    else tiers[4].push(r);
  }

  const sections = [
    { key: 1, label: "In your lists", items: tiers[1] },
    { key: 2, label: "Your recipes", items: tiers[2] },
    { key: 3, label: "Favorited", items: tiers[3] },
    { key: 4, label: "More from friends", items: tiers[4] },
  ].filter((s) => s.items.length > 0);

  function buildHref(overrides: Record<string, string | null>) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (friendParam !== "all") params.set("friend", friendParam);
    if (activeTag) params.set("tag", activeTag);
    if (activeList) params.set("list", activeList);
    for (const [key, value] of Object.entries(overrides)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    const qs = params.toString();
    return qs ? `/recipes?${qs}` : "/recipes";
  }

  return (
    <main className="max-w-2xl mx-auto px-6 py-12">
      <div className="flex items-center justify-between mb-4">
        <Link href="/">
          <h1 className="font-display text-3xl">Table</h1>
        </Link>
        <div className="flex gap-4 text-sm">
          <Link href="/lists" className="text-table-400 hover:text-table-100">
            Lists
          </Link>
          <Link href="/profile" className="text-table-400 hover:text-table-100">
            Profile
          </Link>
          <Link href="/friends" className="text-table-400 hover:text-table-100">
            Friends
          </Link>
        </div>
      </div>

      {/* Section switcher -- deliberately the most visually prominent
          thing on the page, so it's always obvious which side you're on
          and how to switch. */}
      <div className="flex gap-2 mb-6">
        <div className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg border-2 border-herb-600 bg-herb-600 text-table-50 font-medium">
          <i className="ti ti-tools-kitchen-2" style={{ fontSize: 18 }} />
          Recipes
        </div>
        <Link
          href="/restaurants"
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg border-2 border-table-700 text-table-400 font-medium hover:border-table-500 hover:text-table-200 transition-colors"
        >
          <i className="ti ti-map-pin" style={{ fontSize: 18 }} />
          Restaurants
        </Link>
      </div>

      <div className="flex justify-end mb-6">
        <Link
          href="/recipes/new"
          className="text-sm text-herb-400 hover:text-herb-300 font-medium flex items-center gap-1"
        >
          <i className="ti ti-plus" style={{ fontSize: 14 }} />
          New recipe
        </Link>
      </div>

      <SearchBar />

      {/* Friend selector */}
      <div className="flex gap-3 overflow-x-auto pb-1 mb-4">
        <Link
          href={buildHref({ friend: null, list: null })}
          className="flex flex-col items-center gap-1.5 flex-shrink-0"
        >
          <div
            className={`w-11 h-11 rounded-full border flex items-center justify-center text-xs ${
              friendParam === "all"
                ? "border-herb-500 text-herb-400"
                : "border-table-700 text-table-500"
            }`}
          >
            All
          </div>
          <span className="text-xs text-table-500">Everyone</span>
        </Link>
        {(!qLower || visibleAuthorIds.has(user.id)) && (
          <Link
            href={`/people/${user.id}`}
            className="flex flex-col items-center gap-1.5 flex-shrink-0"
          >
            {avatarUrlById.has(user.id) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrlById.get(user.id)}
                alt="Me"
                className={`w-11 h-11 rounded-full object-cover ${
                  nameMatchIds.has(user.id) ? "ring-2 ring-herb-400" : ""
                }`}
              />
            ) : (
              <div
                className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-medium bg-table-800 text-table-400 ${
                  nameMatchIds.has(user.id) ? "ring-2 ring-herb-400" : ""
                }`}
              >
                Me
              </div>
            )}
            <span className="text-xs text-table-500">You</span>
          </Link>
        )}
        {(friendProfiles ?? [])
          .filter((f) => !qLower || visibleAuthorIds.has(f.id))
          .map((f) => (
          <Link
            key={f.id}
            href={`/people/${f.id}`}
            className="flex flex-col items-center gap-1.5 flex-shrink-0"
          >
            {avatarUrlById.has(f.id) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrlById.get(f.id)}
                alt={labelFor(f.id, f.display_name)}
                className={`w-11 h-11 rounded-full object-cover ${
                  nameMatchIds.has(f.id) ? "ring-2 ring-herb-400" : ""
                }`}
              />
            ) : (
              <div
                className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-medium bg-table-800 text-table-400 ${
                  nameMatchIds.has(f.id) ? "ring-2 ring-herb-400" : ""
                }`}
              >
                {labelFor(f.id, f.display_name)?.[0]?.toUpperCase() ?? "?"}
              </div>
            )}
            <span className="text-xs text-table-500 text-center max-w-[64px] leading-tight">
              {labelFor(f.id, f.display_name)}
            </span>
          </Link>
        ))}
      </div>

      {/* Your Lists -- filters results below to just that list, with a
          link to manage it properly over on /lists. */}
      {(myLists ?? []).length > 0 && (
        <div className="flex items-center gap-2 mb-4 border-b border-table-700 pb-3 flex-wrap">
          <Link
            href={buildHref({ list: null })}
            className={`text-xs px-2.5 py-1 rounded-md ${
              !activeList ? "font-medium text-table-100" : "text-table-500"
            }`}
          >
            All
          </Link>
          {(myLists ?? []).map((l) => (
            <Link
              key={l.id}
              href={buildHref({ list: l.id })}
              className={`text-xs px-2.5 py-1 rounded-md ${
                activeList === l.id ? "text-herb-400 bg-table-800" : "text-table-500"
              }`}
            >
              {l.name}
            </Link>
          ))}
          <Link
            href="/lists"
            className="text-xs text-table-600 hover:text-table-400 ml-auto flex items-center gap-1"
          >
            <i className="ti ti-settings" style={{ fontSize: 12 }} />
            Manage
          </Link>
        </div>
      )}

      {/* Tag chips */}
      {topTags.length > 0 && (
        <div className="flex gap-2 mb-6 flex-wrap">
          {activeTag && (
            <Link
              href={buildHref({ tag: null })}
              className="text-xs bg-table-800 text-herb-400 px-2.5 py-1 rounded-md"
            >
              {activeTag} ✕
            </Link>
          )}
          {topTags
            .filter(([t]) => t !== activeTag)
            .map(([t, count]) => (
              <Link
                key={t}
                href={buildHref({ tag: t })}
                className="text-xs border border-table-700 text-table-400 px-2.5 py-1 rounded-md hover:border-table-500"
              >
                {t} ({count})
              </Link>
            ))}
        </div>
      )}

      {sections.length === 0 ? (
        <div className="text-center py-16">
          <i className="ti ti-tools-kitchen-2" style={{ fontSize: 32, color: "#3a352c" }} />
          <p className="text-table-500 mt-3">
            Nothing here yet. Try a different search, or share your first recipe.
          </p>
        </div>
      ) : (
        <div className="space-y-10">
          {sections.map((section) => (
            <div key={section.key}>
              <p className="text-xs font-medium text-herb-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <i className="ti ti-point-filled" style={{ fontSize: 8 }} />
                {section.label}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {section.items.map((r: any) => (
                  <div
                    key={r.id}
                    className="rounded-xl border border-table-700 bg-table-900 card-surface overflow-hidden hover:border-herb-500 hover:-translate-y-0.5 transition-all duration-200 flex flex-col"
                  >
                    <Link href={`/recipes/${r.id}`}>
                      {r.thumbUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={r.thumbUrl}
                          alt={r.title}
                          className="w-full h-36 object-cover"
                        />
                      ) : (
                        <div className="w-full h-36 bg-table-950 flex items-center justify-center">
                          <i
                            className="ti ti-tools-kitchen-2"
                            style={{ fontSize: 28, color: "#3a352c" }}
                          />
                        </div>
                      )}
                    </Link>
                    <div className="p-4 flex-1 flex flex-col">
                      {r.author_id !== user.id && (
                        <span className="text-[11px] text-table-500 mb-1">
                          {labelFor(r.author_id, r.author?.display_name) ?? "Someone"}
                        </span>
                      )}
                      <Link href={`/recipes/${r.id}`} className="hover:text-herb-400">
                        <p className="font-display text-lg leading-tight mb-1.5">{r.title}</p>
                      </Link>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-table-500 mb-2">
                        {r.prep_time_minutes && (
                          <span className="flex items-center gap-1">
                            <i className="ti ti-clock" style={{ fontSize: 12 }} />
                            {r.prep_time_minutes} min
                          </span>
                        )}
                      </div>
                      {r.tags && r.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {r.tags.slice(0, 2).map((t: string) => (
                            <span
                              key={t}
                              className="text-[10px] bg-herb-600/15 text-herb-400 px-2 py-0.5 rounded-full font-medium"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                      {r.author_id !== user.id && (
                        <div className="mt-auto pt-1">
                          <FavoriteButton
                            recipeId={r.id}
                            initialFavorited={myFavoritedRecipeIds.has(r.id)}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
