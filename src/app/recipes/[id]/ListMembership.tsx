"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type ListOption = { id: string; name: string };

export default function ListMembership({
  recipeId,
  userLists,
  initialListIds,
}: {
  recipeId: string;
  userLists: ListOption[];
  initialListIds: string[];
}) {
  const router = useRouter();
  const supabase = createClient();

  const [memberOf, setMemberOf] = useState<Set<string>>(new Set(initialListIds));
  const [creatingNew, setCreatingNew] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [saving, setSaving] = useState(false);

  async function toggleList(listId: string) {
    const currentlyIn = memberOf.has(listId);
    setSaving(true);
    if (!currentlyIn) {
      await supabase.from("list_items").insert({ list_id: listId, recipe_id: recipeId });
      setMemberOf((prev) => new Set(prev).add(listId));
    } else {
      await supabase
        .from("list_items")
        .delete()
        .eq("list_id", listId)
        .eq("recipe_id", recipeId);
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
      .insert({ owner_id: user.id, name: newListName.trim(), type: "recipe" })
      .select("id")
      .single();

    if (error || !newList) {
      setSaving(false);
      return;
    }

    await supabase
      .from("list_items")
      .insert({ list_id: newList.id, recipe_id: recipeId });

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
      <div className="flex flex-wrap gap-2">
        {userLists.map((list) => {
          const active = memberOf.has(list.id);
          return (
            <button
              key={list.id}
              type="button"
              onClick={() => toggleList(list.id)}
              disabled={saving}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-all duration-150 active:scale-95 disabled:opacity-50 ${
                active
                  ? "bg-herb-600 border-herb-600 text-table-50"
                  : "bg-table-900 border-table-700 text-table-400 hover:border-table-500"
              }`}
            >
              {active && <i className="ti ti-check" style={{ fontSize: 12 }} />}
              {list.name}
            </button>
          );
        })}

        {creatingNew ? (
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              placeholder="New list name"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateNewList();
                if (e.key === "Escape") setCreatingNew(false);
              }}
              className="rounded-full bg-table-800 border border-table-700 px-3 py-1.5 text-xs"
            />
            <button
              type="button"
              onClick={handleCreateNewList}
              disabled={!newListName.trim() || saving}
              className="text-xs text-herb-400 hover:text-herb-300"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setCreatingNew(false)}
              className="text-xs text-table-500"
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCreatingNew(true)}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-full border border-dashed border-table-600 text-table-500 hover:border-table-400 hover:text-table-300 transition-colors"
          >
            <i className="ti ti-plus" style={{ fontSize: 12 }} />
            New list
          </button>
        )}
      </div>
    </div>
  );
}
