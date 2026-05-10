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
    expect(fetch).toHaveBeenCalledWith("/api/google-curated-places?visibility=all_found&limit=1000");
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
                name: "Village Food Courts",
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
              },
            ],
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

    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/google-curated-places?visibility=all_found&limit=1000"));
    expect(fetch).toHaveBeenCalledWith("/api/highways/national");
    expect(await screen.findByText("NH-44")).toBeTruthy();
    expect(screen.getByText("© OpenStreetMap contributors")).toBeTruthy();
    expect(screen.getByText(/Tier 3/i)).toBeTruthy();
    expect(screen.getByText("Village Food Courts")).toBeTruthy();
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
