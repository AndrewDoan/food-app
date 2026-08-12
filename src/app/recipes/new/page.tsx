"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Ingredient = { name: string; amount: string; unit: string };

export default function NewRecipePage() {
  const router = useRouter();
  const supabase = createClient();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [ingredients, setIngredients] = useState<Ingredient[]>([
    { name: "", amount: "", unit: "" },
  ]);
  const [steps, setSteps] = useState<string[]>([""]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

    let photoPath: string | null = null;
    if (photoFile) {
      const ext = photoFile.name.split(".").pop();
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("recipe-photos")
        .upload(path, photoFile);

      if (uploadError) {
        setError(`Photo upload failed: ${uploadError.message}`);
        setSaving(false);
        return;
      }
      photoPath = path;
    }

    const { error: insertError } = await supabase.from("recipes").insert({
      author_id: user.id,
      title,
      description,
      ingredients: ingredients.filter((i) => i.name.trim()),
      steps: steps.filter((s) => s.trim()),
      photo_url: photoPath,
    });

    setSaving(false);
    if (insertError) {
      setError(insertError.message);
    } else {
      router.push("/recipes");
    }
  }

  return (
    <main className="max-w-lg mx-auto px-6 py-12">
      <h1 className="font-display text-3xl mb-8">Share a recipe</h1>

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
          <label className="block text-sm text-table-400 mb-1">
            Description (optional)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full rounded-md bg-table-900 border border-table-700 px-3 py-2 focus:border-herb-500"
          />
        </div>

        <div>
          <label className="block text-sm text-table-400 mb-1">
            Photo (optional)
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
            className="w-full text-sm text-table-400 file:mr-3 file:rounded-md file:border-0 file:bg-table-800 file:px-3 file:py-1.5 file:text-table-100 file:text-sm"
          />
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

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-md bg-herb-600 hover:bg-herb-500 transition-colors px-4 py-3 font-medium disabled:opacity-50"
        >
          {saving ? "Sharing…" : "Share with friends"}
        </button>
      </form>
    </main>
  );
}