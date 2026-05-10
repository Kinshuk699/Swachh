export type CachedHighwayGeometry = {
  type: "LineString" | "MultiLineString";
  coordinates: number[][] | number[][][];
};


export type CachedNationalHighwayFeature = {
  id: string;
  ref: string;
  name?: string;
  highwayClass: "motorway" | "trunk" | "primary" | "secondary";
  source: "openstreetmap";
  isNationalHighway: boolean;
  isExpressway: boolean;
  geometry: CachedHighwayGeometry;
};

export const nationalHighwayDataset = {
  source: "openstreetmap" as const,
  generatedAt: "2026-05-11T00:00:00.000Z",
  attribution: "© OpenStreetMap contributors",
  features: [
    {
      id: "nh-44-south-sample",
      ref: "NH 44",
      name: "National Highway 44",
      highwayClass: "trunk",
      source: "openstreetmap",
      isNationalHighway: true,
      isExpressway: false,
      geometry: {
        type: "LineString",
        coordinates: [
          [77.59, 13.05],
          [77.7, 13.2],
          [77.6, 13.65],
          [77.6, 14.68],
          [77.63, 15.83],
        ],
      },
    },
    {
      id: "nh-48-north-west-sample",
      ref: "NH-48",
      name: "National Highway 48",
      highwayClass: "trunk",
      source: "openstreetmap",
      isNationalHighway: true,
      isExpressway: false,
      geometry: {
        type: "LineString",
        coordinates: [
          [76.96, 28.39],
          [76.39, 27.99],
          [76.08, 27.55],
          [75.56, 26.84],
          [75.17, 26.58],
          [74.64, 26.45],
        ],
      },
    },
    {
      id: "nh-19-east-sample",
      ref: "NH 19",
      name: "National Highway 19",
      highwayClass: "trunk",
      source: "openstreetmap",
      isNationalHighway: true,
      isExpressway: false,
      geometry: {
        type: "LineString",
        coordinates: [
          [88.14, 22.75],
          [87.86, 23.23],
          [86.98, 23.68],
          [86.42, 23.77],
          [84.36, 24.76],
        ],
      },
    },
  ] satisfies CachedNationalHighwayFeature[],
};