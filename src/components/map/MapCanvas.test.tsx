import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { sampleHighwayStops } from "@/lib/restrooms/sample-stops";
import { MapCanvas } from "./MapCanvas";

vi.mock("@vis.gl/react-google-maps", () => ({
  APIProvider: ({ children }: { children: ReactNode }) => <div data-testid="api-provider">{children}</div>,
  Map: ({ children }: { children: ReactNode }) => <div data-testid="google-map">{children}</div>,
  Marker: ({ title }: { title?: string }) => <div data-testid="map-marker">{title}</div>,
  Polyline: ({ encodedPath, strokeColor }: { encodedPath?: string; strokeColor?: string }) => (
    <div data-encoded-path={encodedPath} data-stroke-color={strokeColor} data-testid="route-polyline" />
  ),
}));

describe("MapCanvas", () => {
  const originalApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  afterEach(() => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = originalApiKey;
  });

  it("draws the encoded route polyline on the Google map", () => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = "browser-key";

    render(
      <MapCanvas
        stops={sampleHighwayStops.slice(0, 1)}
        selectedStopId="mumbai-pune-food-plaza"
        routePolyline="encoded-route"
        onSelectStop={() => {}}
      />,
    );

    expect(screen.getByTestId("route-polyline").getAttribute("data-encoded-path")).toBe("encoded-route");
    expect(screen.getByTestId("route-polyline").getAttribute("data-stroke-color")).toBe("#0f766e");
  });

  it("shows a route corridor in map preview mode", () => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = "";

    render(
      <MapCanvas
        stops={sampleHighwayStops.slice(0, 1)}
        selectedStopId="mumbai-pune-food-plaza"
        routePolyline="encoded-route"
        onSelectStop={() => {}}
      />,
    );

    expect(screen.getByLabelText("Planned route corridor")).toBeTruthy();
  });
});