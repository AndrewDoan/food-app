"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { GoogleMap, Marker, InfoWindow, useLoadScript } from "@react-google-maps/api";

type ReviewSummary = { id: string; rating: number; authorLabel: string; isMine: boolean };

type PlaceMarker = {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  reviews: ReviewSummary[];
};

export default function RestaurantsMap({
  results,
  center, // set only when "near me" is active; null otherwise
}: {
  results: PlaceMarker[];
  center: { lat: number; lng: number } | null;
}) {
  const { isLoaded } = useLoadScript({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
  });
  const [selected, setSelected] = useState<PlaceMarker | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  // Captured once and never updated -- @react-google-maps/api re-applies
  // its `center` prop to the map any time that prop's value changes, so
  // if we kept passing the live `center ?? fallback` value, clearing
  // "near me" would snap the map back to the fallback point instead of
  // letting our own smarter logic (below) decide what to show.
  const [frozenInitialCenter] = useState(center ?? { lat: 20, lng: 0 });

  const onLoad = useCallback(
    (map: google.maps.Map) => {
      mapRef.current = map;
      fitToData(map);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Re-run the centering logic (not the prop-driven kind) whenever the
  // actual location context changes -- e.g. clicking "Near me" or
  // clearing it -- so the map responds correctly after the initial load.
  useEffect(() => {
    if (mapRef.current) fitToData(mapRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center, results]);

  function fitToData(map: google.maps.Map) {
    if (center) {
      map.setCenter(center);
      map.setZoom(12);
      return;
    }

    try {
      const saved = localStorage.getItem("table:lastLocation");
      if (saved) {
        const { lat, lng } = JSON.parse(saved);
        map.setCenter({ lat: parseFloat(lat), lng: parseFloat(lng) });
        map.setZoom(12);
        return;
      }
    } catch {
      // Corrupt/missing storage -- fall through to fitBounds below.
    }

    if (results.length === 0) return;
    if (results.length === 1) {
      map.setCenter({ lat: results[0].lat, lng: results[0].lng });
      map.setZoom(13);
      return;
    }
    const bounds = new window.google.maps.LatLngBounds();
    results.forEach((r) => bounds.extend({ lat: r.lat, lng: r.lng }));
    map.fitBounds(bounds);
  }

  if (!isLoaded) {
    return (
      <div className="rounded-lg border border-table-700 bg-table-900 h-96 flex items-center justify-center mb-6">
        <p className="text-sm text-table-500">Loading map…</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg overflow-hidden border border-table-700 mb-6" style={{ height: 400 }}>
      <GoogleMap
        onLoad={onLoad}
        center={frozenInitialCenter}
        zoom={3}
        mapContainerStyle={{ width: "100%", height: "100%" }}
        options={{ disableDefaultUI: true, zoomControl: true, styles: DARK_MAP_STYLE }}
      >
        {results.map((place) => (
          <Marker
            key={place.placeId}
            position={{ lat: place.lat, lng: place.lng }}
            onClick={() => setSelected(place)}
          />
        ))}

        {selected && (
          <InfoWindow
            position={{ lat: selected.lat, lng: selected.lng }}
            onCloseClick={() => setSelected(null)}
          >
            <div style={{ minWidth: 180, color: "#15130f" }}>
              <p style={{ fontWeight: 500, marginBottom: 6 }}>{selected.name}</p>
              {selected.reviews.map((rev) => (
                <div
                  key={rev.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                    fontSize: 12,
                    marginBottom: 3,
                  }}
                >
                  <span>
                    {rev.authorLabel} · ★ {rev.rating}
                  </span>
                  <Link href={`/reviews/${rev.id}`} style={{ color: "#4c5c3f" }}>
                    View →
                  </Link>
                </div>
              ))}
              {(() => {
                const mine = selected.reviews.find((r) => r.isMine);
                return mine ? (
                  <Link
                    href={`/reviews/${mine.id}/edit`}
                    style={{ fontSize: 12, color: "#4c5c3f", display: "block", marginTop: 6 }}
                  >
                    Edit your review →
                  </Link>
                ) : (
                  <Link
                    href={`/reviews/new?placeId=${encodeURIComponent(
                      selected.placeId
                    )}&name=${encodeURIComponent(selected.name)}&address=${encodeURIComponent(
                      selected.address
                    )}&lat=${selected.lat}&lng=${selected.lng}`}
                    style={{ fontSize: 12, color: "#4c5c3f", display: "block", marginTop: 6 }}
                  >
                    + Review this place too
                  </Link>
                );
              })()}
            </div>
          </InfoWindow>
        )}
      </GoogleMap>
    </div>
  );
}

const DARK_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#1e1b16" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1e1b16" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8a8170" }] },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#3a352c" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#15130f" }],
  },
  {
    featureType: "poi",
    elementType: "geometry",
    stylers: [{ color: "#2a2620" }],
  },
];
