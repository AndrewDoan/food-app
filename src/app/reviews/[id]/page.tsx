import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DeleteReviewButton from "./DeleteReviewButton";
import ReviewListMembership from "./ReviewListMembership";
import ReviewFavoriteButton from "@/app/restaurants/ReviewFavoriteButton";

export default async function ReviewDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // RLS already guarantees this only returns something if it's our own
  // review or an accepted friend's.
  const { data: review } = await supabase
    .from("restaurant_reviews")
    .select(
      "id, author_id, place_id, restaurant_name, address, latitude, longitude, rating, tags, review_text, notes, photo_urls, created_at, author:author_id(display_name)"
    )
    .eq("id", params.id)
    .single();

  if (!review) {
    notFound();
  }

  const isOwner = review.author_id === user?.id;

  // If this is a friend's review, check whether the viewer already has
  // their own review of the same physical place -- if so, we'll offer
  // "edit your review" instead of risking an accidental duplicate.
  let myOwnReviewId: string | null = null;
  if (!isOwner) {
    const { data: mine } = await supabase
      .from("restaurant_reviews")
      .select("id")
      .eq("author_id", user?.id)
      .eq("place_id", review.place_id)
      .maybeSingle();
    myOwnReviewId = mine?.id ?? null;
  }

  const signedPhotoUrls = await Promise.all(
    (review.photo_urls ?? []).map(async (path: string) => {
      const { data } = await supabase.storage
        .from("review-photos")
        .createSignedUrl(path, 60 * 60);
      return data?.signedUrl ?? null;
    })
  );

  const { data: userLists } = await supabase
    .from("lists")
    .select("id, name")
    .eq("owner_id", user?.id);

  const { data: memberships } = await supabase
    .from("list_items")
    .select("list_id")
    .eq("review_id", review.id);
  const initialListIds = (memberships ?? []).map((m) => m.list_id);

  let initialFavorited = false;
  if (!isOwner) {
    const { data: existingFavorite } = await supabase
      .from("review_favorites")
      .select("id")
      .eq("user_id", user?.id)
      .eq("review_id", review.id)
      .maybeSingle();
    initialFavorited = !!existingFavorite;
  }

  return (
    <main className="max-w-lg mx-auto px-6 py-12">
      <Link href="/restaurants" className="text-sm text-table-400 hover:text-table-100">
        ← Back
      </Link>

      {signedPhotoUrls.filter(Boolean).length > 0 && (
        <div className="flex gap-2 overflow-x-auto my-4">
          {signedPhotoUrls.filter(Boolean).map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={url!}
              alt=""
              className="h-56 rounded-lg object-cover flex-shrink-0"
            />
          ))}
        </div>
      )}

      <div className="flex items-start justify-between gap-3 mt-4 mb-1">
        <div>
          <Link
            href={`/people/${review.author_id}`}
            className="text-xs text-table-500 hover:text-herb-400 mb-1 block"
          >
            {(review.author as any)?.display_name ?? "Someone"}
          </Link>
          <h1 className="font-display text-3xl">{review.restaurant_name}</h1>
          {review.address && (
            <p className="text-xs text-table-500 mt-1">{review.address}</p>
          )}
        </div>
        {isOwner && (
          <div className="flex items-center gap-3 flex-shrink-0">
            <Link
              href={`/reviews/${review.id}/edit`}
              className="text-xs text-table-500 hover:text-table-300"
            >
              Edit
            </Link>
            <DeleteReviewButton
              reviewId={review.id}
              photoPaths={review.photo_urls ?? []}
              redirectTo="/restaurants"
            />
          </div>
        )}
      </div>

      <p className="text-sm text-table-300 flex items-center gap-1 mt-2 mb-4">
        <i className="ti ti-star-filled" style={{ fontSize: 14, color: "#e0b04d" }} />
        {review.rating} / 5
      </p>

      {review.tags && review.tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {review.tags.map((tag: string) => (
            <span
              key={tag}
              className="text-xs bg-table-800 text-table-300 px-2 py-1 rounded-md"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="mb-6 space-y-4">
        {!isOwner && (
          <div className="flex items-center gap-4">
            <ReviewFavoriteButton reviewId={review.id} initialFavorited={initialFavorited} />
            {myOwnReviewId ? (
              <Link
                href={`/reviews/${myOwnReviewId}/edit`}
                className="text-sm text-herb-400 hover:text-herb-300"
              >
                Edit your review of this place
              </Link>
            ) : (
              <Link
                href={`/reviews/new?placeId=${encodeURIComponent(review.place_id)}&name=${encodeURIComponent(review.restaurant_name)}&address=${encodeURIComponent(review.address ?? "")}&lat=${review.latitude}&lng=${review.longitude}`}
                className="text-sm text-herb-400 hover:text-herb-300"
              >
                + Review this place too
              </Link>
            )}
          </div>
        )}
        <ReviewListMembership
          reviewId={review.id}
          userLists={userLists ?? []}
          initialListIds={initialListIds}
        />
      </div>

      {review.review_text && (
        <section className="mb-6">
          <h2 className="font-display text-lg mb-2">Review</h2>
          <p className="text-sm text-table-300 whitespace-pre-wrap">{review.review_text}</p>
        </section>
      )}

      {review.notes && (
        <section>
          <h2 className="font-display text-lg mb-2">Notes</h2>
          <p className="text-sm text-table-400 whitespace-pre-wrap">{review.notes}</p>
        </section>
      )}
    </main>
  );
}
