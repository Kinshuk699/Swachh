import {
  classifyTravelerIntent,
  filterHighwayRelevantStops,
  rankHighwayStops,
  type TravelerIntent,
} from "@/lib/highways/highway-relevance";
import type { DrivingRouteSummary } from "@/lib/google/routes";
import { sampleHighwayStops, type HighwayStop } from "@/lib/restrooms/sample-stops";

export type RouteSearchInput = {
  origin: string;
  destination: string;
  highwayName: string;
  isInsideCity: boolean;
  distanceToHighwayMeters: number;
};

export type RouteSearchResponse = {
  intent: TravelerIntent;
  route: DrivingRouteSummary | null;
  stops: HighwayStop[];
};

export function buildRouteSearchResponse(input: RouteSearchInput): RouteSearchResponse {
  const intent = classifyTravelerIntent({
    isInsideCity: input.isInsideCity,
    distanceToHighwayMeters: input.distanceToHighwayMeters,
    hasDestination: input.destination.trim().length > 0,
    hasHighwayName: input.highwayName.trim().length > 0,
  });

  const relevantStops = filterHighwayRelevantStops(sampleHighwayStops) as HighwayStop[];
  const rankedStops = rankHighwayStops(relevantStops) as HighwayStop[];

  return { intent, route: null, stops: rankedStops };
}
