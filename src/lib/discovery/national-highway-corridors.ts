import type { NationalHighwayOverlay } from "../highways/national-highways";
import type { HighwaySearchCorridor, LatLng } from "./highway-place-discovery";

const defaultAnchorRadiusMeters = 30_000;
const defaultAnchorSpacingMeters = 50_000;

export function buildNationalHighwaySearchCorridors(highways: NationalHighwayOverlay[]): HighwaySearchCorridor[] {
  return highways.map((highway) => {
    const lines = geometryToLines(highway.geometry);
    const longestLine = lines.reduce((currentLongest, line) => (line.length > currentLongest.length ? line : currentLongest), lines[0] ?? []);
    const polyline = longestLine.map(toLatLng);
    const polylines = lines.map((line) => line.map(toLatLng)).filter((line) => line.length > 0);
    const anchors = buildDistanceTiledAnchors(lines, defaultAnchorSpacingMeters, defaultAnchorRadiusMeters);

    return {
      id: highway.id,
      highwayName: highway.ref,
      routeContext: highway.name ?? highway.ref,
      region: "India",
      anchors: anchors.length > 0 ? anchors : [{ ...boundsCenter(highway.bounds), radiusMeters: defaultAnchorRadiusMeters }],
      polyline,
      polylines,
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

function buildDistanceTiledAnchors(lines: number[][][], spacingMeters: number, radiusMeters: number): Array<LatLng & { radiusMeters: number }> {
  const totalMeters = lines.reduce((sum, line) => sum + lineLengthMeters(line), 0);

  if (totalMeters <= 0) {
    return [];
  }

  const anchorCount = Math.max(1, Math.ceil(totalMeters / spacingMeters));
  const intervalMeters = totalMeters / anchorCount;
  const targetDistances = Array.from({ length: anchorCount }, (_, index) => (index + 0.5) * intervalMeters);
  const anchors: Array<LatLng & { radiusMeters: number }> = [];
  let traversedMeters = 0;
  let targetIndex = 0;

  for (const line of lines) {
    for (let coordinateIndex = 0; coordinateIndex < line.length - 1; coordinateIndex += 1) {
      const start = line[coordinateIndex];
      const end = line[coordinateIndex + 1];
      const segmentMeters = distanceMeters(start, end);

      if (segmentMeters === 0) {
        continue;
      }

      while (targetIndex < targetDistances.length && targetDistances[targetIndex] <= traversedMeters + segmentMeters) {
        const ratio = (targetDistances[targetIndex] - traversedMeters) / segmentMeters;
        anchors.push({ ...interpolateCoordinate(start, end, ratio), radiusMeters });
        targetIndex += 1;
      }

      traversedMeters += segmentMeters;
    }
  }

  return anchors;
}

function lineLengthMeters(line: number[][]): number {
  return line.slice(1).reduce((sum, coordinate, index) => sum + distanceMeters(line[index], coordinate), 0);
}

function interpolateCoordinate(start: number[], end: number[], ratio: number): LatLng {
  return {
    latitude: start[1] + (end[1] - start[1]) * ratio,
    longitude: start[0] + (end[0] - start[0]) * ratio,
  };
}

function distanceMeters(start: number[], end: number[]): number {
  const earthRadiusMeters = 6_371_000;
  const deltaLatitude = toRadians(end[1] - start[1]);
  const deltaLongitude = toRadians(end[0] - start[0]);
  const startLatitude = toRadians(start[1]);
  const endLatitude = toRadians(end[1]);
  const haversine =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(deltaLongitude / 2) ** 2;

  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(haversine));
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
