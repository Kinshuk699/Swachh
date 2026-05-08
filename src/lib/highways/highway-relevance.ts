export type SearchIntentMode = "ask-for-trip" | "plan-route" | "current-corridor";

export type TravelerIntentInput = {
  isInsideCity: boolean;
  distanceToHighwayMeters: number;
  hasDestination: boolean;
  hasHighwayName: boolean;
};

export type TravelerIntent = {
  mode: SearchIntentMode;
  requiresTripContext: boolean;
};

export type StopCategory =
  | "food_plaza"
  | "fuel_station"
  | "public_restroom"
  | "restaurant_proxy"
  | "toll_plaza";

export type CandidateStop = {
  id: string;
  name: string;
  category: StopCategory;
  distanceFromRouteMeters: number;
  distanceFromHighwayMeters: number;
  detourMinutes: number;
  isEndpointStagingArea: boolean;
  isInsideDenseCity: boolean;
  source: "crowdsourced" | "google_place";
  confidence: number;
  openNow: boolean;
  verified: boolean;
};

const HIGHWAY_NEARBY_METERS = 2_000;
const ROUTE_NEARBY_METERS = 1_500;

export function classifyTravelerIntent(input: TravelerIntentInput): TravelerIntent {
  if (input.hasDestination || input.hasHighwayName) {
    return { mode: "plan-route", requiresTripContext: false };
  }

  if (!input.isInsideCity && input.distanceToHighwayMeters <= HIGHWAY_NEARBY_METERS) {
    return { mode: "current-corridor", requiresTripContext: false };
  }

  return { mode: "ask-for-trip", requiresTripContext: true };
}

export function filterHighwayRelevantStops(stops: CandidateStop[]): CandidateStop[] {
  return stops.filter((stop) => {
    const nearRoute = stop.distanceFromRouteMeters <= ROUTE_NEARBY_METERS;
    const nearHighway = stop.distanceFromHighwayMeters <= HIGHWAY_NEARBY_METERS;
    const highwayFacility = stop.category === "toll_plaza" || stop.category === "food_plaza";

    if (stop.isEndpointStagingArea && nearHighway) {
      return true;
    }

    if (stop.isInsideDenseCity && !nearRoute) {
      return false;
    }

    return nearRoute || nearHighway || highwayFacility;
  });
}

export function rankHighwayStops(stops: CandidateStop[]): CandidateStop[] {
  return [...stops].sort((left, right) => scoreHighwayStop(right) - scoreHighwayStop(left));
}

export function scoreHighwayStop(stop: CandidateStop): number {
  const verifiedScore = stop.verified ? 35 : 0;
  const openScore = stop.openNow ? 20 : 0;
  const sourceScore = stop.source === "crowdsourced" ? 12 : 6;
  const confidenceScore = stop.confidence * 20;
  const routeScore = Math.max(0, 18 - stop.distanceFromRouteMeters / 150);
  const highwayScore = Math.max(0, 10 - stop.distanceFromHighwayMeters / 250);
  const detourPenalty = stop.detourMinutes * 1.5;
  const denseCityPenalty = stop.isInsideDenseCity && !stop.isEndpointStagingArea ? 30 : 0;

  return verifiedScore + openScore + sourceScore + confidenceScore + routeScore + highwayScore - detourPenalty - denseCityPenalty;
}
