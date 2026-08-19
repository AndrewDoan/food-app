import { NextResponse } from "next/server";

// Proxies restaurant search to Google Places API (New) -- the API key
// stays server-side here and is never sent to the browser.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  if (!q || q.trim().length < 2) {
    return NextResponse.json({ places: [] });
  }

  const body: Record<string, unknown> = { textQuery: q };

  // Bias results toward wherever the person actually is, so searching
  // "McDonald's" (a name with thousands of locations worldwide) returns
  // nearby ones first instead of a globally-ranked, essentially random set.
  if (lat && lng) {
    body.locationBias = {
      circle: {
        center: { latitude: parseFloat(lat), longitude: parseFloat(lng) },
        radius: 50000, // meters -- Google's max for locationBias
      },
    };
  }

  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY!,
      "X-Goog-FieldMask":
        "places.id,places.displayName.text,places.formattedAddress,places.location",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error("Places API error:", errorText);
    return NextResponse.json({ error: "Search failed" }, { status: res.status });
  }

  const data = await res.json();
  const places = (data.places ?? []).map((p: any) => ({
    placeId: p.id,
    name: p.displayName?.text ?? "Unknown",
    address: p.formattedAddress ?? "",
    lat: p.location?.latitude,
    lng: p.location?.longitude,
  }));

  return NextResponse.json({ places });
}
