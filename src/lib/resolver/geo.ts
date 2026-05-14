export type LatLng = {
  latitude: number;
  longitude: number;
};

export type ReferenceDistanceBand = "excellent" | "strong" | "acceptable" | "weak_review" | "over_300m_review";

const earthRadiusMeters = 6_371_000;

export function distanceMeters(left: LatLng, right: LatLng): number {
  const leftLatitude = toRadians(left.latitude);
  const rightLatitude = toRadians(right.latitude);
  const deltaLatitude = toRadians(right.latitude - left.latitude);
  const deltaLongitude = toRadians(right.longitude - left.longitude);
  const haversine =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(deltaLongitude / 2) ** 2;

  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function classifyReferenceDistance(distanceFromGoogleMeters: number): ReferenceDistanceBand {
  if (distanceFromGoogleMeters <= 75) {
    return "excellent";
  }

  if (distanceFromGoogleMeters <= 150) {
    return "strong";
  }

  if (distanceFromGoogleMeters <= 200) {
    return "acceptable";
  }

  if (distanceFromGoogleMeters <= 300) {
    return "weak_review";
  }

  return "over_300m_review";
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}