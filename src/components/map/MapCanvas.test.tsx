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
  Polyline: ({ encodedPath, strokeColor }: { encodedPath?: string; strokeColor?: string }) => (
    <div data-encoded-path={encodedPath} data-stroke-color={strokeColor} data-testid="route-polyline" />
  ),
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
    expect(fetch).toHaveBeenCalledWith("/api/google-curated-places?limit=24");
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
