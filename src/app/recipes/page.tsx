import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import DeleteRecipeButton from "./DeleteRecipeButton";

export default async function RecipesPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // No manual "friends only" filter needed here -- RLS on the recipes
  // table already guarantees this query can only ever return the
  // user's own recipes plus their accepted friends' recipes.
  const { data: recipes } = await supabase
    .from("recipes")
    .select(
      "id, author_id, title, description, photo_url, created_at, author:author_id(display_name)"
    )
    .order("created_at", { ascending: false });

  // photo_url stores a private storage path, not a public link -- generate
  // a short-lived signed URL for each one so <img> can actually load it.
  const recipesWithPhotos = await Promise.all(
    (recipes ?? []).map(async (r: any) => {
      if (!r.photo_url) return { ...r, signedPhotoUrl: null };
      const { data } = await supabase.storage
        .from("recipe-photos")
        .createSignedUrl(r.photo_url, 60 * 60); // 1 hour
      return { ...r, signedPhotoUrl: data?.signedUrl ?? null };
    })
  );

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
            href="/reviews/new"
            className="text-herb-400 hover:text-herb-300 font-medium"
          >
            + New review
          </Link>
          <Link
            href="/recipes/new"
            className="text-herb-400 hover:text-herb-300 font-medium"
          >
            + New recipe
          </Link>
        </div>
      </div>

      {!recipesWithPhotos || recipesWithPhotos.length === 0 ? (
        <p className="text-table-500">
          Nothing here yet. Add a friend or share your first recipe.
        </p>
      ) : (
        <ul className="space-y-4">
          {recipesWithPhotos.map((r: any) => (
            <li
              key={r.id}
              className="rounded-lg border border-table-700 bg-table-900 overflow-hidden"
            >
              {r.signedPhotoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={r.signedPhotoUrl}
                  alt={r.title}
                  className="w-full max-h-96 object-contain bg-table-950"
                />
              )}
              <div className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-table-500 mb-1">
                      {r.author?.display_name ?? "Someone"}
                    </p>
                    <h2 className="font-display text-xl mb-1">{r.title}</h2>
                  </div>
                  {r.author_id === user?.id && (
                    <DeleteRecipeButton recipeId={r.id} photoPath={r.photo_url} />
                  )}
                </div>
                {r.description && (
                  <p className="text-table-400 text-sm">{r.description}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}