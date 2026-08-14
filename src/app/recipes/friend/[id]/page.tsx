import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SearchBar from "../../SearchBar";
import FavoriteButton from "../../[id]/FavoriteButton";
import NicknameEditor from "./NicknameEditor";

export default async function FriendRecipesPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { q?: string; tag?: string; list?: string };
}) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const personId = params.id;
  const isSelf = personId === user.id;

  // RLS ("own or friend") already guarantees this only returns something
  // if it's your own profile or an accepted friend's -- otherwise this
  // page 404s, which doubles as "you can't view a stranger's page."
  const { data: person } = await supabase
    .from("users")
    .select("id, display_name")
    .eq("id", personId)
    .single();

  if (!person) notFound();

  // Nicknames are private to the viewer -- only fetched/shown when
  // looking at a friend's page, never your own.
  let nickname: string | null = null;
  if (!isSelf) {
    const { data: nicknameRow } = await supabase
      .from("friend_nicknames")
      .select("nickname")
      .eq("user_id", user.id)
      .eq("friend_id", personId)
      .maybeSingle();
    nickname = nicknameRow?.nickname ?? null;
  }

  const displayLabel = nickname ?? person.display_name;

  const q = searchParams.q ?? "";
  const activeTag = searchParams.tag ?? "";
  const activeList = searchParams.list ?? "";

  const { data: personLists } = await supabase
    .from("lists")
    .select("id, name")
    .eq("owner_id", personId);

  let listFilterRecipeIds: string[] | null = null;
  if (activeList) {
    const { data: itemsInList } = await supabase
      .from("list_items")
      .select("recipe_id")
      .eq("list_id", activeList)
      .not("recipe_id", "is", null);
    listFilterRecipeIds = (itemsInList ?? []).map((i) => i.recipe_id as string);
  }

  let query = supabase
    .from("recipes")
    .select("id, author_id, title, tags, prep_time_minutes, servings")
    .eq("author_id", personId)
    .order("created_at", { ascending: false });

  if (activeTag) query = query.contains("tags", [activeTag]);
  if (listFilterRecipeIds) query = query.in("id", listFilterRecipeIds);
  if (q) query = query.or(`title.ilike.%${q}%,tags.cs.{${q}}`);

  const { data: recipes } = await query;
  const allRecipes = recipes ?? [];

  const tagCounts = new Map<string, number>();
  allRecipes.forEach((r) => {
    (r.tags ?? []).forEach((t: string) => tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1));
  });
  const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

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
    { key: 4, label: "More recipes", items: tiers[4] },
  ].filter((s) => s.items.length > 0);

  const basePath = `/recipes/friend/${personId}`;

  function buildHref(overrides: Record<string, string | null>) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (activeTag) params.set("tag", activeTag);
    if (activeList) params.set("list", activeList);
    for (const [key, value] of Object.entries(overrides)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  return (
    <main className="max-w-2xl mx-auto px-6 py-12">
      <Link href="/recipes" className="text-sm text-table-400 hover:text-table-100">
        ← Back
      </Link>

      <div className="flex items-center gap-3 mt-4 mb-2">
        <div className="w-14 h-14 rounded-full bg-herb-600 flex items-center justify-center text-xl font-medium text-table-50">
          {displayLabel?.[0]?.toUpperCase() ?? "?"}
        </div>
        <div>
          <h1 className="font-display text-2xl">
            {isSelf ? "Your recipes" : `${displayLabel}'s recipes`}
          </h1>
          {!isSelf && nickname && (
            <p className="text-xs text-table-500">{person.display_name}</p>
          )}
        </div>
      </div>

      {!isSelf && (
        <div className="mb-4">
          <NicknameEditor friendId={personId} initialNickname={nickname} />
        </div>
      )}

      {isSelf && (
        <Link
          href="/lists"
          className="inline-block text-xs text-herb-400 hover:text-herb-300 mb-4"
        >
          Manage your Lists →
        </Link>
      )}

      <SearchBar basePath={basePath} />

      {(personLists ?? []).length > 0 && (
        <div className="flex gap-2 mb-4 border-b border-table-700 pb-3 flex-wrap">
          <Link
            href={buildHref({ list: null })}
            className={`text-xs px-2.5 py-1 rounded-md ${
              !activeList ? "font-medium text-table-100" : "text-table-500"
            }`}
          >
            All
          </Link>
          {(personLists ?? []).map((l) => (
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
        </div>
      )}

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
        <p className="text-table-500">Nothing here yet.</p>
      ) : (
        <div className="space-y-8">
          {sections.map((section) => (
            <div key={section.key}>
              <p className="text-xs font-medium text-table-400 mb-2">{section.label}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {section.items.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-lg border border-table-700 bg-table-900 p-3"
                  >
                    <Link href={`/recipes/${r.id}`} className="hover:text-herb-400">
                      <p className="text-sm font-medium mb-1">{r.title}</p>
                    </Link>
                    {r.prep_time_minutes && (
                      <p className="text-[11px] text-table-500 mb-1.5">
                        <i className="ti ti-clock" style={{ fontSize: 11 }} />{" "}
                        {r.prep_time_minutes} min
                      </p>
                    )}
                    {!isSelf && (
                      <FavoriteButton
                        recipeId={r.id}
                        initialFavorited={myFavoritedRecipeIds.has(r.id)}
                      />
                    )}
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
