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

  it("keeps the Swachh atlas when a live route polyline is available", () => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = "browser-key";

    render(
      <MapCanvas
        stops={sampleHighwayStops.slice(0, 1)}
        selectedStopId="mumbai-pune-food-plaza"
        routePolyline="encoded-route"
        onSelectStop={() => {}}
      />,
    );

    expect(screen.queryByTestId("google-map")).toBeNull();
    const atlas = screen.getByRole("img", { name: /swachh national highway atlas/i });
    expect(atlas).toBeTruthy();
    expect(atlas.getAttribute("viewBox")).toBe("0 0 390 430");
    expect(screen.getByLabelText("Planned route corridor")).toBeTruthy();
    expect(screen.getByTestId("india-mainland-outline").getAttribute("d")).toContain("C210 342 193 369 172 407");
    expect(screen.getByTestId("india-northeast-outline").getAttribute("d")).toContain("C344 151 366 169 360 190");
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

  it("renders a branded national highway atlas with seeded corridors and stop markers", () => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = "";

    render(
      <MapCanvas
        stops={sampleHighwayStops}
        selectedStopId="mumbai-pune-food-plaza"
        onSelectStop={() => {}}
      />,
    );

    expect(screen.getByRole("img", { name: /swachh national highway atlas/i })).toBeTruthy();
    expect(screen.getByTestId("india-mainland-outline").getAttribute("d")).toContain("C210 342 193 369 172 407");
    expect(screen.getByTestId("india-mainland-outline").getAttribute("stroke-width")).toBe("3");
    expect(screen.getByTestId("india-northeast-outline").getAttribute("d")).toContain("C344 151 366 169 360 190");
    expect(screen.getByText("Mumbai-Pune Expressway")).toBeTruthy();
    expect(screen.getByText("NH48")).toBeTruthy();
    expect(screen.getByText("Women-friendly verified")).toBeTruthy();
    expect(screen.getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toContain("Expressway Food Plaza");
  });
});
