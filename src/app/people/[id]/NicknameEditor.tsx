"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function NicknameEditor({
  friendId,
  initialNickname,
}: {
  friendId: string;
  initialNickname: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialNickname ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    if (value.trim()) {
      await supabase
        .from("friend_nicknames")
        .upsert(
          { user_id: user.id, friend_id: friendId, nickname: value.trim() },
          { onConflict: "user_id,friend_id" }
        );
    } else {
      // Empty input clears the nickname entirely.
      await supabase
        .from("friend_nicknames")
        .delete()
        .eq("user_id", user.id)
        .eq("friend_id", friendId);
    }

    setSaving(false);
    setEditing(false);
    router.refresh();
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Nickname (only you see this)"
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") setEditing(false);
          }}
          className="rounded-md bg-table-900 border border-table-700 px-2 py-1 text-sm"
        />
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-xs text-herb-400 hover:text-herb-300"
        >
          Save
        </button>
        <button onClick={() => setEditing(false)} className="text-xs text-table-500">
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="text-xs text-table-500 hover:text-table-300"
    >
      {initialNickname ? "Change nickname" : "+ Add a nickname"}
    </button>
  );
}
