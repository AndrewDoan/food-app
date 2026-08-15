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
      title="Remove from list"
      aria-label="Remove from list"
      className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-table-500 hover:text-red-400 hover:bg-table-900 transition-colors disabled:opacity-50"
    >
      <i className={removing ? "ti ti-loader-2" : "ti ti-x"} style={{ fontSize: 14 }} />
    </button>
  );
}
