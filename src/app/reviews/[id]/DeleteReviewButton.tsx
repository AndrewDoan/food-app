"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function DeleteReviewButton({
  reviewId,
  photoPaths,
  redirectTo,
}: {
  reviewId: string;
  photoPaths: string[];
  redirectTo?: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm("Delete this review? This can't be undone.")) return;
    setDeleting(true);

    if (photoPaths.length > 0) {
      await supabase.storage.from("review-photos").remove(photoPaths);
    }

    const { error } = await supabase
      .from("restaurant_reviews")
      .delete()
      .eq("id", reviewId);

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
