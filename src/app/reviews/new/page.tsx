"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function NewReviewPage() {
  const router = useRouter();
  const supabase = createClient();

  const [restaurantName, setRestaurantName] = useState("");
  const [address, setAddress] = useState("");
  const [rating, setRating] = useState(5);
  const [notes, setNotes] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function getLocation() {
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      (err) => {
        setError(`Couldn't get your location: ${err.message}`);
        setLocating(false);
      }
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!coords) {
      setError("Tap \"Use my current location\" first — we need it to place this on the map later.");
      return;
    }

    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("You need to be signed in.");
      setSaving(false);
      return;
    }

    const { error: insertError } = await supabase.from("restaurant_reviews").insert({
      author_id: user.id,
      restaurant_name: restaurantName,
      address: address || null,
      latitude: coords.lat,
      longitude: coords.lng,
      rating,
      notes: notes || null,
    });

    setSaving(false);
    if (insertError) {
      setError(insertError.message);
    } else {
      router.push("/recipes");
    }
  }

  return (
    <main className="max-w-lg mx-auto px-6 py-12">
      <h1 className="font-display text-3xl mb-8">Share a restaurant</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm text-table-400 mb-1">Restaurant name</label>
          <input
            required
            value={restaurantName}
            onChange={(e) => setRestaurantName(e.target.value)}
            className="w-full rounded-md bg-table-900 border border-table-700 px-3 py-2 focus:border-herb-500"
          />
        </div>

        <div>
          <label className="block text-sm text-table-400 mb-1">
            Address (optional)
          </label>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full rounded-md bg-table-900 border border-table-700 px-3 py-2 focus:border-herb-500"
          />
        </div>

        <div>
          <label className="block text-sm text-table-400 mb-2">Rating</label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                className={`w-10 h-10 rounded-md border text-sm font-medium transition-colors ${
                  rating >= n
                    ? "bg-herb-600 border-herb-600"
                    : "bg-table-900 border-table-700 text-table-500"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm text-table-400 mb-1">
            Notes (optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-md bg-table-900 border border-table-700 px-3 py-2 focus:border-herb-500"
          />
        </div>

        <div>
          <button
            type="button"
            onClick={getLocation}
            disabled={locating}
            className="text-sm rounded-md bg-table-800 hover:bg-table-700 transition-colors px-4 py-2 disabled:opacity-50"
          >
            {locating
              ? "Getting location…"
              : coords
              ? "✓ Location captured"
              : "Use my current location"}
          </button>
          <p className="text-xs text-table-600 mt-1">
            We store the coordinates so friends can find this by area later —
            never anything more precise than where you are when you tap this.
          </p>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-md bg-herb-600 hover:bg-herb-500 transition-colors px-4 py-3 font-medium disabled:opacity-50"
        >
          {saving ? "Sharing…" : "Share with friends"}
        </button>
      </form>
    </main>
  );
}