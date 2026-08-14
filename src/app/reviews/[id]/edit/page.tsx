"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import PlaceSearch, { type Place } from "../../new/PlaceSearch";
import TagInput from "@/components/TagInput";

const MAX_PHOTOS = 5;
type TagSuggestion = { tag: string; count: number };

// Unified so "make primary" can reorder existing and newly-added photos
// against each other -- order in this array IS the final save order.
type PhotoItem =
  | { type: "existing"; path: string; url: string }
  | { type: "new"; file: File };

export default function EditReviewPage() {
  const router = useRouter();
  const params = useParams();
  const reviewId = params.id as string;
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [place, setPlace] = useState<Place | null>(null);
  const [rating, setRating] = useState(5);
  const [photoItems, setPhotoItems] = useState<PhotoItem[]>([]);
  const [originalPaths, setOriginalPaths] = useState<string[]>([]);
  const [reviewText, setReviewText] = useState("");
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagSuggestions, setTagSuggestions] = useState<TagSuggestion[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: review } = await supabase
        .from("restaurant_reviews")
        .select("*")
        .eq("id", reviewId)
        .single();

      if (!review || review.author_id !== user.id) {
        router.push(`/reviews/${reviewId}`);
        return;
      }

      setPlace({
        placeId: review.place_id,
        name: review.restaurant_name,
        address: review.address ?? "",
        lat: review.latitude,
        lng: review.longitude,
      });
      setRating(review.rating);
      setReviewText(review.review_text ?? "");
      setNotes(review.notes ?? "");
      setTags(review.tags ?? []);

      const paths: string[] = review.photo_urls ?? [];
      setOriginalPaths(paths);
      const items: PhotoItem[] = await Promise.all(
        paths.map(async (path) => {
          const { data } = await supabase.storage
            .from("review-photos")
            .createSignedUrl(path, 60 * 60);
          return { type: "existing" as const, path, url: data?.signedUrl ?? "" };
        })
      );
      setPhotoItems(items);
      setLoading(false);
    }
    load();

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
  }, [reviewId, supabase, router]);

  function handleAddPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const room = MAX_PHOTOS - photoItems.length;
    const toAdd = files.slice(0, Math.max(room, 0)).map((file) => ({
      type: "new" as const,
      file,
    }));
    setPhotoItems((prev) => [...prev, ...toAdd]);
    e.target.value = "";
  }

  function removePhotoItem(index: number) {
    setPhotoItems((prev) => prev.filter((_, i) => i !== index));
  }

  function makePrimary(index: number) {
    setPhotoItems((prev) => {
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

    // Walk photoItems IN ORDER -- upload new ones as we hit them, keep
    // existing paths as-is. The resulting array's order is exactly what
    // gets saved, so whichever item the user moved to the front becomes
    // the primary/thumbnail photo.
    const finalPhotoPaths: string[] = [];
    for (const item of photoItems) {
      if (item.type === "existing") {
        finalPhotoPaths.push(item.path);
      } else {
        const ext = item.file.name.split(".").pop();
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("review-photos")
          .upload(path, item.file);
        if (uploadError) {
          setError(`Photo upload failed: ${uploadError.message}`);
          setSaving(false);
          return;
        }
        finalPhotoPaths.push(path);
      }
    }

    // Clean up any originally-existing photos the user removed.
    const removedPaths = originalPaths.filter((p) => !finalPhotoPaths.includes(p));
    if (removedPaths.length > 0) {
      await supabase.storage.from("review-photos").remove(removedPaths);
    }

    const { error: updateError } = await supabase
      .from("restaurant_reviews")
      .update({
        place_id: place.placeId,
        restaurant_name: place.name,
        address: place.address,
        latitude: place.lat,
        longitude: place.lng,
        rating,
        tags,
        review_text: reviewText || null,
        notes: notes || null,
        photo_urls: finalPhotoPaths,
      })
      .eq("id", reviewId);

    setSaving(false);
    if (updateError) {
      setError(updateError.message);
    } else {
      router.push(`/reviews/${reviewId}`);
    }
  }

  if (loading) {
    return (
      <main className="max-w-lg mx-auto px-6 py-12">
        <p className="text-table-500 text-sm">Loading…</p>
      </main>
    );
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
      <h1 className="font-display text-3xl mb-8">Edit review</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm text-table-400 mb-1">Restaurant</label>
          <PlaceSearch onSelect={setPlace} initialPlace={place} />
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
            Photos ({photoItems.length} of {MAX_PHOTOS}) — tap the star to set the main photo
          </label>
          <div className="flex gap-2 flex-wrap">
            {photoItems.map((item, i) => (
              <div key={i} className="relative w-16 h-16">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.type === "existing" ? item.url : URL.createObjectURL(item.file)}
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
                  onClick={() => removePhotoItem(i)}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-table-800 text-[10px] flex items-center justify-center"
                >
                  ✕
                </button>
              </div>
            ))}
            {photoItems.length < MAX_PHOTOS && (
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
            className="w-full rounded-md bg-table-900 border border-table-700 px-3 py-2 focus:border-herb-500"
          />
        </div>

        <div>
          <label className="block text-sm text-table-400 mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
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
          {saving ? "Saving…" : "Save changes"}
        </button>
      </form>
    </main>
  );
}
