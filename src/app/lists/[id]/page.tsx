import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import NewListForm from "./NewListForm";
import ListAccordionItem from "./ListAccordionItem";

export default async function ListsPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: lists } = await supabase
    .from("lists")
    .select("id, name, type, created_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  const listIds = (lists ?? []).map((l) => l.id);

  const { data: items } = listIds.length
    ? await supabase
        .from("list_items")
        .select(
          "id, list_id, recipe:recipe_id(id, title, prep_time_minutes, photo_urls, author_id, author:author_id(display_name)), review:review_id(id, restaurant_name, rating, photo_urls, author_id, author:author_id(display_name))"
        )
        .in("list_id", listIds)
    : { data: [] };

  // My private nicknames for whoever's friends' items appear on my
  // lists (via favorites) -- same as everywhere else in the app.
  const { data: nicknameRows } = await supabase
    .from("friend_nicknames")
    .select("friend_id, nickname")
    .eq("user_id", user.id);
  const nicknameByFriendId = new Map((nicknameRows ?? []).map((n) => [n.friend_id, n.nickname]));
  function authorLabel(authorId: string, realName: string | null) {
    if (authorId === user.id) return "You";
    return nicknameByFriendId.get(authorId) ?? realName ?? "Someone";
  }

  const itemsByList = new Map<string, any[]>();
  await Promise.all(
    (items ?? []).map(async (i: any) => {
      const arr = itemsByList.get(i.list_id) ?? [];
      itemsByList.set(i.list_id, arr);

      if (i.recipe) {
        let thumbUrl: string | null = null;
        if (i.recipe.photo_urls?.length) {
          const { data } = await supabase.storage
            .from("recipe-photos")
            .createSignedUrl(i.recipe.photo_urls[0], 60 * 60);
          thumbUrl = data?.signedUrl ?? null;
        }
        arr.push({
          itemId: i.id,
          recipeId: i.recipe.id,
          title: i.recipe.title,
          prepTimeMinutes: i.recipe.prep_time_minutes,
          thumbUrl,
          author: authorLabel(i.recipe.author_id, i.recipe.author?.display_name ?? null),
        });
      } else if (i.review) {
        const primaryPath = i.review.photo_urls?.[0];
        let thumbUrl: string | null = null;
        if (primaryPath) {
          const { data } = await supabase.storage
            .from("review-photos")
            .createSignedUrl(primaryPath, 60 * 60);
          thumbUrl = data?.signedUrl ?? null;
        }
        arr.push({
          itemId: i.id,
          reviewId: i.review.id,
          restaurantName: i.review.restaurant_name,
          rating: i.review.rating,
          thumbUrl,
          author: authorLabel(i.review.author_id, i.review.author?.display_name ?? null),
        });
      }
    })
  );

  const recipeLists = (lists ?? []).filter((l) => l.type === "recipe");
  const restaurantLists = (lists ?? []).filter((l) => l.type === "restaurant");

  return (
    <main className="max-w-lg mx-auto px-6 py-12">
      <Link href="/recipes" className="text-sm text-table-400 hover:text-table-100">
        ← Back
      </Link>

      <h1 className="font-display text-3xl mt-4 mb-6">Your Lists</h1>

      <NewListForm />

      {(lists ?? []).length === 0 ? (
        <p className="text-table-500 text-sm">
          No lists yet. Create one above, or add a recipe/review to a list from its page.
        </p>
      ) : (
        <div className="space-y-8">
          <div>
            <p className="text-xs font-medium text-table-400 mb-2">Recipe Lists</p>
            {recipeLists.length === 0 ? (
              <p className="text-table-600 text-sm">None yet.</p>
            ) : (
              <ul className="space-y-2">
                {recipeLists.map((l) => (
                  <ListAccordionItem
                    key={l.id}
                    listId={l.id}
                    name={l.name}
                    kind="recipe"
                    items={itemsByList.get(l.id) ?? []}
                  />
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="text-xs font-medium text-table-400 mb-2">Restaurant Lists</p>
            {restaurantLists.length === 0 ? (
              <p className="text-table-600 text-sm">None yet.</p>
            ) : (
              <ul className="space-y-2">
                {restaurantLists.map((l) => (
                  <ListAccordionItem
                    key={l.id}
                    listId={l.id}
                    name={l.name}
                    kind="restaurant"
                    items={itemsByList.get(l.id) ?? []}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
