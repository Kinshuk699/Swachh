import type { CandidateStop } from "@/lib/highways/highway-relevance";

export type HighwayStop = CandidateStop & {
  lat: number;
  lng: number;
  highway: string;
  locality: string;
  priceLabel: "Free" | "Customer access" | "Paid" | "Unknown";
  facilities: string[];
  placeId?: string;
  googleMapsUri?: string;
  googlePlaceName?: string;
  openingHoursText?: string[];
  isPaidPremium?: boolean;
  cleanlinessLabel?: string;
  sourceLabel?: string;
  cleanlinessTier?: "tier_1" | "tier_2" | "tier_3" | "tier_4";
  verificationStatus?: "likely_clean" | "matched" | "verified_clean" | "approved";
};

export const sampleHighwayStops: HighwayStop[] = [
  {
    id: "lavato-krishnagiri",
    name: "LAVATO - A Premium Lounge",
    category: "public_restroom",
    distanceFromRouteMeters: 350,
    distanceFromHighwayMeters: 180,
    detourMinutes: 4,
    isEndpointStagingArea: false,
    isInsideDenseCity: false,
    source: "google_place",
    confidence: 0.95,
    openNow: true,
    verified: true,
    lat: 12.5732978,
    lng: 78.1692122,
    highway: "NH-44",
    locality: "Krishnagiri toll plaza corridor",
    priceLabel: "Paid",
    facilities: ["Paid premium lounge", "AC washroom", "Google verified", "Highway corridor"],
    placeId: "ChIJgwabcfrNrTsRxuE8JnwhFL8",
    googleMapsUri: "https://maps.google.com/?cid=13768666777879634374",
    googlePlaceName: "LAVATO - A Premium Lounge",
    cleanlinessLabel: "Premium restroom",
    sourceLabel: "Premium restroom",
    openingHoursText: [
      "Monday: 8:00 AM - 10:00 PM",
      "Tuesday: Closed",
      "Wednesday: 8:00 AM - 10:00 PM",
      "Thursday: 8:00 AM - 10:00 PM",
      "Friday: 8:00 AM - 10:00 PM",
      "Saturday: 8:00 AM - 10:00 PM",
      "Sunday: 8:00 AM - 10:00 PM",
    ],
    isPaidPremium: true,
  },
  {
    id: "mumbai-pune-food-plaza",
    name: "Expressway Food Plaza",
    category: "food_plaza",
    distanceFromRouteMeters: 180,
    distanceFromHighwayMeters: 80,
    detourMinutes: 3,
    isEndpointStagingArea: false,
    isInsideDenseCity: false,
    source: "crowdsourced",
    confidence: 0.94,
    openNow: true,
    verified: true,
    lat: 18.7632,
    lng: 73.3768,
    highway: "Mumbai-Pune Expressway",
    locality: "Khalapur service corridor",
    priceLabel: "Customer access",
    facilities: ["Women-friendly", "Food court", "Parking", "Lighting"],
  },
  {
    id: "nh48-toll-plaza",
    name: "NH48 Toll Plaza Restroom",
    category: "toll_plaza",
    distanceFromRouteMeters: 420,
    distanceFromHighwayMeters: 120,
    detourMinutes: 5,
    isEndpointStagingArea: false,
    isInsideDenseCity: false,
    source: "crowdsourced",
    confidence: 0.86,
    openNow: true,
    verified: true,
    lat: 19.3821,
    lng: 72.9287,
    highway: "NH48",
    locality: "Toll plaza block",
    priceLabel: "Free",
    facilities: ["Public", "FASTag corridor", "Attendant"],
  },
  {
    id: "city-edge-fuel-station",
    name: "City Edge Fuel Station",
    category: "fuel_station",
    distanceFromRouteMeters: 2_700,
    distanceFromHighwayMeters: 1_400,
    detourMinutes: 10,
    isEndpointStagingArea: true,
    isInsideDenseCity: true,
    source: "google_place",
    confidence: 0.72,
    openNow: true,
    verified: false,
    lat: 18.5975,
    lng: 73.7182,
    highway: "Mumbai-Pune Expressway",
    locality: "Pune entry staging area",
    priceLabel: "Customer access",
    facilities: ["Fuel", "Convenience store", "Near city entry"],
    placeId: "google-place-id-placeholder-city-edge-fuel",
  },
  {
    id: "dense-city-mall",
    name: "Dense City Mall Restroom",
    category: "public_restroom",
    distanceFromRouteMeters: 7_400,
    distanceFromHighwayMeters: 9_200,
    detourMinutes: 28,
    isEndpointStagingArea: false,
    isInsideDenseCity: true,
    source: "crowdsourced",
    confidence: 0.8,
    openNow: true,
    verified: true,
    lat: 18.9388,
    lng: 72.8354,
    highway: "None",
    locality: "Mumbai city center",
    priceLabel: "Free",
    facilities: ["Urban mall"],
  },
];
