import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SearchBar from "@/app/recipes/SearchBar";
import FavoriteButton from "@/app/recipes/[id]/FavoriteButton";
import ReviewFavoriteButton from "@/app/restaurants/ReviewFavoriteButton";
import NicknameEditor from "./NicknameEditor";

export default async function FriendPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { type?: string; q?: string; tag?: string; list?: string };
}) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const personId = params.id;
  const isSelf = personId === user.id;
  const type = searchParams.type === "restaurants" ? "restaurants" : "recipes";

  // RLS ("own or friend") already guarantees this only returns something
  // if it's your own profile or an accepted friend's -- otherwise this
  // page 404s, which doubles as "you can't view a stranger's page."
  const { data: person } = await supabase
    .from("users")
    .select("id, display_name, avatar_url")
    .eq("id", personId)
    .single();

  if (!person) notFound();

  let personAvatarUrl: string | null = null;
  if (person.avatar_url) {
    const { data } = await supabase.storage
      .from("avatars")
      .createSignedUrl(person.avatar_url, 60 * 60);
    personAvatarUrl = data?.signedUrl ?? null;
  }

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
    .eq("owner_id", personId)
    .eq("type", type === "restaurants" ? "restaurant" : "recipe");

  const basePath = `/people/${personId}`;

  function buildHref(overrides: Record<string, string | null>) {
    const params = new URLSearchParams();
    if (type !== "recipes") params.set("type", type);
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

  // ---------------------------------------------------------------
  // RECIPES branch
  // ---------------------------------------------------------------
  let recipeItems: any[] = [];
  let recipeTopTags: [string, number][] = [];
  let recipeMyFavoritedIds = new Set<string>();

  if (type === "recipes") {
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
      .select("id, author_id, title, tags, prep_time_minutes, servings, photo_url")
      .eq("author_id", personId)
      .order("created_at", { ascending: false });

    if (activeTag) query = query.contains("tags", [activeTag]);
    if (listFilterRecipeIds) query = query.in("id", listFilterRecipeIds);
    if (q) query = query.or(`title.ilike.%${q}%,tags.cs.{${q}}`);

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

    const tagCounts = new Map<string, number>();
    allRecipes.forEach((r) => {
      (r.tags ?? []).forEach((t: string) => tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1));
    });
    recipeTopTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

    const { data: myListItems } = await supabase
      .from("list_items")
      .select("recipe_id, list:list_id!inner(owner_id)")
      .eq("list.owner_id", user.id)
      .not("recipe_id", "is", null);
    const myListedIds = new Set((myListItems ?? []).map((i: any) => i.recipe_id));

    const { data: myFavorites } = await supabase
      .from("recipe_favorites")
      .select("recipe_id")
      .eq("user_id", user.id);
    recipeMyFavoritedIds = new Set((myFavorites ?? []).map((f) => f.recipe_id));

    const tiers: Record<1 | 2 | 3 | 4, any[]> = { 1: [], 2: [], 3: [], 4: [] };
    for (const r of allRecipes) {
      if (myListedIds.has(r.id)) tiers[1].push(r);
      else if (r.author_id === user.id) tiers[2].push(r);
      else if (recipeMyFavoritedIds.has(r.id)) tiers[3].push(r);
      else tiers[4].push(r);
    }
    recipeItems = [
      { key: 1, label: "In your lists", items: tiers[1] },
      { key: 2, label: "Your recipes", items: tiers[2] },
      { key: 3, label: "Favorited", items: tiers[3] },
      { key: 4, label: "More recipes", items: tiers[4] },
    ].filter((s) => s.items.length > 0);
  }

  // ---------------------------------------------------------------
  // RESTAURANTS branch
  // ---------------------------------------------------------------
  let reviewItems: any[] = [];
  let reviewTopTags: [string, number][] = [];
  let reviewMyFavoritedIds = new Set<string>();

  if (type === "restaurants") {
    let listFilterReviewIds: string[] | null = null;
    if (activeList) {
      const { data: itemsInList } = await supabase
        .from("list_items")
        .select("review_id")
        .eq("list_id", activeList)
        .not("review_id", "is", null);
      listFilterReviewIds = (itemsInList ?? []).map((i) => i.review_id as string);
    }

    let query = supabase
      .from("restaurant_reviews")
      .select("id, author_id, restaurant_name, rating, tags, review_text, photo_urls")
      .eq("author_id", personId)
      .order("created_at", { ascending: false });

    if (activeTag) query = query.contains("tags", [activeTag]);
    if (listFilterReviewIds) query = query.in("id", listFilterReviewIds);
    if (q) query = query.or(`restaurant_name.ilike.%${q}%,tags.cs.{${q}},review_text.ilike.%${q}%`);

    const { data: reviews } = await query;
    const allReviews = await Promise.all(
      (reviews ?? []).map(async (r: any) => {
        const primaryPath = r.photo_urls?.[0];
        if (!primaryPath) return { ...r, thumbUrl: null };
        const { data } = await supabase.storage
          .from("review-photos")
          .createSignedUrl(primaryPath, 60 * 60);
        return { ...r, thumbUrl: data?.signedUrl ?? null };
      })
    );

    const tagCounts = new Map<string, number>();
    allReviews.forEach((r) => {
      (r.tags ?? []).forEach((t: string) => tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1));
    });
    reviewTopTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

    const { data: myListItems } = await supabase
      .from("list_items")
      .select("review_id, list:list_id!inner(owner_id)")
      .eq("list.owner_id", user.id)
      .not("review_id", "is", null);
    const myListedIds = new Set((myListItems ?? []).map((i: any) => i.review_id));

    const { data: myFavorites } = await supabase
      .from("review_favorites")
      .select("review_id")
      .eq("user_id", user.id);
    reviewMyFavoritedIds = new Set((myFavorites ?? []).map((f) => f.review_id));

    const tiers: Record<1 | 2 | 3 | 4, any[]> = { 1: [], 2: [], 3: [], 4: [] };
    for (const r of allReviews) {
      if (myListedIds.has(r.id)) tiers[1].push(r);
      else if (r.author_id === user.id) tiers[2].push(r);
      else if (reviewMyFavoritedIds.has(r.id)) tiers[3].push(r);
      else tiers[4].push(r);
    }
    reviewItems = [
      { key: 1, label: "In your lists", items: tiers[1] },
      { key: 2, label: "Your reviews", items: tiers[2] },
      { key: 3, label: "Favorited", items: tiers[3] },
      { key: 4, label: "More reviews", items: tiers[4] },
    ].filter((s) => s.items.length > 0);
  }

  const topTags = type === "recipes" ? recipeTopTags : reviewTopTags;
  const sections = type === "recipes" ? recipeItems : reviewItems;

  return (
    <main className="max-w-2xl mx-auto px-6 py-12">
      <Link href="/recipes" className="text-sm text-table-400 hover:text-table-100">
        ← Back
      </Link>

      <div className="flex items-center gap-3 mt-4 mb-2">
        {personAvatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={personAvatarUrl}
            alt={displayLabel ?? ""}
            className="w-14 h-14 rounded-full object-cover"
          />
        ) : (
          <div className="w-14 h-14 rounded-full bg-herb-600 flex items-center justify-center text-xl font-medium text-table-50">
            {displayLabel?.[0]?.toUpperCase() ?? "?"}
          </div>
        )}
        <div>
          <h1 className="font-display text-2xl">{isSelf ? "You" : displayLabel}</h1>
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

      {/* Content type tabs */}
      <div className="flex gap-2 mb-4 border-b border-table-700 pb-3">
        <Link
          href={`${basePath}${q ? `?q=${encodeURIComponent(q)}` : ""}`}
          className={`text-sm px-3 py-1.5 rounded-md ${
            type === "recipes" ? "bg-table-800 text-herb-400" : "text-table-500"
          }`}
        >
          Recipes
        </Link>
        <Link
          href={`${basePath}?type=restaurants${q ? `&q=${encodeURIComponent(q)}` : ""}`}
          className={`text-sm px-3 py-1.5 rounded-md ${
            type === "restaurants" ? "bg-table-800 text-herb-400" : "text-table-500"
          }`}
        >
          Restaurants
        </Link>
      </div>

      <SearchBar
        basePath={basePath}
        placeholder={
          type === "restaurants"
            ? "Search restaurants by name or tag…"
            : "Search recipes by name or tag…"
        }
      />

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
          {sections.map((section: any) => (
            <div key={section.key}>
              <p className="text-xs font-medium text-table-400 mb-2">{section.label}</p>

              {type === "recipes" ? (
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
                            initialFavorited={recipeMyFavoritedIds.has(r.id)}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {section.items.map((r: any) => (
                    <div
                      key={r.id}
                      className="rounded-lg border border-table-700 bg-table-900 p-3 flex gap-3"
                    >
                      {r.thumbUrl ? (
                        <Link href={`/reviews/${r.id}`} className="flex-shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={r.thumbUrl}
                            alt={r.restaurant_name}
                            className="w-20 h-20 rounded-md object-contain bg-table-950"
                          />
                        </Link>
                      ) : (
                        <Link
                          href={`/reviews/${r.id}`}
                          className="w-20 h-20 rounded-md bg-table-950 flex items-center justify-center flex-shrink-0"
                        >
                          <i
                            className="ti ti-tools-kitchen-2"
                            style={{ fontSize: 24, color: "#524b3d" }}
                          />
                        </Link>
                      )}
                      <div className="flex-1 min-w-0 flex flex-col">
                        <div className="flex items-start justify-between gap-2">
                          <Link
                            href={`/reviews/${r.id}`}
                            className="text-sm font-medium hover:text-herb-400"
                          >
                            {r.restaurant_name}
                          </Link>
                          <p className="text-xs text-table-400 flex items-center gap-1 flex-shrink-0">
                            <i
                              className="ti ti-star-filled"
                              style={{ fontSize: 12, color: "#e0b04d" }}
                            />
                            {r.rating}
                          </p>
                        </div>
                        {r.review_text && (
                          <p className="text-xs text-table-400 mt-1 line-clamp-2">
                            {r.review_text}
                          </p>
                        )}
                        {!isSelf && (
                          <div className="mt-auto pt-2">
                            <ReviewFavoriteButton
                              reviewId={r.id}
                              initialFavorited={reviewMyFavoritedIds.has(r.id)}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
