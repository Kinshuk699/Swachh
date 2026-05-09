export type DrivingRouteInput = {
  origin: string;
  destination: string;
};

export type DrivingRouteSummary = {
  provider: "google_routes";
  distanceMeters: number;
  durationSeconds: number;
  encodedPolyline?: string;
};

type ComputeDrivingRouteOptions = {
  apiKey: string;
  fetcher?: typeof fetch;
};

const routesEndpoint = "https://routes.googleapis.com/directions/v2:computeRoutes";
const fieldMask = "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline";

export async function computeDrivingRoute(
  input: DrivingRouteInput,
  { apiKey, fetcher = fetch }: ComputeDrivingRouteOptions,
): Promise<DrivingRouteSummary | null> {
  const response = await fetcher(routesEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": fieldMask,
    },
    body: JSON.stringify({
      origin: { address: toIndiaAddress(input.origin) },
      destination: { address: toIndiaAddress(input.destination) },
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_UNAWARE",
      units: "METRIC",
    }),
  });

  if (!response.ok) {
    throw new Error(`Google Routes request failed with status ${response.status}`);
  }

  const body = (await response.json()) as {
    routes?: Array<{
      distanceMeters?: number;
      duration?: string;
      polyline?: { encodedPolyline?: string };
    }>;
  };
  const route = body.routes?.[0];

  if (!route?.distanceMeters || !route.duration) {
    return null;
  }

  return {
    provider: "google_routes",
    distanceMeters: route.distanceMeters,
    durationSeconds: parseDurationSeconds(route.duration),
    encodedPolyline: route.polyline?.encodedPolyline,
  };
}

function toIndiaAddress(value: string): string {
  const trimmed = value.trim();

  if (/\bindia\b/i.test(trimmed)) {
    return trimmed;
  }

  return `${trimmed}, India`;
}

function parseDurationSeconds(value: string): number {
  const match = value.match(/^(\d+)s$/);

  if (!match) {
    return 0;
  }

  return Number(match[1]);
}