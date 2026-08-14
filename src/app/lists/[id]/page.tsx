import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import RemoveFromListButton from "./RemoveFromListButton";
import ListSettings from "./ListSettings";

export default async function ListDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // RLS ("own or friend's list") covers visibility, but only the owner
  // should get rename/delete controls -- checked below via isOwner.
  const { data: list } = await supabase
    .from("lists")
    .select("id, owner_id, name")
    .eq("id", params.id)
    .single();

  if (!list) notFound();

  const isOwner = list.owner_id === user.id;

  const { data: items } = await supabase
    .from("list_items")
    .select("id, recipe:recipe_id(id, title, prep_time_minutes)")
    .eq("list_id", list.id);

  const recipeItems = (items ?? []).filter((i) => i.recipe);

  return (
    <main className="max-w-lg mx-auto px-6 py-12">
      <Link href="/lists" className="text-sm text-table-400 hover:text-table-100">
        ← Back to Lists
      </Link>

      <div className="flex items-center justify-between mt-4 mb-6">
        <h1 className="font-display text-3xl">{list.name}</h1>
        {isOwner && <ListSettings listId={list.id} initialName={list.name} />}
      </div>

      {recipeItems.length === 0 ? (
        <p className="text-table-500 text-sm">
          Nothing on this list yet. Add a recipe to it from the recipe's page.
        </p>
      ) : (
        <ul className="space-y-2">
          {recipeItems.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between rounded-md border border-table-700 bg-table-900 px-4 py-3"
            >
              <Link
                href={`/recipes/${(item.recipe as any).id}`}
                className="text-sm hover:text-herb-400"
              >
                {(item.recipe as any).title}
                {(item.recipe as any).prep_time_minutes && (
                  <span className="text-xs text-table-500 ml-2">
                    {(item.recipe as any).prep_time_minutes} min
                  </span>
                )}
              </Link>
              {isOwner && <RemoveFromListButton listItemId={item.id} />}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
