"use client";

import { useEffect, useRef, useState } from "react";

export type Place = {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
};

export default function PlaceSearch({
  onSelect,
  initialPlace,
}: {
  onSelect: (place: Place | null) => void;
  initialPlace?: Place | null;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [selected, setSelected] = useState<Place | null>(initialPlace ?? null);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!query.trim() || selected) {
      setResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/places/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(data.places ?? []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, selected]);

  function handleSelect(place: Place) {
    setSelected(place);
    setQuery("");
    setResults([]);
    onSelect(place);
  }

  function handleChange() {
    setSelected(null);
    onSelect(null);
  }

  if (selected) {
    return (
      <div className="rounded-md border border-table-700 bg-table-900 px-3 py-2">
        <p className="text-sm font-medium">{selected.name}</p>
        <p className="text-xs text-table-500 mb-1">{selected.address}</p>
        <button
          type="button"
          onClick={handleChange}
          className="text-xs text-herb-400 hover:text-herb-300"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search for a restaurant…"
        className="w-full rounded-md bg-table-900 border border-table-700 px-3 py-2 text-sm focus:border-herb-500"
      />
      {loading && <p className="text-xs text-table-500 mt-1">Searching…</p>}
      {results.length > 0 && (
        <div className="absolute z-10 w-full mt-1 rounded-md border border-table-700 bg-table-900 overflow-hidden card-surface">
          {results.map((p) => (
            <button
              key={p.placeId}
              type="button"
              onClick={() => handleSelect(p)}
              className="w-full text-left px-3 py-2 hover:bg-table-800 border-b border-table-800 last:border-0"
            >
              <p className="text-sm">{p.name}</p>
              <p className="text-xs text-table-500">{p.address}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
