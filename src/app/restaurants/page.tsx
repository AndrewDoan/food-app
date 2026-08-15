import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SearchBar from "@/app/recipes/SearchBar";
import ReviewFavoriteButton from "./ReviewFavoriteButton";
import LocationFilter from "./LocationFilter";
import { haversineMiles } from "@/lib/distance";

export default async function RestaurantsPage({
  searchParams,
}: {
  searchParams: { q?: string; tag?: string; lat?: string; lng?: string; radius?: string };
}) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const q = searchParams.q ?? "";
  const activeTag = searchParams.tag ?? "";
  const myLat = searchParams.lat ? parseFloat(searchParams.lat) : null;
  const myLng = searchParams.lng ? parseFloat(searchParams.lng) : null;
  const radiusMiles = searchParams.radius ? parseFloat(searchParams.radius) : 25;
  const hasLocation = myLat !== null && myLng !== null;

  // ---- Friend names/nicknames, for search matching and display -------
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
    return nicknameByFriendId.get(id) ?? realName ?? "Someone";
  }

  const qLower = q.trim().toLowerCase();
  const nameMatchIds = new Set<string>();
  if (qLower) {
    if (ownProfile?.display_name?.toLowerCase().includes(qLower)) nameMatchIds.add(user.id);
    (friendProfiles ?? []).forEach((f) => {
      const nick = nicknameByFriendId.get(f.id);
      if (
        f.display_name?.toLowerCase().includes(qLower) ||
        nick?.toLowerCase().includes(qLower)
      ) {
        nameMatchIds.add(f.id);
      }
    });
  }

  // ---- Fetch reviews -------------------------------------------------
  // RLS already guarantees this only returns our own reviews plus
  // accepted friends' -- search/tag just narrow further.
  let query = supabase
    .from("restaurant_reviews")
    .select(
      "id, author_id, restaurant_name, rating, tags, review_text, notes, photo_urls, latitude, longitude, author:author_id(display_name)"
    )
    .order("created_at", { ascending: false });

  if (activeTag) query = query.contains("tags", [activeTag]);
  if (q) {
    const orParts = [
      `restaurant_name.ilike.%${q}%`,
      `tags.cs.{${q}}`,
      `review_text.ilike.%${q}%`,
    ];
    if (nameMatchIds.size > 0) {
      orParts.push(`author_id.in.(${[...nameMatchIds].join(",")})`);
    }
    query = query.or(orParts.join(","));
  }

  const { data: reviews } = await query;
  let allReviews = await Promise.all(
    (reviews ?? []).map(async (r: any) => {
      const primaryPath = r.photo_urls?.[0];
      let thumbUrl: string | null = null;
      if (primaryPath) {
        const { data } = await supabase.storage
          .from("review-photos")
          .createSignedUrl(primaryPath, 60 * 60);
        thumbUrl = data?.signedUrl ?? null;
      }
      const distance =
        hasLocation && r.latitude != null && r.longitude != null
          ? haversineMiles(myLat!, myLng!, r.latitude, r.longitude)
          : null;
      return { ...r, thumbUrl, distance };
    })
  );

  // When "near me" is active, drop anything outside the radius and sort
  // what's left by distance -- closest first, overriding the usual
  // newest-first order.
  if (hasLocation) {
    allReviews = allReviews
      .filter((r) => r.distance !== null && r.distance <= radiusMiles)
      .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
  }

  // ---- Tag chips -------------------------------------------------------
  const tagCounts = new Map<string, number>();
  allReviews.forEach((r) => {
    (r.tags ?? []).forEach((t: string) => tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1));
  });
  const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  // ---- My engagement, for the 4-tier ranking --------------------------
  const { data: myListItems } = await supabase
    .from("list_items")
    .select("review_id, list:list_id!inner(owner_id)")
    .eq("list.owner_id", user.id)
    .not("review_id", "is", null);
  const myListedReviewIds = new Set((myListItems ?? []).map((i: any) => i.review_id));

  const { data: myFavorites } = await supabase
    .from("review_favorites")
    .select("review_id")
    .eq("user_id", user.id);
  const myFavoritedReviewIds = new Set((myFavorites ?? []).map((f) => f.review_id));

  const tiers: Record<1 | 2 | 3 | 4, any[]> = { 1: [], 2: [], 3: [], 4: [] };
  for (const r of allReviews) {
    if (myListedReviewIds.has(r.id)) tiers[1].push(r);
    else if (r.author_id === user.id) tiers[2].push(r);
    else if (myFavoritedReviewIds.has(r.id)) tiers[3].push(r);
    else tiers[4].push(r);
  }

  const sections = [
    { key: 1, label: "In your lists", items: tiers[1] },
    { key: 2, label: "Your reviews", items: tiers[2] },
    { key: 3, label: "Favorited", items: tiers[3] },
    { key: 4, label: "More from friends", items: tiers[4] },
  ].filter((s) => s.items.length > 0);

  function buildHref(overrides: Record<string, string | null>) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (activeTag) params.set("tag", activeTag);
    for (const [key, value] of Object.entries(overrides)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    const qs = params.toString();
    return qs ? `/restaurants?${qs}` : "/restaurants";
  }

  return (
    <main className="max-w-2xl mx-auto px-6 py-12">
      <div className="flex items-center justify-between mb-6">
        <Link href="/">
          <h1 className="font-display text-3xl">Table</h1>
        </Link>
        <div className="flex gap-4 text-sm">
          <Link href="/recipes" className="text-table-400 hover:text-table-100">
            Recipes
          </Link>
          <Link href="/profile" className="text-table-400 hover:text-table-100">
            Profile
          </Link>
          <Link href="/friends" className="text-table-400 hover:text-table-100">
            Friends
          </Link>
          <Link
            href="/reviews/new"
            className="text-herb-400 hover:text-herb-300 font-medium"
          >
            + New review
          </Link>
        </div>
      </div>

      <SearchBar basePath="/restaurants" placeholder="Search restaurants by name or tag…" />

      <LocationFilter />

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
              <div className="space-y-3">
                {section.items.map((r: any) => (
                  <div
                    key={r.id}
                    className="rounded-lg border border-table-700 bg-table-900 p-3 flex gap-3"
                  >
                    {r.thumbUrl && (
                      <Link href={`/reviews/${r.id}`} className="flex-shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={r.thumbUrl}
                          alt={r.restaurant_name}
                          className="w-20 h-20 rounded-md object-contain bg-table-950"
                        />
                      </Link>
                    )}
                    <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div>
                        {r.author_id !== user.id && (
                          <Link
                            href={`/people/${r.author_id}`}
                            className="text-[11px] text-table-500 hover:text-herb-400 block"
                          >
                            {labelFor(r.author_id, r.author?.display_name)}
                          </Link>
                        )}
                        <p className="text-sm font-medium">
                          <Link href={`/reviews/${r.id}`} className="hover:text-herb-400">
                            {r.restaurant_name}
                          </Link>
                        </p>
                      </div>
                      <p className="text-xs text-table-400 flex items-center gap-1 flex-shrink-0">
                        <i className="ti ti-star-filled" style={{ fontSize: 12, color: "#e0b04d" }} />
                        {r.rating}
                        {r.distance !== null && r.distance !== undefined && (
                          <span className="text-table-500 ml-1">
                            · {r.distance < 0.1 ? "<0.1" : r.distance.toFixed(1)} mi
                          </span>
                        )}
                      </p>
                    </div>
                    {r.review_text && (
                      <p className="text-xs text-table-400 mt-1 line-clamp-2">
                        {r.review_text}
                      </p>
                    )}
                    {r.tags && r.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {r.tags.map((t: string) => (
                          <span
                            key={t}
                            className="text-[10px] bg-table-800 text-table-300 px-2 py-0.5 rounded-md"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                    {r.author_id !== user.id && (
                      <div className="mt-2">
                        <ReviewFavoriteButton
                          reviewId={r.id}
                          initialFavorited={myFavoritedReviewIds.has(r.id)}
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
