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
    .select("id, name, created_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  const listIds = (lists ?? []).map((l) => l.id);

  const { data: items } = listIds.length
    ? await supabase
        .from("list_items")
        .select("id, list_id, recipe:recipe_id(id, title, prep_time_minutes)")
        .in("list_id", listIds)
    : { data: [] };

  const itemsByList = new Map<string, any[]>();
  (items ?? []).forEach((i) => {
    if (!i.recipe) return; // review items skipped for now -- no review list UI yet
    const arr = itemsByList.get(i.list_id) ?? [];
    arr.push({
      itemId: i.id,
      recipeId: (i.recipe as any).id,
      title: (i.recipe as any).title,
      prepTimeMinutes: (i.recipe as any).prep_time_minutes,
    });
    itemsByList.set(i.list_id, arr);
  });

  return (
    <main className="max-w-lg mx-auto px-6 py-12">
      <Link href="/recipes" className="text-sm text-table-400 hover:text-table-100">
        ← Back
      </Link>

      <h1 className="font-display text-3xl mt-4 mb-6">Your Lists</h1>

      <NewListForm />

      {(lists ?? []).length === 0 ? (
        <p className="text-table-500 text-sm">
          No lists yet. Create one above, or add a recipe to a list from its page.
        </p>
      ) : (
        <ul className="space-y-2">
          {(lists ?? []).map((l) => (
            <ListAccordionItem
              key={l.id}
              listId={l.id}
              name={l.name}
              items={itemsByList.get(l.id) ?? []}
            />
          ))}
        </ul>
      )}
    </main>
  );
}
