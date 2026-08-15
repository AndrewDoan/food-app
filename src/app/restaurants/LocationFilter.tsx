"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const RADIUS_OPTIONS = [5, 10, 25, 50, 100];

export default function LocationFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasLocation = searchParams.has("lat") && searchParams.has("lng");
  const radius = searchParams.get("radius") ?? "25";

  function updateParams(overrides: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(overrides)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    router.push(`/restaurants?${params.toString()}`);
  }

  function useMyLocation() {
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const lat = pos.coords.latitude.toString();
        const lng = pos.coords.longitude.toString();
        // Remembered locally so the map can default here next time,
        // even before "Near me" is explicitly clicked again.
        try {
          localStorage.setItem("table:lastLocation", JSON.stringify({ lat, lng }));
        } catch {
          // Storage can fail (private browsing, etc.) -- harmless to skip.
        }
        updateParams({ lat, lng, radius });
      },
      (err) => {
        setLocating(false);
        setError(`Couldn't get your location: ${err.message}`);
      }
    );
  }

  function clearLocation() {
    updateParams({ lat: null, lng: null });
  }

  return (
    <div className="flex items-center gap-2 mb-4 flex-wrap">
      <select
        value={radius}
        onChange={(e) => updateParams({ radius: e.target.value })}
        className="text-sm rounded-md bg-table-900 border border-table-700 px-2 py-1.5"
      >
        {RADIUS_OPTIONS.map((r) => (
          <option key={r} value={r}>
            Within {r} mi
          </option>
        ))}
      </select>

      {!hasLocation ? (
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          className="text-sm rounded-md bg-table-800 hover:bg-table-700 transition-colors px-3 py-1.5 disabled:opacity-50 flex items-center gap-1.5"
        >
          <i className="ti ti-current-location" style={{ fontSize: 14 }} />
          {locating ? "Locating…" : "Near me"}
        </button>
      ) : (
        <>
          <span className="text-sm rounded-md bg-table-800 px-3 py-1.5 flex items-center gap-1.5 text-herb-400">
            <i className="ti ti-current-location" style={{ fontSize: 14 }} />
            Near me
          </span>
          <button
            type="button"
            onClick={clearLocation}
            className="text-xs text-table-500 hover:text-table-300"
          >
            Clear
          </button>
        </>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
