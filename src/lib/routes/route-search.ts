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
  const routeText = normalize([input.origin, input.destination, input.highwayName].join(" "));
  const stopText = normalize([stop.highway, stop.locality, stop.name].join(" "));
  const routeTokens = routeText.split(" ").filter((token) => token.length >= 3);

  return routeTokens.some((token) => stopText.includes(token));
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
