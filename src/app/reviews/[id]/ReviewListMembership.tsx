"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type ListOption = { id: string; name: string };

export default function ReviewListMembership({
  reviewId,
  userLists,
  initialListIds,
}: {
  reviewId: string;
  userLists: ListOption[];
  initialListIds: string[];
}) {
  const router = useRouter();
  const supabase = createClient();

  const [memberOf, setMemberOf] = useState<Set<string>>(new Set(initialListIds));
  const [creatingNew, setCreatingNew] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [saving, setSaving] = useState(false);

  async function toggleList(listId: string, checked: boolean) {
    setSaving(true);
    if (checked) {
      await supabase.from("list_items").insert({ list_id: listId, review_id: reviewId });
      setMemberOf((prev) => new Set(prev).add(listId));
    } else {
      await supabase
        .from("list_items")
        .delete()
        .eq("list_id", listId)
        .eq("review_id", reviewId);
      setMemberOf((prev) => {
        const next = new Set(prev);
        next.delete(listId);
        return next;
      });
    }
    setSaving(false);
    router.refresh();
  }

  async function handleCreateNewList() {
    if (!newListName.trim()) return;
    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: newList, error } = await supabase
      .from("lists")
      .insert({ owner_id: user.id, name: newListName.trim(), type: "restaurant" })
      .select("id")
      .single();

    if (error || !newList) {
      setSaving(false);
      return;
    }

    await supabase
      .from("list_items")
      .insert({ list_id: newList.id, review_id: reviewId });

    setMemberOf((prev) => new Set(prev).add(newList.id));
    setCreatingNew(false);
    setNewListName("");
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="text-sm">
      <p className="text-xs text-table-400 mb-2 flex items-center gap-1.5">
        <i className="ti ti-list" style={{ fontSize: 14 }} />
        Lists
      </p>
      <div className="space-y-1.5">
        {userLists.map((list) => (
          <label key={list.id} className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={memberOf.has(list.id)}
              disabled={saving}
              onChange={(e) => toggleList(list.id, e.target.checked)}
            />
            <span>{list.name}</span>
          </label>
        ))}
      </div>

      {creatingNew ? (
        <div className="flex gap-2 mt-2">
          <input
            autoFocus
            placeholder="New list name"
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            className="flex-1 rounded-md bg-table-800 border border-table-700 px-2 py-1 text-sm"
          />
          <button
            onClick={handleCreateNewList}
            disabled={!newListName.trim() || saving}
            className="text-herb-400 hover:text-herb-300 disabled:opacity-50"
          >
            Save
          </button>
          <button onClick={() => setCreatingNew(false)} className="text-table-500">
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setCreatingNew(true)}
          className="text-xs text-herb-400 hover:text-herb-300 mt-2"
        >
          + New list
        </button>
      )}
    </div>
  );
}
