"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function NewListForm() {
  const router = useRouter();
  const supabase = createClient();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from("lists")
      .insert({ owner_id: user.id, name: name.trim() });

    setSaving(false);
    if (!error) {
      setName("");
      router.refresh();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 mb-8">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New list name…"
        className="flex-1 rounded-md bg-table-900 border border-table-700 px-3 py-2 text-sm focus:border-herb-500"
      />
      <button
        type="submit"
        disabled={!name.trim() || saving}
        className="rounded-md bg-herb-600 hover:bg-herb-500 px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        Create
      </button>
    </form>
  );
}
