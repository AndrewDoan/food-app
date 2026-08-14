"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ListSettings({
  listId,
  initialName,
}: {
  listId: string;
  initialName: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);

  async function handleRename() {
    if (!name.trim()) return;
    setSaving(true);
    await supabase.from("lists").update({ name: name.trim() }).eq("id", listId);
    setSaving(false);
    setEditing(false);
    router.refresh();
  }

  async function handleDelete() {
    if (!confirm(`Delete "${initialName}"? Items stay, they just won't be on this list anymore.`))
      return;
    await supabase.from("lists").delete().eq("id", listId);
    router.push("/lists");
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleRename();
            if (e.key === "Escape") setEditing(false);
          }}
          className="rounded-md bg-table-900 border border-table-700 px-2 py-1 text-lg font-display"
        />
        <button
          onClick={handleRename}
          disabled={saving}
          className="text-sm text-herb-400 hover:text-herb-300"
        >
          Save
        </button>
        <button onClick={() => setEditing(false)} className="text-sm text-table-500">
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => setEditing(true)}
        className="text-xs text-table-500 hover:text-table-300"
      >
        Rename
      </button>
      <button onClick={handleDelete} className="text-xs text-table-500 hover:text-red-400">
        Delete list
      </button>
    </div>
  );
}
