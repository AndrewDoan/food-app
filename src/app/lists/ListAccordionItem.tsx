"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ListSettings from "./[id]/ListSettings";

type Item = {
  itemId: string;
  recipeId?: string;
  title?: string;
  prepTimeMinutes?: number | null;
  reviewId?: string;
  restaurantName?: string;
  rating?: number;
  thumbUrl?: string | null;
  author?: string;
};

const UNDO_WINDOW_MS = 5000;

export default function ListAccordionItem({
  listId,
  name,
  kind,
  items,
}: {
  listId: string;
  name: string;
  kind: "recipe" | "restaurant";
  items: Item[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  // itemId -> pending timeout handle, while its undo window is active
  const [pending, setPending] = useState<Record<string, ReturnType<typeof setTimeout>>>({});
  const isMounted = useRef(true);

  useEffect(() => {
    return () => {
      isMounted.current = false;
      // Clear any in-flight undo timers so they don't fire (and try to
      // setState) after this component's gone.
      Object.values(pending).forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function scheduleRemove(itemId: string) {
    const timeout = setTimeout(async () => {
      await supabase.from("list_items").delete().eq("id", itemId);
      if (isMounted.current) {
        setPending((prev) => {
          const next = { ...prev };
          delete next[itemId];
          return next;
        });
        router.refresh();
      }
    }, UNDO_WINDOW_MS);
    setPending((prev) => ({ ...prev, [itemId]: timeout }));
  }

  function undoRemove(itemId: string) {
    clearTimeout(pending[itemId]);
    setPending((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  }

  return (
    <li className="rounded-md border border-table-700 bg-table-900 overflow-hidden card-surface">
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
          <div className="mb-3">
            <ListSettings listId={listId} initialName={name} />
          </div>

          {items.length === 0 ? (
            <p className="text-xs text-table-500">
              Nothing on this list yet. Add {kind === "recipe" ? "a recipe" : "a review"} to
              it from its page.
            </p>
          ) : (
            <ul className="space-y-2">
              {items.map((item) => {
                const isPending = item.itemId in pending;
                const name = kind === "recipe" ? item.title : item.restaurantName;

                if (isPending) {
                  return (
                    <li
                      key={item.itemId}
                      className="flex items-center justify-between rounded-md bg-table-950 border border-table-800 px-3 py-3"
                    >
                      <span className="text-xs text-table-500">Removed {name}</span>
                      <button
                        onClick={() => undoRemove(item.itemId)}
                        className="text-xs text-herb-400 hover:text-herb-300 font-medium"
                      >
                        Undo
                      </button>
                    </li>
                  );
                }

                return (
                  <li
                    key={item.itemId}
                    className="flex items-center gap-3 rounded-md bg-table-950 border border-table-800 p-2 pr-3"
                  >
                    {kind === "recipe" ? (
                      <>
                        <Link href={`/recipes/${item.recipeId}`} className="flex-shrink-0">
                          {item.thumbUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.thumbUrl}
                              alt={item.title}
                              className="w-12 h-12 rounded-md object-cover"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-md bg-table-900 flex items-center justify-center">
                              <i
                                className="ti ti-tools-kitchen-2"
                                style={{ fontSize: 18, color: "#524b3d" }}
                              />
                            </div>
                          )}
                        </Link>
                        <Link
                          href={`/recipes/${item.recipeId}`}
                          className="flex-1 min-w-0 hover:text-herb-400"
                        >
                          {item.author && (
                            <p className="text-[11px] text-table-500">{item.author}</p>
                          )}
                          <p className="text-sm font-medium truncate">{item.title}</p>
                          {item.prepTimeMinutes && (
                            <p className="text-xs text-table-500 mt-0.5">
                              <i className="ti ti-clock" style={{ fontSize: 11 }} />{" "}
                              {item.prepTimeMinutes} min
                            </p>
                          )}
                        </Link>
                      </>
                    ) : (
                      <>
                        <Link href={`/reviews/${item.reviewId}`} className="flex-shrink-0">
                          {item.thumbUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.thumbUrl}
                              alt={item.restaurantName}
                              className="w-12 h-12 rounded-md object-cover"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-md bg-table-900 flex items-center justify-center">
                              <i
                                className="ti ti-tools-kitchen-2"
                                style={{ fontSize: 18, color: "#524b3d" }}
                              />
                            </div>
                          )}
                        </Link>
                        <Link
                          href={`/reviews/${item.reviewId}`}
                          className="flex-1 min-w-0 hover:text-herb-400"
                        >
                          {item.author && (
                            <p className="text-[11px] text-table-500">{item.author}</p>
                          )}
                          <p className="text-sm font-medium truncate">{item.restaurantName}</p>
                          <p className="text-xs text-table-500 mt-0.5">
                            <i
                              className="ti ti-star-filled"
                              style={{ fontSize: 11, color: "#e0b04d" }}
                            />{" "}
                            {item.rating}
                          </p>
                        </Link>
                      </>
                    )}
                    <button
                      onClick={() => scheduleRemove(item.itemId)}
                      title="Remove from list"
                      aria-label="Remove from list"
                      className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-table-500 hover:text-red-400 hover:bg-table-900 transition-colors"
                    >
                      <i className="ti ti-x" style={{ fontSize: 14 }} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}
