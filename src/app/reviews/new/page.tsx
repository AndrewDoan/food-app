"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import PlaceSearch, { type Place } from "./PlaceSearch";
import TagInput from "@/components/TagInput";

const MAX_PHOTOS = 5;
type TagSuggestion = { tag: string; count: number };

export default function NewReviewPage() {
  return (
    <Suspense fallback={null}>
      <NewReviewForm />
    </Suspense>
  );
}

function NewReviewForm() {
  const router = useRouter();
  const supabase = createClient();
  const urlParams = useSearchParams();

  // If arriving from a "review this place too" link, pre-fill the place
  // search instead of making the person re-search a restaurant that's
  // already been identified.
  const prefilledPlace: Place | null = urlParams.get("placeId")
    ? {
        placeId: urlParams.get("placeId")!,
        name: urlParams.get("name") ?? "",
        address: urlParams.get("address") ?? "",
        lat: parseFloat(urlParams.get("lat") ?? "0"),
        lng: parseFloat(urlParams.get("lng") ?? "0"),
      }
    : null;

  const [place, setPlace] = useState<Place | null>(prefilledPlace);
  const [rating, setRating] = useState(5);
  const [photos, setPhotos] = useState<File[]>([]);
  const [reviewText, setReviewText] = useState("");
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagSuggestions, setTagSuggestions] = useState<TagSuggestion[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadTagSuggestions() {
      const { data } = await supabase.from("restaurant_reviews").select("tags");
      const counts = new Map<string, number>();
      (data ?? []).forEach((row) =>
        (row.tags ?? []).forEach((t: string) => counts.set(t, (counts.get(t) ?? 0) + 1))
      );
      setTagSuggestions(
        [...counts.entries()]
          .map(([tag, count]) => ({ tag, count }))
          .sort((a, b) => b.count - a.count)
      );
    }
    loadTagSuggestions();
  }, [supabase]);

  function handleAddPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setPhotos((prev) => [...prev, ...files].slice(0, MAX_PHOTOS));
    e.target.value = "";
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  function makePrimary(index: number) {
    setPhotos((prev) => {
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.unshift(item);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!place) {
      setError("Search for and select the restaurant first.");
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

    // Upload photos first, collect their storage paths.
    const photoPaths: string[] = [];
    for (const file of photos) {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("review-photos")
        .upload(path, file);
      if (uploadError) {
        setError(`Photo upload failed: ${uploadError.message}`);
        setSaving(false);
        return;
      }
      photoPaths.push(path);
    }

    const { error: insertError } = await supabase.from("restaurant_reviews").insert({
      author_id: user.id,
      place_id: place.placeId,
      restaurant_name: place.name,
      address: place.address,
      latitude: place.lat,
      longitude: place.lng,
      rating,
      tags,
      review_text: reviewText || null,
      notes: notes || null,
      photo_urls: photoPaths,
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
      <button
        type="button"
        onClick={() => router.back()}
        className="text-sm text-table-400 hover:text-table-100 mb-4"
      >
        ← Cancel
      </button>
      <h1 className="font-display text-3xl mb-8">Share a restaurant</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm text-table-400 mb-1">Find the restaurant</label>
          <PlaceSearch onSelect={setPlace} initialPlace={prefilledPlace} />
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
          <label className="block text-sm text-table-400 mb-2">
            Photos ({photos.length} of {MAX_PHOTOS}) — tap the star to set the main photo
          </label>
          <div className="flex gap-2 flex-wrap">
            {photos.map((file, i) => (
              <div key={i} className="relative w-16 h-16">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={URL.createObjectURL(file)}
                  alt=""
                  className="w-16 h-16 object-cover rounded-md"
                />
                {i === 0 ? (
                  <span className="absolute -bottom-1.5 -left-1.5 text-[9px] bg-herb-600 text-table-50 px-1 rounded">
                    Main
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => makePrimary(i)}
                    title="Make main photo"
                    className="absolute -bottom-1.5 -left-1.5 w-4 h-4 rounded-full bg-table-800 text-[9px] flex items-center justify-center"
                  >
                    <i className="ti ti-star" style={{ fontSize: 9 }} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => removePhoto(i)}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-table-800 text-[10px] flex items-center justify-center"
                >
                  ✕
                </button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <label className="w-16 h-16 rounded-md border border-dashed border-table-600 flex items-center justify-center cursor-pointer text-table-500 text-lg">
                +
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleAddPhotos}
                  className="hidden"
                />
              </label>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm text-table-400 mb-1">Review</label>
          <textarea
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value)}
            rows={3}
            placeholder="What was it like?"
            className="w-full rounded-md bg-table-900 border border-table-700 px-3 py-2 focus:border-herb-500"
          />
        </div>

        <div>
          <label className="block text-sm text-table-400 mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Practical tips -- go early, cash only, etc."
            className="w-full rounded-md bg-table-900 border border-table-700 px-3 py-2 focus:border-herb-500"
          />
        </div>

        <div>
          <label className="block text-sm text-table-400 mb-2">Tags</label>
          <TagInput tags={tags} onChange={setTags} suggestions={tagSuggestions} />
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
