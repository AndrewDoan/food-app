"use client";

import { useEffect, useRef, useState } from "react";

type Suggestion = { tag: string; count: number };

export default function TagInput({
  tags,
  onChange,
  suggestions,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  suggestions: Suggestion[];
}) {
  const [input, setInput] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = suggestions
    .filter((s) => !tags.includes(s.tag))
    .filter(
      (s) => !input.trim() || s.tag.toLowerCase().includes(input.trim().toLowerCase())
    )
    .slice(0, 6);

  function addTag(t: string) {
    const trimmed = t.trim();
    if (!trimmed) return;
    // Reuse the existing suggestion's exact casing if this is a near
    // match, so "Italian" and "italian" don't fragment into two tags.
    const canonical =
      suggestions.find((s) => s.tag.toLowerCase() === trimmed.toLowerCase())?.tag ??
      trimmed;
    if (!tags.includes(canonical)) onChange([...tags, canonical]);
    setInput("");
    setShowDropdown(false);
  }

  function removeTag(t: string) {
    onChange(tags.filter((x) => x !== t));
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex gap-2 flex-wrap mb-2">
        {tags.map((t) => (
          <span
            key={t}
            onClick={() => removeTag(t)}
            className="text-xs bg-table-800 text-herb-400 px-2.5 py-1 rounded-md cursor-pointer"
          >
            {t} ✕
          </span>
        ))}
      </div>
      <input
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          setShowDropdown(true);
        }}
        onFocus={() => setShowDropdown(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            addTag(input);
          }
        }}
        placeholder="Add a tag, press Enter"
        className="w-full rounded-md bg-table-900 border border-table-700 px-3 py-2 text-sm"
      />
      {showDropdown && filtered.length > 0 && (
        <div className="absolute z-10 w-full mt-1 rounded-md border border-table-700 bg-table-900 overflow-hidden">
          <p className="text-[10px] text-table-500 px-3 pt-2">Used in your circle</p>
          {filtered.map((s) => (
            <button
              key={s.tag}
              type="button"
              onClick={() => addTag(s.tag)}
              className="w-full flex items-center justify-between text-left px-3 py-2 hover:bg-table-800 text-sm"
            >
              <span>{s.tag}</span>
              <span className="text-xs text-table-500">{s.count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
