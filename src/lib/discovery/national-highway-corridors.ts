import type { NationalHighwayOverlay } from "../highways/national-highways";
import type { HighwaySearchCorridor, LatLng } from "./highway-place-discovery";

const defaultAnchorRadiusMeters = 30_000;

export function buildNationalHighwaySearchCorridors(highways: NationalHighwayOverlay[]): HighwaySearchCorridor[] {
  return highways.map((highway) => {
    const lines = geometryToLines(highway.geometry);
    const longestLine = lines.reduce((currentLongest, line) => (line.length > currentLongest.length ? line : currentLongest), lines[0] ?? []);
    const polyline = longestLine.map(toLatLng);
    const anchor = polyline[Math.floor(polyline.length / 2)] ?? boundsCenter(highway.bounds);

    return {
      id: highway.id,
      highwayName: highway.ref,
      routeContext: highway.name ?? highway.ref,
      region: "India",
      anchors: [{ ...anchor, radiusMeters: defaultAnchorRadiusMeters }],
      polyline,
    };
  });
}

function geometryToLines(geometry: NationalHighwayOverlay["geometry"]): number[][][] {
  return geometry.type === "LineString" ? [geometry.coordinates as number[][]] : (geometry.coordinates as number[][][]);
}

function toLatLng(coordinate: number[]): LatLng {
  return { latitude: coordinate[1], longitude: coordinate[0] };
}

function boundsCenter(bounds: NationalHighwayOverlay["bounds"]): LatLng {
  return {
    latitude: (bounds.north + bounds.south) / 2,
    longitude: (bounds.east + bounds.west) / 2,
  };
}
