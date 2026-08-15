"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function FavoriteButton({
  recipeId,
  initialFavorited,
}: {
  recipeId: string;
  initialFavorited: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [favorited, setFavorited] = useState(initialFavorited);
  const [saving, setSaving] = useState(false);

  async function handleClick() {
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    if (favorited) {
      await supabase
        .from("recipe_favorites")
        .delete()
        .eq("user_id", user.id)
        .eq("recipe_id", recipeId);
      setFavorited(false);
    } else {
      await supabase
        .from("recipe_favorites")
        .insert({ user_id: user.id, recipe_id: recipeId });
      setFavorited(true);
    }
    setSaving(false);
    router.refresh();
  }

  return (
    <button
      onClick={handleClick}
      disabled={saving}
      aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
      title={favorited ? "Remove from favorites" : "Add to favorites"}
      className={`w-9 h-9 rounded-full flex items-center justify-center border transition-all duration-150 active:scale-90 disabled:opacity-50 ${
        favorited
          ? "bg-[#d4537e]/10 border-[#d4537e]"
          : "bg-table-900 border-table-700 hover:border-table-500"
      }`}
    >
      <i
        className={favorited ? "ti ti-heart-filled" : "ti ti-heart"}
        style={{ fontSize: 16, color: favorited ? "#d4537e" : "#8a8170" }}
      />
    </button>
  );
}
