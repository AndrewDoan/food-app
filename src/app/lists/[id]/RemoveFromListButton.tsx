"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function RemoveFromListButton({ listItemId }: { listItemId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [removing, setRemoving] = useState(false);

  async function handleRemove() {
    setRemoving(true);
    await supabase.from("list_items").delete().eq("id", listItemId);
    setRemoving(false);
    router.refresh();
  }

  return (
    <button
      onClick={handleRemove}
      disabled={removing}
      className="text-xs text-table-500 hover:text-red-400 disabled:opacity-50"
    >
      Remove
    </button>
  );
}
