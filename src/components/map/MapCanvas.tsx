"use client";

import { APIProvider, InfoWindow, Map, Marker } from "@vis.gl/react-google-maps";
import { AlertTriangle, ExternalLink, Loader2, MapPinned, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { GooglePlaceDetails } from "@/lib/google/places";
import type { HighwayStop } from "@/lib/restrooms/sample-stops";

type MapCanvasProps = {
  stops: HighwayStop[];
  selectedStopId: string;
  routePolyline?: string;
  onSelectStop: (stopId: string) => void;
};

type CuratedPlacesResponse = {
  places?: HighwayStop[];
  storedRowsRead?: number;
  placeDetailsRequests?: number;
  textSearchRequests?: number;
  capped?: boolean;
};

const indiaCenter = { lat: 22.9734, lng: 78.6569 };
const standardMarkerIconUrl = "https://maps.google.com/mapfiles/ms/icons/red-dot.png";
const premiumMarkerIconUrl = "https://maps.google.com/mapfiles/ms/icons/yellow-dot.png";

const highwayFocusedMapStyles = [
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#4b5563" }, { visibility: "simplified" }],
  },
  {
    featureType: "road.highway.controlled_access",
    elementType: "geometry",
    stylers: [{ color: "#111827" }, { visibility: "on" }],
  },
  {
    featureType: "road.highway",
    elementType: "labels.text.fill",
    stylers: [{ color: "#111827" }],
  },
  {
    featureType: "road.highway",
    elementType: "labels.text.stroke",
    stylers: [{ color: "#f8fafc" }],
  },
];

