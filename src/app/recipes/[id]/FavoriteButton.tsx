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
      className="flex items-center gap-1.5 text-sm disabled:opacity-50"
    >
      <i
        className={favorited ? "ti ti-heart-filled" : "ti ti-heart"}
        style={{ color: favorited ? "#d4537e" : undefined }}
      />
      {favorited ? "Favorited" : "Favorite"}
    </button>
  );
}