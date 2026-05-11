"use client";

import { APIProvider, InfoWindow, Map, Marker, useMap } from "@vis.gl/react-google-maps";
import { AlertTriangle, ExternalLink, Loader2, MapPinned, Route, ShieldCheck } from "lucide-react";
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
  candidates?: CuratedPlaceCandidate[];
  storedRowsRead?: number;
  placeDetailsRequests?: number;
  textSearchRequests?: number;
  capped?: boolean;
};

type CuratedPlaceCandidate = {
  id: string;
  name: string;
  category: HighwayStop["category"];
  distanceFromRouteMeters: number;
  distanceFromHighwayMeters: number;
  detourMinutes: number;
  source: "google_place";
  confidence: number;
  verified: boolean;
  highway: string;
  locality: string;
  priceLabel: HighwayStop["priceLabel"];
  facilities: string[];
  placeId: string;
  isPaidPremium: boolean;
  cleanlinessLabel: string;
  sourceLabel: string;
  cleanlinessTier?: HighwayStop["cleanlinessTier"];
  verificationStatus?: HighwayStop["verificationStatus"];
};

type HighwayGeometry = {
  type: "LineString" | "MultiLineString";
  coordinates: number[][] | number[][][];
};

type NationalHighwayOverlay = {
  id: string;
  ref: string;
  name?: string;
  color: string;
  bounds: { north: number; south: number; east: number; west: number };
  geometry: HighwayGeometry;
};

type NationalHighwaysResponse = {
  source?: "openstreetmap";
  attribution?: string;
  generatedAt?: string;
  highways?: NationalHighwayOverlay[];
};

type MapLatLng = { lat: number; lng: number };

type RuntimePolyline = {
  setMap: (map: unknown | null) => void;
};

type RuntimeGoogleMaps = {
  maps?: {
    Polyline: new (options: {
      clickable: boolean;
      geodesic: boolean;
      map: unknown;
      path: MapLatLng[];
      strokeColor: string;
      strokeOpacity: number;
      strokeWeight: number;
    }) => RuntimePolyline;
  };
};

