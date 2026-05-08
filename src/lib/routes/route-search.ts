import {
  classifyTravelerIntent,
  filterHighwayRelevantStops,
  rankHighwayStops,
  type TravelerIntent,
} from "@/lib/highways/highway-relevance";
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
  stops: HighwayStop[];
};

export function buildRouteSearchResponse(input: RouteSearchInput): RouteSearchResponse {
  const intent = classifyTravelerIntent({
    isInsideCity: input.isInsideCity,
    distanceToHighwayMeters: input.distanceToHighwayMeters,
    hasDestination: input.destination.trim().length > 0,
    hasHighwayName: input.highwayName.trim().length > 0,
  });

  if (intent.requiresTripContext) {
    return { intent, stops: [] };
  }

  const relevantStops = filterHighwayRelevantStops(sampleHighwayStops) as HighwayStop[];
  const rankedStops = rankHighwayStops(relevantStops) as HighwayStop[];

  return { intent, stops: rankedStops };
}