export function MapCanvas({ stops, routePolyline, onSelectStop }: MapCanvasProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const [curatedStops, setCuratedStops] = useState<HighwayStop[]>([]);
  const [curatedMeta, setCuratedMeta] = useState<Pick<CuratedPlacesResponse, "storedRowsRead" | "placeDetailsRequests" | "textSearchRequests" | "capped">>({});
  const [curatedLoading, setCuratedLoading] = useState(false);
  const [activeInfoStopId, setActiveInfoStopId] = useState<string | null>(null);
  const [placeDetailsById, setPlaceDetailsById] = useState<Record<string, GooglePlaceDetails>>({});

  useEffect(() => {
    if (!apiKey) {
      return;
    }

    let cancelled = false;
    setCuratedLoading(true);

    fetch("/api/google-curated-places?limit=40")
      .then((response) => (response.ok ? response.json() : null))
      .then((body: CuratedPlacesResponse | null) => {
        if (cancelled || !body) {
          return;
        }

        setCuratedStops(body.places ?? []);
        setCuratedMeta({
          storedRowsRead: body.storedRowsRead,
          placeDetailsRequests: body.placeDetailsRequests,
          textSearchRequests: body.textSearchRequests,
          capped: body.capped,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setCuratedStops([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCuratedLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  const mapStops = useMemo(() => dedupeStops([...stops, ...curatedStops]), [curatedStops, stops]);
  const activeStop = mapStops.find((stop) => stop.id === activeInfoStopId) ?? null;
  const activeDetails = activeStop?.placeId ? placeDetailsById[activeStop.placeId] : undefined;

  useEffect(() => {
    if (!activeStop?.placeId || activeStop.openingHoursText?.length || placeDetailsById[activeStop.placeId]) {
      return;
    }

    let cancelled = false;

    fetch(`/api/google/place-details?placeId=${encodeURIComponent(activeStop.placeId)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((details: GooglePlaceDetails | null) => {
        if (cancelled || !details) {
          return;
        }

        setPlaceDetailsById((current) => ({ ...current, [details.id]: details }));
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [activeStop, placeDetailsById]);

  if (!apiKey) {
    return (
      <div className="flex h-full min-h-[420px] items-center justify-center bg-stone-100 px-6 text-stone-950">
        <div className="max-w-md rounded-lg border bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-5 text-amber-600" aria-hidden="true" />
            Google Maps key needed
          </div>
          <p className="mt-2 text-sm text-stone-600">Add `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` to `.env.local` to render the normal Google Maps basemap.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-[420px] overflow-hidden bg-stone-100">
      <APIProvider apiKey={apiKey} language="en-IN" region="IN">
        <Map
          className="h-full min-h-[420px] w-full"
          defaultCenter={indiaCenter}
          defaultZoom={5}
          fullscreenControl
          gestureHandling="greedy"
          mapTypeControl={false}
          mapTypeId="roadmap"
          streetViewControl={false}
          styles={highwayFocusedMapStyles}
        >
          {mapStops.map((stop) => (
            <Marker
              key={stop.id}
              clickable
              icon={isPremiumPaidStop(stop) ? premiumMarkerIconUrl : standardMarkerIconUrl}
              onClick={() => {
                onSelectStop(stop.id);
                setActiveInfoStopId(stop.id);
              }}
              position={{ lat: stop.lat, lng: stop.lng }}
              title={stop.googlePlaceName ?? stop.name}
            />
          ))}

          {activeStop ? (
            <InfoWindow
              onCloseClick={() => setActiveInfoStopId(null)}
              position={{ lat: activeDetails?.location?.latitude ?? activeStop.lat, lng: activeDetails?.location?.longitude ?? activeStop.lng }}
            >
              <PlaceInfoWindow stop={activeStop} details={activeDetails} />
            </InfoWindow>
          ) : null}
        </Map>
      </APIProvider>

      <div className="pointer-events-none absolute left-4 top-4 max-w-[min(24rem,calc(100%-2rem))] rounded-lg border bg-white/92 px-4 py-3 text-stone-950 shadow-sm backdrop-blur">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <MapPinned className="size-4 text-red-600" aria-hidden="true" />
          Highway restroom map
        </div>
        <p className="mt-1 text-xs leading-5 text-stone-600">Clean stop options along national highway corridors.</p>
        <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-medium">
          <span className="rounded-full bg-yellow-100 px-2 py-1 text-yellow-900">Premium restroom</span>
          <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-800">Likely clean stop</span>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-4 left-4 max-w-[min(26rem,calc(100%-2rem))] rounded-lg border bg-white/92 px-4 py-3 text-xs text-stone-700 shadow-sm backdrop-blur">
        <div className="flex items-center gap-2 font-medium text-stone-950">
          {curatedLoading ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <ShieldCheck className="size-3.5 text-emerald-700" aria-hidden="true" />}
          <span>{mapStops.length} highway stops</span>
        </div>
        <p className="mt-1 leading-5">
          {routePolyline
            ? "Route loaded. Click a marker for details and directions."
            : curatedMeta.storedRowsRead
              ? "Click a marker for hours, access type, and directions."
              : "Click a marker for hours, access type, and directions."}
        </p>
      </div>
    </div>
  );
}

function PlaceInfoWindow({ stop, details }: { stop: HighwayStop; details?: GooglePlaceDetails }) {
  const openingHours = details?.weekdayDescriptions.length ? details.weekdayDescriptions : (stop.openingHoursText ?? []);
  const displayName = details?.displayName ?? stop.googlePlaceName ?? stop.name;
  const openNow = details?.openNow ?? stop.openNow;
  const googleMapsUri = details?.googleMapsUri ?? stop.googleMapsUri;
  const cleanlinessLabel = stop.cleanlinessLabel ?? (isPremiumPaidStop(stop) ? "Premium restroom" : "Highway restroom stop");

  return (
    <div className="max-w-xs space-y-3 text-sm text-stone-800">
      <div>
        <div className="font-semibold text-stone-950">{displayName}</div>
        <div className="mt-1 text-xs text-stone-600">{stop.highway} · {stop.locality}</div>
      </div>
      <div className="flex flex-wrap gap-2">
        <span className={`rounded-full px-2 py-1 text-xs font-medium ${openNow ? "bg-emerald-100 text-emerald-800" : "bg-stone-100 text-stone-700"}`}>
          {openNow ? "Open now" : "Check hours"}
        </span>
        <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800">
          {cleanlinessLabel}
        </span>
        <span className={`rounded-full px-2 py-1 text-xs font-medium ${isPremiumPaidStop(stop) ? "bg-yellow-100 text-yellow-900" : "bg-red-100 text-red-800"}`}>
          {isPremiumPaidStop(stop) ? "Paid premium lounge" : stop.priceLabel}
        </span>
      </div>
      {openingHours.length ? (
        <div className="space-y-1 border-t pt-2 text-xs leading-5 text-stone-700">
          {openingHours.slice(0, 7).map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      ) : (
        <div className="border-t pt-2 text-xs text-stone-600">Opening hours load from Google when available.</div>
      )}
      {googleMapsUri ? (
        <a className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800 hover:underline" href={googleMapsUri} rel="noreferrer" target="_blank">
          Open in Google Maps
          <ExternalLink className="size-3" aria-hidden="true" />
        </a>
      ) : null}
    </div>
  );
}

function isPremiumPaidStop(stop: HighwayStop): boolean {
  return stop.isPaidPremium === true || stop.priceLabel === "Paid";
}

function dedupeStops(stops: HighwayStop[]): HighwayStop[] {
  const seen = new Set<string>();
  const deduped: HighwayStop[] = [];

  for (const stop of stops) {
    const key = stop.placeId ?? stop.id;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(stop);
  }

  return deduped;
}