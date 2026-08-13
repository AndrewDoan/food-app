import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DeleteRecipeButton from "../DeleteRecipeButton";
import FavoriteButton from "./FavoriteButton";
import ListMembership from "./ListMembership";

type Ingredient = { name: string; amount: string; unit: string };

export default async function RecipeDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // RLS already guarantees this only returns something if it's our own
  // recipe or an accepted friend's -- no manual friend-check needed here.
  const { data: recipe } = await supabase
    .from("recipes")
    .select(
      "id, author_id, title, description, ingredients, steps, photo_url, tags, prep_time_minutes, servings, notes, created_at, author:author_id(display_name)"
    )
    .eq("id", params.id)
    .single();

  if (!recipe) {
    notFound();
  }

  const isOwner = recipe.author_id === user?.id;

  let signedPhotoUrl: string | null = null;
  if (recipe.photo_url) {
    const { data } = await supabase.storage
      .from("recipe-photos")
      .createSignedUrl(recipe.photo_url, 60 * 60);
    signedPhotoUrl = data?.signedUrl ?? null;
  }

  // Lists this viewer owns -- used to add this recipe (own or a
  // friend's) to any number of their own lists.
  const { data: userLists } = await supabase
    .from("lists")
    .select("id, name")
    .eq("owner_id", user?.id);

  // Which of the viewer's own lists this recipe is currently on.
  const { data: memberships } = await supabase
    .from("list_items")
    .select("list_id")
    .eq("recipe_id", recipe.id);
  const initialListIds = (memberships ?? []).map((m) => m.list_id);

  // If this is a friend's recipe, check whether we've already favorited it.
  let initialFavorited = false;
  if (!isOwner) {
    const { data: existingFavorite } = await supabase
      .from("recipe_favorites")
      .select("id")
      .eq("user_id", user?.id)
      .eq("recipe_id", recipe.id)
      .maybeSingle();
    initialFavorited = !!existingFavorite;
  }

  const ingredients = (recipe.ingredients as Ingredient[]) ?? [];
  const steps = (recipe.steps as string[]) ?? [];

  return (
    <main className="max-w-lg mx-auto px-6 py-12">
      <Link href="/recipes" className="text-sm text-table-400 hover:text-table-100">
        ← Back
      </Link>

      {signedPhotoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={signedPhotoUrl}
          alt={recipe.title}
          className="w-full max-h-96 object-contain bg-table-950 rounded-lg my-4"
        />
      )}

      <div className="flex items-start justify-between gap-3 mt-4 mb-1">
        <div>
          <p className="text-xs text-table-500 mb-1">
            {(recipe.author as any)?.display_name ?? "Someone"}
          </p>
          <h1 className="font-display text-3xl">{recipe.title}</h1>
        </div>
        {isOwner && (
          <DeleteRecipeButton
            recipeId={recipe.id}
            photoPath={recipe.photo_url}
            redirectTo="/recipes"
          />
        )}
      </div>

      {recipe.description && (
        <p className="text-table-400 text-sm mt-2 mb-4">{recipe.description}</p>
      )}

      <div className="flex flex-wrap items-center gap-3 text-sm text-table-400 mb-4">
        {recipe.prep_time_minutes && (
          <span>
            <i className="ti ti-clock" style={{ fontSize: 14 }} /> {recipe.prep_time_minutes} min
          </span>
        )}
        {recipe.servings && (
          <span>
            <i className="ti ti-users" style={{ fontSize: 14 }} /> {recipe.servings} servings
          </span>
        )}
      </div>

      {recipe.tags && recipe.tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {recipe.tags.map((tag: string) => (
            <span
              key={tag}
              className="text-xs bg-table-800 text-table-300 px-2 py-1 rounded-md"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="mb-6 space-y-4">
        {!isOwner && (
          <FavoriteButton recipeId={recipe.id} initialFavorited={initialFavorited} />
        )}
        <ListMembership
          recipeId={recipe.id}
          userLists={userLists ?? []}
          initialListIds={initialListIds}
        />
      </div>

      {ingredients.length > 0 && (
        <section className="mb-6">
          <h2 className="font-display text-lg mb-2">Ingredients</h2>
          <ul className="space-y-1 text-sm text-table-300">
            {ingredients.map((ing, i) => (
              <li key={i}>
                {ing.amount} {ing.unit} {ing.name}
              </li>
            ))}
          </ul>
        </section>
      )}

      {steps.length > 0 && (
        <section className="mb-6">
          <h2 className="font-display text-lg mb-2">Steps</h2>
          <ol className="space-y-2 text-sm text-table-300 list-decimal list-inside">
            {steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </section>
      )}

      {recipe.notes && (
        <section>
          <h2 className="font-display text-lg mb-2">Notes</h2>
          <p className="text-sm text-table-400">{recipe.notes}</p>
        </section>
      )}
    </main>
  );
}