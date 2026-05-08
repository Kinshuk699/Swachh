import { buildRouteSearchResponse } from "@/lib/routes/route-search";

export type WhatsAppReplyInput = {
  text: string;
  hasSharedLocation: boolean;
  isInsideCity: boolean;
  distanceToHighwayMeters: number;
};

export type WhatsAppReply = {
  kind: "ask-for-trip" | "stops";
  message: string;
};

export function buildWhatsAppReply(input: WhatsAppReplyInput): WhatsAppReply {
  const routeParts = parseRouteText(input.text);
  const response = buildRouteSearchResponse({
    origin: routeParts.origin,
    destination: routeParts.destination,
    highwayName: routeParts.highwayName,
    isInsideCity: input.isInsideCity,
    distanceToHighwayMeters: input.distanceToHighwayMeters,
  });

  if (response.intent.requiresTripContext) {
    return {
      kind: "ask-for-trip",
      message: "Send your destination or highway name, and I will find clean restroom stops on the route.",
    };
  }

  const stops = response.stops.slice(0, 3);
  const stopLines = stops.map(
    (stop, index) => `${index + 1}. ${stop.name} - ${stop.highway}, ${stop.detourMinutes} min detour`,
  );

  return {
    kind: "stops",
    message: [`Next highway restroom options:`, ...stopLines].join("\n"),
  };
}

function parseRouteText(text: string): { origin: string; destination: string; highwayName: string } {
  const normalized = text.trim();
  const routeMatch = normalized.match(/(.+?)\s+to\s+(.+?)(?:\s+(?:toilets|washrooms|restrooms))?$/i);

  if (routeMatch) {
    return {
      origin: routeMatch[1].trim(),
      destination: routeMatch[2].trim(),
      highwayName: "",
    };
  }

  const highwayMatch = normalized.match(/\b((?:NH|NE)\s*-?\s*\d+|expressway)\b/i);

  return {
    origin: "Current location",
    destination: "",
    highwayName: highwayMatch?.[0] ?? "",
  };
}
