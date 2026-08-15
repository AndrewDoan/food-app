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
    ? await supabase.from("users").select("id, display_name").in("id", friendIds)
    : { data: [] };

  const { data: ownProfile } = await supabase
    .from("users")
    .select("display_name")
    .eq("id", user.id)
    .single();

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

  // Lists only belong to one person -- only show list tabs when a
  // specific person (not "everyone") is selected.
  const { data: scopeLists } = scopeAuthorId
    ? await supabase.from("lists").select("id, name").eq("owner_id", scopeAuthorId)
    : { data: [] };

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
      "id, author_id, title, tags, prep_time_minutes, servings, photo_url, author:author_id(display_name)"
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
      if (!r.photo_url) return { ...r, thumbUrl: null };
      const { data } = await supabase.storage
        .from("recipe-photos")
        .createSignedUrl(r.photo_url, 60 * 60);
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
      <div className="flex items-center justify-between mb-6">
        <Link href="/">
          <h1 className="font-display text-3xl">Table</h1>
        </Link>
        <div className="flex gap-4 text-sm">
          <Link href="/restaurants" className="text-table-400 hover:text-table-100">
            Restaurants
          </Link>
          <Link href="/lists" className="text-table-400 hover:text-table-100">
            Lists
          </Link>
          <Link href="/profile" className="text-table-400 hover:text-table-100">
            Profile
          </Link>
          <Link href="/friends" className="text-table-400 hover:text-table-100">
            Friends
          </Link>
          <Link href="/reviews/new" className="text-herb-400 hover:text-herb-300 font-medium">
            + New review
          </Link>
          <Link href="/recipes/new" className="text-herb-400 hover:text-herb-300 font-medium">
            + New recipe
          </Link>
        </div>
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
            <div
              className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-medium bg-table-800 text-table-400 ${
                nameMatchIds.has(user.id) ? "ring-2 ring-herb-400" : ""
              }`}
            >
              Me
            </div>
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
            <div
              className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-medium bg-table-800 text-table-400 ${
                nameMatchIds.has(f.id) ? "ring-2 ring-herb-400" : ""
              }`}
            >
              {labelFor(f.id, f.display_name)?.[0]?.toUpperCase() ?? "?"}
            </div>
            <span className="text-xs text-table-500 text-center w-16 leading-tight">
              {labelFor(f.id, f.display_name)}
            </span>
          </Link>
        ))}
      </div>

      {/* List tabs -- only when browsing one specific person */}
      {(scopeLists ?? []).length > 0 && (
        <div className="flex gap-2 mb-4 border-b border-table-700 pb-3 flex-wrap">
          <Link
            href={buildHref({ list: null })}
            className={`text-xs px-2.5 py-1 rounded-md ${
              !activeList ? "font-medium text-table-100" : "text-table-500"
            }`}
          >
            All
          </Link>
          {(scopeLists ?? []).map((l) => (
            <Link
              key={l.id}
              href={buildHref({ list: l.id })}
              className={`text-xs px-2.5 py-1 rounded-md ${
                activeList === l.id
                  ? "bg-bg-accent text-herb-400 bg-table-800"
                  : "text-table-500"
              }`}
            >
              {l.name}
            </Link>
          ))}
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
        <p className="text-table-500">
          Nothing matches yet. Try a different search, or add a friend to see more.
        </p>
      ) : (
        <div className="space-y-8">
          {sections.map((section) => (
            <div key={section.key}>
              <p className="text-xs font-medium text-table-400 mb-2">{section.label}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {section.items.map((r: any) => (
                  <div
                    key={r.id}
                    className="rounded-lg border border-table-700 bg-table-900 overflow-hidden"
                  >
                    {r.thumbUrl && (
                      <Link href={`/recipes/${r.id}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={r.thumbUrl}
                          alt={r.title}
                          className="w-full h-24 object-cover"
                        />
                      </Link>
                    )}
                    <div className="p-3">
                      {r.author_id !== user.id && (
                        <Link
                          href={`/people/${r.author_id}`}
                          className="text-[11px] text-table-500 hover:text-herb-400 mb-1 block"
                        >
                          {labelFor(r.author_id, r.author?.display_name) ?? "Someone"}
                        </Link>
                      )}
                      <Link href={`/recipes/${r.id}`} className="hover:text-herb-400">
                        <p className="text-sm font-medium mb-1">{r.title}</p>
                      </Link>
                      {r.prep_time_minutes && (
                        <p className="text-[11px] text-table-500 mb-1.5">
                          <i className="ti ti-clock" style={{ fontSize: 11 }} />{" "}
                          {r.prep_time_minutes} min
                        </p>
                      )}
                      {r.author_id !== user.id && (
                        <FavoriteButton
                          recipeId={r.id}
                          initialFavorited={myFavoritedRecipeIds.has(r.id)}
                        />
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
