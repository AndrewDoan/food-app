"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function DeleteRecipeButton({
  recipeId,
  photoPaths,
  redirectTo,
}: {
  recipeId: string;
  photoPaths: string[];
  redirectTo?: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm("Delete this recipe? This can't be undone.")) return;
    setDeleting(true);

    // Clean up the stored photos too, so they don't linger as orphaned
    // files in storage after the recipe row referencing them is gone.
    if (photoPaths.length > 0) {
      await supabase.storage.from("recipe-photos").remove(photoPaths);
    }

    const { error } = await supabase.from("recipes").delete().eq("id", recipeId);

    setDeleting(false);
    if (error) {
      alert(`Couldn't delete: ${error.message}`);
    } else if (redirectTo) {
      router.push(redirectTo);
    } else {
      router.refresh();
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={deleting}
      className="text-xs text-table-500 hover:text-red-400 transition-colors disabled:opacity-50"
    >
      {deleting ? "Deleting…" : "Delete"}
    </button>
  );
}
