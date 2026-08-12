import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function RecipesPage() {
  const supabase = createClient();

  // No manual "friends only" filter needed here -- RLS on the recipes
  // table already guarantees this query can only ever return the
  // user's own recipes plus their accepted friends' recipes.
  const { data: recipes } = await supabase
    .from("recipes")
    .select("id, title, description, photo_url, created_at, author:author_id(display_name)")
    .order("created_at", { ascending: false });

  return (
    <main className="max-w-2xl mx-auto px-6 py-12">
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-display text-3xl">Table</h1>
          <div className="flex gap-4 text-sm">
            <Link href="/profile" className="text-table-400 hover:text-table-100">
              Profile
            </Link>
            <Link href="/friends" className="text-table-400 hover:text-table-100">
              Friends
            </Link>
            <Link
              href="/recipes/new"
              className="text-herb-400 hover:text-herb-300 font-medium"
            >
              + New recipe
            </Link>
          </div>
      </div>

      {!recipes || recipes.length === 0 ? (
        <p className="text-table-500">
          Nothing here yet. Add a friend or share your first recipe.
        </p>
      ) : (
        <ul className="space-y-4">
          {recipes.map((r: any) => (
            <li
              key={r.id}
              className="rounded-lg border border-table-700 bg-table-900 p-5"
            >
              <p className="text-xs text-table-500 mb-1">
                {r.author?.display_name ?? "Someone"}
              </p>
              <h2 className="font-display text-xl mb-1">{r.title}</h2>
              {r.description && (
                <p className="text-table-400 text-sm">{r.description}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
