import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { sampleHighwayStops } from "@/lib/restrooms/sample-stops";
import { MapCanvas } from "./MapCanvas";

vi.mock("@vis.gl/react-google-maps", () => ({
  APIProvider: ({ children }: { children: ReactNode }) => <div data-testid="api-provider">{children}</div>,
  Map: ({ children, styles }: { children: ReactNode; styles?: unknown }) => (
    <div data-has-styles={Array.isArray(styles) ? "true" : "false"} data-testid="google-map">
      {children}
    </div>
  ),
  Marker: ({ icon, onClick, title }: { icon?: string; onClick?: () => void; title?: string }) => (
    <button data-icon={icon} data-testid="map-marker" onClick={onClick} type="button">
      {title}
    </button>
  ),
  InfoWindow: ({ children }: { children: ReactNode }) => <div data-testid="info-window">{children}</div>,
  useMap: () => ({
    fitBounds: vi.fn(),
  }),
}));

describe("MapCanvas", () => {
  const originalApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  afterEach(() => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = originalApiKey;
    vi.unstubAllGlobals();
  });

  it("renders the normal Google map when a browser key is configured", async () => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = "browser-key";
    stubCuratedPlacesFetch();

    render(
      <MapCanvas
        stops={sampleHighwayStops.slice(0, 1)}
        selectedStopId="mumbai-pune-food-plaza"
        routePolyline="encoded-route"
        onSelectStop={() => {}}
      />,
    );

    expect(screen.getByTestId("google-map")).toBeTruthy();
    expect(screen.queryByRole("img", { name: /swachh national highway atlas/i })).toBeNull();
    expect(screen.getByTestId("google-map").getAttribute("data-has-styles")).toBe("true");
    await waitFor(() => expect(screen.getByText(/highway stops/i)).toBeTruthy());
    expect(fetch).toHaveBeenCalledWith("/api/google-curated-places?visibility=all_found&details=google&limit=1500");
  });

  it("loads all found stops and cached National Highways for the map atlas", async () => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = "browser-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("/api/highways/national")) {
          return new Response(
            JSON.stringify({
              source: "openstreetmap",
              attribution: "© OpenStreetMap contributors",
              generatedAt: "2026-05-11T00:00:00.000Z",
              highways: [
                {
                  id: "nh-44-south-sample",
                  ref: "NH-44",
                  name: "National Highway 44",
                  color: "#2563eb",
                  bounds: { north: 15.83, south: 13.05, east: 77.7, west: 77.59 },
                  geometry: { type: "LineString", coordinates: [[77.59, 13.05], [77.7, 13.2], [77.6, 13.65]] },
                },
              ],
            }),
            { status: 200 },
          );
        }

        return new Response(
          JSON.stringify({
            visibility: "all_found",
            places: [
              {
                id: "google-tier-three",
                name: "Village Food Courts Kamat Upachar",
                category: "food_plaza",
                distanceFromRouteMeters: 180,
                distanceFromHighwayMeters: 180,
                detourMinutes: 1,
                isEndpointStagingArea: false,
                isInsideDenseCity: false,
                source: "google_place",
                confidence: 0.82,
                openNow: false,
                verified: false,
                lat: 13.65,
                lng: 77.6,
                highway: "NH-44",
                locality: "Bengaluru-Hyderabad",
                priceLabel: "Customer access",
                facilities: ["Food plaza"],
                placeId: "tier-three-food-plaza-id",
                cleanlinessLabel: "Food plaza candidate",
                sourceLabel: "Food plaza candidate",
                cleanlinessTier: "tier_3",
                verificationStatus: "matched",
                googlePlaceName: "Village Food Courts Kamat Upachar",
              },
            ],
            candidates: [],
            storedRowsRead: 1,
            placeDetailsRequests: 1,
            textSearchRequests: 0,
            capped: false,
          }),
          { status: 200 },
        );
      }),
    );

    render(<MapCanvas stops={[]} selectedStopId="" onSelectStop={() => {}} />);

    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/google-curated-places?visibility=all_found&details=google&limit=1500"));
    expect(fetch).toHaveBeenCalledWith("/api/highways/national");
    expect(await screen.findByText("NH-44")).toBeTruthy();
    expect(screen.getByText("© OpenStreetMap contributors")).toBeTruthy();
    expect(screen.getByText(/Tier 3/i)).toBeTruthy();
    fireEvent.click(screen.getByText("NH-44").closest("button")!);
    expect(screen.getByText("Village Food Courts Kamat Upachar")).toBeTruthy();
    expect(screen.getByText(/Text Search 0/i)).toBeTruthy();
    expect(screen.getByText(/Details 1/i)).toBeTruthy();
  });

  it("dims every other National Highway when one highway is selected", async () => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = "browser-key";
    const polylineOptions: Array<{ strokeColor: string; strokeOpacity: number; strokeWeight: number }> = [];
    const polylineSpy = vi.fn(function Polyline(options: { strokeColor: string; strokeOpacity: number; strokeWeight: number }) {
      polylineOptions.push(options);
      return { setMap: vi.fn() };
    });
    vi.stubGlobal("google", { maps: { Polyline: polylineSpy } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("/api/highways/national")) {
          return new Response(
            JSON.stringify({
              highways: [
                {
                  id: "nh-44-sample",
                  ref: "NH-44",
                  name: "National Highway 44",
                  color: "#2563eb",
                  bounds: { north: 15, south: 13, east: 78, west: 77 },
                  geometry: { type: "LineString", coordinates: [[77.6, 13.6], [77.8, 14.2]] },
                },
                {
                  id: "nh-48-sample",
                  ref: "NH-48",
                  name: "National Highway 48",
                  color: "#dc2626",
                  bounds: { north: 20, south: 18, east: 74, west: 72 },
                  geometry: { type: "LineString", coordinates: [[72.9, 18.8], [73.4, 19.4]] },
                },
              ],
            }),
            { status: 200 },
          );
        }

        return new Response(
          JSON.stringify({
            places: [],
            candidates: [],
            storedRowsRead: 0,
            placeDetailsRequests: 0,
            textSearchRequests: 0,
            capped: false,
          }),
          { status: 200 },
        );
      }),
    );

    render(<MapCanvas stops={[]} selectedStopId="" onSelectStop={() => {}} />);

    fireEvent.click(await screen.findByText("NH-48"));

    await waitFor(() => expect(polylineSpy).toHaveBeenCalledTimes(4));
    const latestPolylineOptions = polylineOptions.slice(-2);

    expect(latestPolylineOptions).toEqual([
      expect.objectContaining({ strokeColor: "#9ca3af", strokeOpacity: 0.14, strokeWeight: 3 }),
      expect.objectContaining({ strokeColor: "#dc2626", strokeOpacity: 0.95, strokeWeight: 7 }),
    ]);
  });

  it("hides unrelated restroom markers when a National Highway is selected", async () => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = "browser-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("/api/highways/national")) {
          return new Response(
            JSON.stringify({
              highways: [
                {
                  id: "nh-44-sample",
                  ref: "NH-44",
                  name: "National Highway 44",
                  color: "#2563eb",
                  bounds: { north: 15, south: 13, east: 78, west: 77 },
                  geometry: { type: "LineString", coordinates: [[77.6, 13.6], [77.8, 14.2]] },
                },
              ],
            }),
            { status: 200 },
          );
        }

        return new Response(
          JSON.stringify({
            places: [],
            candidates: [],
            storedRowsRead: 0,
            placeDetailsRequests: 0,
            textSearchRequests: 0,
            capped: false,
          }),
          { status: 200 },
        );
      }),
    );

    render(<MapCanvas stops={sampleHighwayStops} selectedStopId="" onSelectStop={() => {}} />);

    expect(await screen.findByText("Expressway Food Plaza")).toBeTruthy();
    expect(screen.getByText("LAVATO - A Premium Lounge")).toBeTruthy();

    fireEvent.click(screen.getByText("NH-44"));

    await waitFor(() => expect(screen.queryByText("Expressway Food Plaza")).toBeNull());
    expect(screen.getByText("LAVATO - A Premium Lounge")).toBeTruthy();
  });

  it("loads Google Details only after an explicit traveler action", async () => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = "browser-key";
    const stop = sampleHighwayStops.find((candidate) => candidate.id === "city-edge-fuel-station")!;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);

        if (url.includes("/api/google/place-details")) {
          return new Response(
            JSON.stringify({
              id: stop.placeId,
              displayName: "City Edge Fuel Station",
              location: { latitude: stop.lat, longitude: stop.lng },
              types: ["gas_station"],
              googleMapsUri: "https://maps.google.com/?cid=789",
              openNow: true,
              weekdayDescriptions: ["Monday: Open 24 hours"],
            }),
            { status: 200 },
          );
        }

        if (url.includes("/api/highways/national")) {
          return new Response(JSON.stringify({ highways: [] }), { status: 200 });
        }

        return new Response(
          JSON.stringify({
            places: [],
            candidates: [],
            storedRowsRead: 0,
            placeDetailsRequests: 0,
            textSearchRequests: 0,
            capped: false,
          }),
          { status: 200 },
        );
      }),
    );

    render(<MapCanvas stops={[stop]} selectedStopId="" onSelectStop={() => {}} />);

    fireEvent.click(await screen.findByText("City Edge Fuel Station"));
    const loadDetailsButton = await screen.findByRole("button", { name: /load google details/i });
    expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining("/api/google/place-details"));

    fireEvent.click(loadDetailsButton);

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(`/api/google/place-details?placeId=${encodeURIComponent(stop.placeId!)}`));
    expect(await screen.findByText("Monday: Open 24 hours")).toBeTruthy();
    expect(screen.getByText(/Details 1/i)).toBeTruthy();
  });

  it("shows a Google Maps configuration message when the browser key is missing", () => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = "";

    render(
      <MapCanvas
        stops={sampleHighwayStops.slice(0, 1)}
        selectedStopId="mumbai-pune-food-plaza"
        routePolyline="encoded-route"
        onSelectStop={() => {}}
      />,
    );

    expect(screen.getByText("Google Maps key needed")).toBeTruthy();
    expect(screen.queryByTestId("google-map")).toBeNull();
  });

  it("renders paid premium Google places as gold markers and opens a details window", async () => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = "browser-key";
    stubCuratedPlacesFetch();

    render(
      <MapCanvas
        stops={sampleHighwayStops.filter((stop) => stop.id === "lavato-krishnagiri")}
        selectedStopId="lavato-krishnagiri"
        onSelectStop={() => {}}
      />,
    );

    const marker = screen.getByTestId("map-marker");
    expect(marker.textContent).toContain("LAVATO - A Premium Lounge");
    expect(marker.getAttribute("data-icon")).toContain("yellow-dot");
    await waitFor(() => expect(screen.getByText(/highway stops/i)).toBeTruthy());
    fireEvent.click(marker);
    expect(screen.getByTestId("info-window")).toBeTruthy();
    expect(screen.getAllByText("Premium restroom").length).toBeGreaterThan(0);
    expect(screen.getByText("Paid premium lounge")).toBeTruthy();
    expect(screen.getByText("Monday: 8:00 AM - 10:00 PM")).toBeTruthy();
    expect(screen.queryByText(/tier_1/i)).toBeNull();
    await waitFor(() => expect(screen.getByText(/highway stops/i)).toBeTruthy());
  });
});

function stubCuratedPlacesFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(
        JSON.stringify({
          places: [],
          storedRowsRead: 0,
          placeDetailsRequests: 0,
          textSearchRequests: 0,
          capped: true,
        }),
        { status: 200 },
      ),
    ),
  );
}
