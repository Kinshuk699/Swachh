export type HighwayCorridor = {
  id: string;
  name: string;
  shortName: string;
  from: string;
  to: string;
  category: "expressway" | "national_highway" | "service_corridor";
  coverageStatus: "strong" | "growing" | "sparse";
  color: string;
  path: string;
  label: {
    x: number;
    y: number;
  };
  featuredStopIds: string[];
};

export const sampleHighwayCorridors: HighwayCorridor[] = [
  {
    id: "mumbai-pune-expressway",
    name: "Mumbai-Pune Expressway",
    shortName: "MPEW",
    from: "Mumbai",
    to: "Pune",
    category: "expressway",
    coverageStatus: "strong",
    color: "#ffb23f",
    path: "M116 254 C128 255 141 263 153 274",
    label: { x: 66, y: 248 },
    featuredStopIds: ["mumbai-pune-food-plaza", "city-edge-fuel-station"],
  },
  {
    id: "nh48",
    name: "NH48",
    shortName: "NH48",
    from: "Delhi",
    to: "Bengaluru",
    category: "national_highway",
    coverageStatus: "growing",
    color: "#59c7d8",
    path: "M172 118 C145 146 133 181 128 216 C124 250 143 283 166 327",
    label: { x: 119, y: 184 },
    featuredStopIds: ["nh48-toll-plaza"],
  },
  {
    id: "nh44",
    name: "NH44",
    shortName: "NH44",
    from: "Srinagar",
    to: "Kanyakumari",
    category: "national_highway",
    coverageStatus: "sparse",
    color: "#64d39a",
    path: "M159 55 C178 88 181 130 180 164 C179 207 194 242 192 279 C190 318 171 355 148 394",
    label: { x: 188, y: 129 },
    featuredStopIds: [],
  },
  {
    id: "nh65",
    name: "NH65",
    shortName: "NH65",
    from: "Hyderabad",
    to: "Vijayawada",
    category: "national_highway",
    coverageStatus: "growing",
    color: "#b7d75d",
    path: "M153 274 C176 261 199 251 226 250 C246 250 263 257 281 268",
    label: { x: 221, y: 241 },
    featuredStopIds: [],
  },
  {
    id: "nh19",
    name: "NH19",
    shortName: "NH19",
    from: "Delhi",
    to: "Kolkata",
    category: "national_highway",
    coverageStatus: "sparse",
    color: "#f46f8b",
    path: "M172 118 C202 127 230 143 254 163 C277 182 297 206 313 227",
    label: { x: 252, y: 153 },
    featuredStopIds: [],
  },
];
