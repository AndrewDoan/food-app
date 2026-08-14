"use client";

import { useState } from "react";
import Link from "next/link";
import RemoveFromListButton from "./[id]/RemoveFromListButton";
import ListSettings from "./[id]/ListSettings";

type RecipeItem = {
  itemId: string;
  recipeId: string;
  title: string;
  prepTimeMinutes: number | null;
};

export default function ListAccordionItem({
  listId,
  name,
  items,
}: {
  listId: string;
  name: string;
  items: RecipeItem[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <li className="rounded-md border border-table-700 bg-table-900 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-medium">{name}</span>
        <span className="flex items-center gap-2 text-xs text-table-500">
          {items.length} item{items.length === 1 ? "" : "s"}
          <i className={open ? "ti ti-chevron-up" : "ti ti-chevron-down"} />
        </span>
      </button>

      {open && (
        <div className="border-t border-table-700 px-4 py-3">
          <div className="mb-2">
            <ListSettings listId={listId} initialName={name} />
          </div>

          {items.length === 0 ? (
            <p className="text-xs text-table-500">
              Nothing on this list yet. Add a recipe to it from the recipe's page.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {items.map((item) => (
                <li
                  key={item.itemId}
                  className="flex items-center justify-between text-sm"
                >
                  <Link href={`/recipes/${item.recipeId}`} className="hover:text-herb-400">
                    {item.title}
                    {item.prepTimeMinutes && (
                      <span className="text-xs text-table-500 ml-2">
                        {item.prepTimeMinutes} min
                      </span>
                    )}
                  </Link>
                  <RemoveFromListButton listItemId={item.itemId} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}
