"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import TagInput from "@/components/TagInput";

type Ingredient = { name: string; amount: string; unit: string };
type TagSuggestion = { tag: string; count: number };

export default function EditRecipePage() {
  const router = useRouter();
  const params = useParams();
  const recipeId = params.id as string;
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [existingPhotoPath, setExistingPhotoPath] = useState<string | null>(null);
  const [existingPhotoUrl, setExistingPhotoUrl] = useState<string | null>(null);
  const [newPhotoFile, setNewPhotoFile] = useState<File | null>(null);
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
        // Not found, or not yours -- send back to the recipe's own page.
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
      setExistingPhotoPath(recipe.photo_url);

      if (recipe.photo_url) {
        const { data } = await supabase.storage
          .from("recipe-photos")
          .createSignedUrl(recipe.photo_url, 60 * 60);
        setExistingPhotoUrl(data?.signedUrl ?? null);
      }

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

    let photoPath = existingPhotoPath;
    if (newPhotoFile) {
      const ext = newPhotoFile.name.split(".").pop();
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("recipe-photos")
        .upload(path, newPhotoFile);
      if (uploadError) {
        setError(`Photo upload failed: ${uploadError.message}`);
        setSaving(false);
        return;
      }
      // Clean up the old photo now that the new one is safely uploaded.
      if (existingPhotoPath) {
        await supabase.storage.from("recipe-photos").remove([existingPhotoPath]);
      }
      photoPath = path;
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
        photo_url: photoPath,
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
          <label className="block text-sm text-table-400 mb-1">Photo</label>
          {(newPhotoFile || existingPhotoUrl) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={newPhotoFile ? URL.createObjectURL(newPhotoFile) : existingPhotoUrl!}
              alt=""
              className="w-full max-h-64 object-contain bg-table-950 rounded-lg mb-2"
            />
          )}
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setNewPhotoFile(e.target.files?.[0] ?? null)}
            className="w-full text-sm text-table-400 file:mr-3 file:rounded-md file:border-0 file:bg-table-800 file:px-3 file:py-1.5 file:text-table-100 file:text-sm"
          />
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
