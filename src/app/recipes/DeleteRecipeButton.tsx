"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function DeleteRecipeButton({
  recipeId,
  photoPath,
  redirectTo,
}: {
  recipeId: string;
  photoPath: string | null;
  redirectTo?: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm("Delete this recipe? This can't be undone.")) return;
    setDeleting(true);

    // Clean up the stored photo too, so it doesn't linger as an orphaned
    // file in storage after the recipe row referencing it is gone.
    if (photoPath) {
      await supabase.storage.from("recipe-photos").remove([photoPath]);
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