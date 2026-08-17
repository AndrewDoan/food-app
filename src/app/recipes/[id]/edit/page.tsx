"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import TagInput from "@/components/TagInput";

const MAX_PHOTOS = 5;

type Ingredient = { name: string; amount: string; unit: string };
type TagSuggestion = { tag: string; count: number };
type PhotoItem =
  | { type: "existing"; path: string; url: string }
  | { type: "new"; file: File };

export default function EditRecipePage() {
  const router = useRouter();
  const params = useParams();
  const recipeId = params.id as string;
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [photoItems, setPhotoItems] = useState<PhotoItem[]>([]);
  const [originalPaths, setOriginalPaths] = useState<string[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([
    { name: "", amount: "", unit: "" },
  ]);
  const [steps, setSteps] = useState<string[]>([""]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagSuggestions, setTagSuggestions] = useState<TagSuggestion[]>([]);
  const [prepTime, setPrepTime] = useState("");
  const [servings, setServings] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: recipe } = await supabase
        .from("recipes")
        .select("*")
        .eq("id", recipeId)
        .single();

      if (!recipe || recipe.author_id !== user.id) {
        router.push(`/recipes/${recipeId}`);
        return;
      }

      setTitle(recipe.title ?? "");
      setDescription(recipe.description ?? "");
      setIngredients(
        recipe.ingredients?.length ? recipe.ingredients : [{ name: "", amount: "", unit: "" }]
      );
      setSteps(recipe.steps?.length ? recipe.steps : [""]);
      setTags(recipe.tags ?? []);
      setPrepTime(recipe.prep_time_minutes?.toString() ?? "");
      setServings(recipe.servings?.toString() ?? "");
      setNotes(recipe.notes ?? "");

      const paths: string[] = recipe.photo_urls ?? [];
      setOriginalPaths(paths);
      const items: PhotoItem[] = await Promise.all(
        paths.map(async (path) => {
          const { data } = await supabase.storage
            .from("recipe-photos")
            .createSignedUrl(path, 60 * 60);
          return { type: "existing" as const, path, url: data?.signedUrl ?? "" };
        })
      );
      setPhotoItems(items);
      setLoading(false);
    }
    load();

    async function loadTagSuggestions() {
      const { data } = await supabase.from("recipes").select("tags");
      const counts = new Map<string, number>();
      (data ?? []).forEach((row) =>
        (row.tags ?? []).forEach((t: string) => counts.set(t, (counts.get(t) ?? 0) + 1))
      );
      setTagSuggestions(
        [...counts.entries()]
          .map(([tag, count]) => ({ tag, count }))
          .sort((a, b) => b.count - a.count)
      );
    }
    loadTagSuggestions();
  }, [recipeId, supabase, router]);

  function handleAddPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const room = MAX_PHOTOS - photoItems.length;
    const toAdd = files.slice(0, Math.max(room, 0)).map((file) => ({
      type: "new" as const,
      file,
    }));
    setPhotoItems((prev) => [...prev, ...toAdd]);
    e.target.value = "";
  }

  function removePhotoItem(index: number) {
    setPhotoItems((prev) => prev.filter((_, i) => i !== index));
  }

  function makePrimary(index: number) {
    setPhotoItems((prev) => {
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.unshift(item);
      return next;
    });
  }

  function updateIngredient(i: number, field: keyof Ingredient, value: string) {
    setIngredients((prev) =>
      prev.map((ing, idx) => (idx === i ? { ...ing, [field]: value } : ing))
    );
  }

  function updateStep(i: number, value: string) {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? value : s)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("You need to be signed in.");
      setSaving(false);
      return;
    }

    const finalPhotoPaths: string[] = [];
    for (const item of photoItems) {
      if (item.type === "existing") {
        finalPhotoPaths.push(item.path);
      } else {
        const ext = item.file.name.split(".").pop();
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("recipe-photos")
          .upload(path, item.file);
        if (uploadError) {
          setError(`Photo upload failed: ${uploadError.message}`);
          setSaving(false);
          return;
        }
        finalPhotoPaths.push(path);
      }
    }

    const removedPaths = originalPaths.filter((p) => !finalPhotoPaths.includes(p));
    if (removedPaths.length > 0) {
      await supabase.storage.from("recipe-photos").remove(removedPaths);
    }

    const { error: updateError } = await supabase
      .from("recipes")
      .update({
        title,
        description,
        ingredients: ingredients.filter((i) => i.name.trim()),
        steps: steps.filter((s) => s.trim()),
        tags,
        prep_time_minutes: prepTime ? parseInt(prepTime, 10) : null,
        servings: servings ? parseInt(servings, 10) : null,
        notes: notes || null,
        photo_urls: finalPhotoPaths,
      })
      .eq("id", recipeId);

    setSaving(false);
    if (updateError) {
      setError(updateError.message);
    } else {
      router.push(`/recipes/${recipeId}`);
    }
  }

  if (loading) {
    return (
      <main className="max-w-lg mx-auto px-6 py-12">
        <p className="text-table-500 text-sm">Loading…</p>
      </main>
    );
  }

  return (
    <main className="max-w-lg mx-auto px-6 py-12">
      <button
        type="button"
        onClick={() => router.back()}
        className="text-sm text-table-400 hover:text-table-100 mb-4"
      >
        ← Cancel
      </button>
      <h1 className="font-display text-3xl mb-8">Edit recipe</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm text-table-400 mb-1">Title</label>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md bg-table-900 border border-table-700 px-3 py-2 focus:border-herb-500"
          />
        </div>

        <div>
          <label className="block text-sm text-table-400 mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full rounded-md bg-table-900 border border-table-700 px-3 py-2 focus:border-herb-500"
          />
        </div>

        <div>
          <label className="block text-sm text-table-400 mb-2">
            Photos ({photoItems.length} of {MAX_PHOTOS}) — tap the star to set the main photo
          </label>
          <div className="flex gap-2 flex-wrap">
            {photoItems.map((item, i) => (
              <div key={i} className="relative w-16 h-16">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.type === "existing" ? item.url : URL.createObjectURL(item.file)}
                  alt=""
                  className="w-16 h-16 object-cover rounded-md"
                />
                {i === 0 ? (
                  <span className="absolute -bottom-1.5 -left-1.5 text-[9px] bg-herb-600 text-table-50 px-1 rounded">
                    Main
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => makePrimary(i)}
                    title="Make main photo"
                    className="absolute -bottom-1.5 -left-1.5 w-4 h-4 rounded-full bg-table-800 text-[9px] flex items-center justify-center"
                  >
                    <i className="ti ti-star" style={{ fontSize: 9 }} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => removePhotoItem(i)}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-table-800 text-[10px] flex items-center justify-center"
                >
                  ✕
                </button>
              </div>
            ))}
            {photoItems.length < MAX_PHOTOS && (
              <label className="w-16 h-16 rounded-md border border-dashed border-table-600 flex items-center justify-center cursor-pointer text-table-500 text-lg">
                +
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleAddPhotos}
                  className="hidden"
                />
              </label>
            )}
          </div>
        </div>

        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm text-table-400 mb-1">Prep time (min)</label>
            <input
              type="number"
              min="0"
              value={prepTime}
              onChange={(e) => setPrepTime(e.target.value)}
              className="w-full rounded-md bg-table-900 border border-table-700 px-3 py-2"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm text-table-400 mb-1">Servings</label>
            <input
              type="number"
              min="0"
              value={servings}
              onChange={(e) => setServings(e.target.value)}
              className="w-full rounded-md bg-table-900 border border-table-700 px-3 py-2"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm text-table-400 mb-2">Ingredients</label>
          <div className="space-y-2">
            {ingredients.map((ing, i) => (
              <div key={i} className="flex gap-2">
                <input
                  placeholder="Amount"
                  value={ing.amount}
                  onChange={(e) => updateIngredient(i, "amount", e.target.value)}
                  className="w-20 rounded-md bg-table-900 border border-table-700 px-2 py-1.5 text-sm"
                />
                <input
                  placeholder="Unit"
                  value={ing.unit}
                  onChange={(e) => updateIngredient(i, "unit", e.target.value)}
                  className="w-24 rounded-md bg-table-900 border border-table-700 px-2 py-1.5 text-sm"
                />
                <input
                  placeholder="Ingredient"
                  value={ing.name}
                  onChange={(e) => updateIngredient(i, "name", e.target.value)}
                  className="flex-1 rounded-md bg-table-900 border border-table-700 px-2 py-1.5 text-sm"
                />
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              setIngredients((prev) => [...prev, { name: "", amount: "", unit: "" }])
            }
            className="mt-2 text-sm text-herb-400 hover:text-herb-300"
          >
            + Add ingredient
          </button>
        </div>

        <div>
          <label className="block text-sm text-table-400 mb-2">Steps</label>
          <div className="space-y-2">
            {steps.map((step, i) => (
              <textarea
                key={i}
                placeholder={`Step ${i + 1}`}
                value={step}
                onChange={(e) => updateStep(i, e.target.value)}
                rows={2}
                className="w-full rounded-md bg-table-900 border border-table-700 px-3 py-2 text-sm"
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => setSteps((prev) => [...prev, ""])}
            className="mt-2 text-sm text-herb-400 hover:text-herb-300"
          >
            + Add step
          </button>
        </div>

        <div>
          <label className="block text-sm text-table-400 mb-2">Tags</label>
          <TagInput tags={tags} onChange={setTags} suggestions={tagSuggestions} />
        </div>

        <div>
          <label className="block text-sm text-table-400 mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-md bg-table-900 border border-table-700 px-3 py-2 text-sm"
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-md bg-herb-600 hover:bg-herb-500 transition-colors px-4 py-3 font-medium disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </form>
    </main>
  );
}