const indiaCenter = { lat: 22.9734, lng: 78.6569 };
const storedCuratedMapLimit = 1000;
const standardMarkerIconUrl = "https://maps.google.com/mapfiles/ms/icons/red-dot.png";
const premiumMarkerIconUrl = "https://maps.google.com/mapfiles/ms/icons/yellow-dot.png";
const tierThreeMarkerIconUrl = "https://maps.google.com/mapfiles/ms/icons/orange-dot.png";

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
  const [curatedCandidates, setCuratedCandidates] = useState<CuratedPlaceCandidate[]>([]);
  const [curatedMeta, setCuratedMeta] = useState<Pick<CuratedPlacesResponse, "storedRowsRead" | "placeDetailsRequests" | "textSearchRequests" | "capped">>({});
  const [curatedLoading, setCuratedLoading] = useState(false);
  const [activeInfoStopId, setActiveInfoStopId] = useState<string | null>(null);
  const [placeDetailsById, setPlaceDetailsById] = useState<Record<string, GooglePlaceDetails>>({});
  const [detailsLoadingByPlaceId, setDetailsLoadingByPlaceId] = useState<Record<string, boolean>>({});
  const [onDemandPlaceDetailsRequests, setOnDemandPlaceDetailsRequests] = useState(0);
  const [nationalHighways, setNationalHighways] = useState<NationalHighwayOverlay[]>([]);
  const [highwayAttribution, setHighwayAttribution] = useState("");
  const [selectedHighwayId, setSelectedHighwayId] = useState<string | null>(null);

  useEffect(() => {
    if (!apiKey) {
      return;
    }

    let cancelled = false;
    setCuratedLoading(true);

    fetch(`/api/google-curated-places?visibility=all_found&limit=${storedCuratedMapLimit}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((body: CuratedPlacesResponse | null) => {
        if (cancelled || !body) {
          return;
        }

        setCuratedStops(body.places ?? []);
        setCuratedCandidates(body.candidates ?? []);
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
          setCuratedCandidates([]);
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

  useEffect(() => {
    if (!apiKey) {
      return;
    }

    let cancelled = false;

    fetch("/api/highways/national")
      .then((response) => (response.ok ? response.json() : null))
      .then((body: NationalHighwaysResponse | null) => {
        if (cancelled || !body) {
          return;
        }

        setNationalHighways(body.highways ?? []);
        setHighwayAttribution(body.attribution ?? "");
      })
      .catch(() => {
        if (!cancelled) {
          setNationalHighways([]);
          setHighwayAttribution("");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  const mapStops = useMemo(() => dedupeStops([...stops, ...curatedStops]), [curatedStops, stops]);
  const activeStop = mapStops.find((stop) => stop.id === activeInfoStopId) ?? null;
  const activeDetails = activeStop?.placeId ? placeDetailsById[activeStop.placeId] : undefined;
  const selectedHighway = nationalHighways.find((highway) => highway.id === selectedHighwayId) ?? null;
  const selectedHighwayCandidates = useMemo(() => {
    if (!selectedHighway) {
      return [];
    }

    const selectedRef = normalizeHighwayLabel(selectedHighway.ref);
    return curatedCandidates.filter((candidate) => normalizeHighwayLabel(candidate.highway) === selectedRef).slice(0, 8);
  }, [curatedCandidates, selectedHighway]);
  const totalPlaceDetailsRequests = (curatedMeta.placeDetailsRequests ?? 0) + onDemandPlaceDetailsRequests;

  async function loadGoogleDetails(target: CuratedPlaceCandidate | HighwayStop) {
    if (!target.placeId || detailsLoadingByPlaceId[target.placeId]) {
      return;
    }

    const cachedDetails = placeDetailsById[target.placeId];
    if (cachedDetails) {
      const cachedStop = toHydratedHighwayStop(target, cachedDetails);
      if (cachedStop) {
        setCuratedStops((current) => dedupeStops([...current, cachedStop]));
        setActiveInfoStopId(cachedStop.id);
        onSelectStop(cachedStop.id);
      }
      return;
    }

    setDetailsLoadingByPlaceId((current) => ({ ...current, [target.placeId!]: true }));

    try {
      const response = await fetch(`/api/google/place-details?placeId=${encodeURIComponent(target.placeId)}`);
      const details = response.ok ? ((await response.json()) as GooglePlaceDetails) : null;

      if (!details) {
        return;
      }

      const hydratedStop = toHydratedHighwayStop(target, details);
      setPlaceDetailsById((current) => ({ ...current, [details.id]: details }));
      setOnDemandPlaceDetailsRequests((current) => current + 1);

      if (hydratedStop) {
        setCuratedStops((current) => dedupeStops([...current, hydratedStop]));
        setActiveInfoStopId(hydratedStop.id);
        onSelectStop(hydratedStop.id);
      }
    } catch {
      return;
    } finally {
      setDetailsLoadingByPlaceId((current) => ({ ...current, [target.placeId!]: false }));
    }
  }

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
          <NationalHighwayPolylines highways={nationalHighways} selectedHighwayId={selectedHighwayId} />

          {mapStops.map((stop) => (
            <Marker
              key={stop.id}
              clickable
              icon={markerIconForStop(stop)}
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
              <PlaceInfoWindow
                details={activeDetails}
                detailsLoading={activeStop.placeId ? detailsLoadingByPlaceId[activeStop.placeId] === true : false}
                onLoadDetails={activeStop.placeId ? () => void loadGoogleDetails(activeStop) : undefined}
                stop={activeStop}
              />
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
          <span className="rounded-full bg-orange-100 px-2 py-1 text-orange-800">Tier 3</span>
        </div>
      </div>

      {nationalHighways.length ? (
        <div className="absolute right-4 top-4 max-h-[min(32rem,calc(100%-2rem))] w-[min(21rem,calc(100%-2rem))] overflow-y-auto rounded-lg border bg-white/95 p-3 text-stone-950 shadow-sm backdrop-blur">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Route className="size-4 text-emerald-700" aria-hidden="true" />
            National Highways
          </div>
          <div className="mt-3 space-y-2">
            {nationalHighways.map((highway) => {
              const stopCount = countStopsForHighway(mapStops, highway.ref);
              const candidateCount = countCandidatesForHighway(curatedCandidates, highway.ref);
              return (
                <button
                  key={highway.id}
                  className={`grid w-full grid-cols-[1rem_1fr_auto] items-center gap-2 rounded-md border px-2 py-2 text-left text-xs transition ${
                    selectedHighwayId === highway.id ? "border-emerald-500 bg-emerald-50" : "border-stone-200 bg-white hover:border-emerald-300"
                  }`}
                  onClick={() => setSelectedHighwayId(highway.id)}
                  type="button"
                >
                  <span className="h-1.5 rounded-full" style={{ backgroundColor: highway.color }} />
                  <span>
                    <span className="block font-semibold">{highway.ref}</span>
                    <span className="block text-stone-500">{highway.name ?? "National Highway"}</span>
                  </span>
                  <span className="rounded-full bg-emerald-100 px-2 py-1 font-semibold text-emerald-800">{Math.max(stopCount, candidateCount)}</span>
                </button>
              );
            })}
          </div>
          {selectedHighway ? (
            <div className="mt-3 border-t border-stone-200 pt-3">
              <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                <span>Stored stops</span>
                <span className="rounded-full bg-stone-100 px-2 py-1 text-[11px] text-stone-600">{selectedHighwayCandidates.length}</span>
              </div>
              <div className="mt-2 space-y-2">
                {selectedHighwayCandidates.length ? (
                  selectedHighwayCandidates.map((candidate) => {
                    const isLoading = detailsLoadingByPlaceId[candidate.placeId] === true;
                    const isLoaded = Boolean(placeDetailsById[candidate.placeId] || mapStops.some((stop) => stop.placeId === candidate.placeId));
                    return (
                      <div key={candidate.placeId} className="rounded-md border border-stone-200 bg-stone-50 p-2 text-xs">
                        <div className="font-semibold text-stone-900">{candidate.name}</div>
                        <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-stone-600">
                          <span>{candidate.cleanlinessLabel}</span>
                          <span>{candidate.distanceFromHighwayMeters} m</span>
                        </div>
                        <button
                          className="mt-2 inline-flex min-h-8 items-center gap-1 rounded-md border border-emerald-200 bg-white px-2 py-1 text-[11px] font-semibold text-emerald-800 transition hover:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={isLoading}
                          onClick={() => void loadGoogleDetails(candidate)}
                          type="button"
                        >
                          {isLoading ? <Loader2 className="size-3 animate-spin" aria-hidden="true" /> : null}
                          {isLoaded ? "Show pin" : "Load details"}
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-md border border-stone-200 bg-stone-50 p-2 text-xs text-stone-600">No stored stops for this highway yet.</div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="pointer-events-none absolute bottom-4 left-4 max-w-[min(26rem,calc(100%-2rem))] rounded-lg border bg-white/92 px-4 py-3 text-xs text-stone-700 shadow-sm backdrop-blur">
        <div className="flex items-center gap-2 font-medium text-stone-950">
          {curatedLoading ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <ShieldCheck className="size-3.5 text-emerald-700" aria-hidden="true" />}
          <span>{mapStops.length} highway stops</span>
        </div>
        <p className="mt-1 leading-5">
          {routePolyline
            ? "Route loaded. Click a marker for details and directions."
            : curatedMeta.storedRowsRead
              ? `${curatedMeta.storedRowsRead} stored Google candidates are ready for selective detail loading.`
              : "Click a marker for hours, access type, and directions."}
        </p>
        <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold text-stone-700">
          <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-800">Text Search {curatedMeta.textSearchRequests ?? 0}</span>
          <span className="rounded-full bg-stone-100 px-2 py-1">Details {totalPlaceDetailsRequests}</span>
        </div>
        {highwayAttribution ? <p className="mt-1 text-[11px] text-stone-500">{highwayAttribution}</p> : null}
      </div>
    </div>
  );
}

function NationalHighwayPolylines({ highways, selectedHighwayId }: { highways: NationalHighwayOverlay[]; selectedHighwayId: string | null }) {
  const map = useMap();

  useEffect(() => {
    const googleMaps = (globalThis as typeof globalThis & { google?: RuntimeGoogleMaps }).google?.maps;
    if (!map || !googleMaps) {
      return;
    }

    const polylines = highways.flatMap((highway) =>
      toGooglePaths(highway.geometry).map(
        (path) =>
          new googleMaps.Polyline({
            clickable: false,
            geodesic: true,
            map,
            path,
            strokeColor: highway.color,
            strokeOpacity: selectedHighwayId && selectedHighwayId !== highway.id ? 0.28 : 0.86,
            strokeWeight: selectedHighwayId === highway.id ? 6 : 4,
          }),
      ),
    );

    const selectedHighway = highways.find((highway) => highway.id === selectedHighwayId);
    if (selectedHighway) {
      map.fitBounds(selectedHighway.bounds);
    }

    return () => {
      polylines.forEach((polyline) => polyline.setMap(null));
    };
  }, [highways, map, selectedHighwayId]);

  return null;
}

function toGooglePaths(geometry: HighwayGeometry): MapLatLng[][] {
  const lines = geometry.type === "LineString" ? [geometry.coordinates as number[][]] : (geometry.coordinates as number[][][]);
  return lines.map((coordinates) => coordinates.map(([lng, lat]) => ({ lat, lng })));
}

function PlaceInfoWindow({
  stop,
  details,
  detailsLoading,
  onLoadDetails,
}: {
  stop: HighwayStop;
  details?: GooglePlaceDetails;
  detailsLoading: boolean;
  onLoadDetails?: () => void;
}) {
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
      {onLoadDetails && !details ? (
        <button
          className="inline-flex min-h-8 items-center gap-1 rounded-md border border-emerald-200 bg-white px-2 py-1 text-xs font-semibold text-emerald-800 transition hover:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={detailsLoading}
          onClick={onLoadDetails}
          type="button"
        >
          {detailsLoading ? <Loader2 className="size-3 animate-spin" aria-hidden="true" /> : null}
          {detailsLoading ? "Loading details" : "Load Google details"}
        </button>
      ) : null}
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

function normalizeHighwayLabel(value: string): string {
  const trimmed = value.trim().toUpperCase();
  const match = trimmed.match(/^NH\s*-?\s*(\d+[A-Z]?)$/);
  return match ? `NH-${match[1]}` : trimmed.replace(/\s+/g, " ");
}

function countStopsForHighway(stops: HighwayStop[], highwayRef: string): number {
  const normalizedRef = normalizeHighwayLabel(highwayRef);
  return stops.filter((stop) => normalizeHighwayLabel(stop.highway) === normalizedRef).length;
}

function countCandidatesForHighway(candidates: CuratedPlaceCandidate[], highwayRef: string): number {
  const normalizedRef = normalizeHighwayLabel(highwayRef);
  return candidates.filter((candidate) => normalizeHighwayLabel(candidate.highway) === normalizedRef).length;
}

function toHydratedHighwayStop(target: CuratedPlaceCandidate | HighwayStop, details: GooglePlaceDetails): HighwayStop | null {
  const existingStop = isHighwayStop(target) ? target : null;
  const latitude = details.location?.latitude ?? existingStop?.lat;
  const longitude = details.location?.longitude ?? existingStop?.lng;

  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return null;
  }

  return {
    id: target.id,
    name: details.displayName || target.name,
    category: target.category,
    distanceFromRouteMeters: target.distanceFromRouteMeters,
    distanceFromHighwayMeters: target.distanceFromHighwayMeters,
    detourMinutes: target.detourMinutes,
    isEndpointStagingArea: existingStop?.isEndpointStagingArea ?? false,
    isInsideDenseCity: existingStop?.isInsideDenseCity ?? false,
    source: "google_place",
    confidence: target.confidence,
    openNow: details.openNow ?? existingStop?.openNow ?? false,
    verified: target.verified,
    lat: latitude,
    lng: longitude,
    highway: target.highway,
    locality: target.locality,
    priceLabel: target.priceLabel,
    facilities: target.facilities,
    placeId: target.placeId,
    googleMapsUri: details.googleMapsUri ?? existingStop?.googleMapsUri,
    googlePlaceName: details.displayName || existingStop?.googlePlaceName,
    openingHoursText: details.weekdayDescriptions.length ? details.weekdayDescriptions : existingStop?.openingHoursText,
    isPaidPremium: target.isPaidPremium,
    cleanlinessLabel: target.cleanlinessLabel,
    sourceLabel: target.sourceLabel,
    cleanlinessTier: target.cleanlinessTier,
    verificationStatus: target.verificationStatus,
  };
}

function isHighwayStop(stop: CuratedPlaceCandidate | HighwayStop): stop is HighwayStop {
  return "lat" in stop && "lng" in stop;
}

function markerIconForStop(stop: HighwayStop): string {
  if (stop.cleanlinessTier === "tier_1" || isPremiumPaidStop(stop)) {
    return premiumMarkerIconUrl;
  }

  if (stop.cleanlinessTier === "tier_3") {
    return tierThreeMarkerIconUrl;
  }

  return standardMarkerIconUrl;
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