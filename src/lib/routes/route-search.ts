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

  function normalize(s: string) {
    return s.trim().toLowerCase();
  }

  function routeMatchWeight(stop: HighwayStop) {
    const o = normalize(input.origin);
    const d = normalize(input.destination);
    const h = normalize(input.highwayName || "");
    const stopHighway = normalize(stop.highway || "");
    const stopLocality = normalize(stop.locality || "");
    const stopName = normalize(stop.name || "");

    let weight = 0;
    if (h && stopHighway && stopHighway.includes(h)) weight += 50;
    if ((o && stopHighway && stopHighway.includes(o)) || (d && stopHighway && stopHighway.includes(d))) weight += 30;
    if (o && (stopLocality.includes(o) || stopName.includes(o))) weight += 20;
    if (d && (stopLocality.includes(d) || stopName.includes(d))) weight += 20;

    const routePhrase = `${o}-${d}`;
    if (routePhrase && (stopName.includes(routePhrase) || stopLocality.includes(routePhrase))) weight += 15;

    // deprioritize dense-city stops for highway-first routing
    if (stop.isInsideDenseCity) weight -= 40;

    return weight;
  }

  const boosted = [...rankedStops].map((s, idx) => ({ s, idx, weight: routeMatchWeight(s) }))
    .sort((a, b) => {
      if (b.weight !== a.weight) return b.weight - a.weight;
      return a.idx - b.idx;
    })
    .map((x) => x.s);

  return { intent, stops: boosted };
}
