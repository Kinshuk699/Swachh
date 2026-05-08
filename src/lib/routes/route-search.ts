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

  const matchingStops = filterHighwayRelevantStops(sampleHighwayStops).filter((stop) =>
    routeMatchesStop(input, stop as HighwayStop),
  ) as HighwayStop[];

  return { intent, stops: rankHighwayStops(matchingStops) as HighwayStop[] };
}

function routeMatchesStop(input: RouteSearchInput, stop: HighwayStop): boolean {
  const routeTokens = tokenizeRouteText([input.origin, input.destination, input.highwayName].join(" "));
  const stopTokens = new Set(tokenizeRouteText([stop.highway, stop.locality, stop.name].join(" ")));

  return routeTokens.some((token) => stopTokens.has(token));
}

function tokenizeRouteText(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/\b(nh|ne)\s*-?\s*(\d+)\b/g, "$1$2")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((token) => token.length >= 3);
}
