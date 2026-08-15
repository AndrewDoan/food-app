import { NextResponse } from "next/server";

// Turns a typed address/city into coordinates. Same server-side key as
// Places search -- never sent to the browser.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");

  if (!address || address.trim().length < 2) {
    return NextResponse.json({ lat: null, lng: null });
  }

  const res = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
      address
    )}&key=${process.env.GOOGLE_PLACES_API_KEY}`
  );

  if (!res.ok) {
    return NextResponse.json({ lat: null, lng: null, error: "Geocoding failed" }, { status: res.status });
  }

  const data = await res.json();
  const result = data.results?.[0];

  if (!result) {
    return NextResponse.json({ lat: null, lng: null });
  }

  return NextResponse.json({
    lat: result.geometry.location.lat,
    lng: result.geometry.location.lng,
    formattedAddress: result.formatted_address,
  });
}
