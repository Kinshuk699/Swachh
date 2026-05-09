import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { sampleHighwayStops } from "@/lib/restrooms/sample-stops";
import { HighwayPlanner } from "./HighwayPlanner";

vi.mock("./MapCanvas", () => ({
  MapCanvas: ({ routePolyline }: { routePolyline?: string }) => <div data-route-polyline={routePolyline} data-testid="map-canvas" />,
}));

describe("HighwayPlanner", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("plans stops through the route search API and displays live route distance", async () => {
    let capturedRequest: RequestInit | undefined;
    const fetchSpy = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedRequest = init;

      return new Response(
        JSON.stringify({
          intent: { mode: "plan-route", requiresTripContext: false },
          route: {
            provider: "google_routes",
            distanceMeters: 148_400,
            durationSeconds: 9_389,
            encodedPolyline: "encoded-route",
          },
          stops: sampleHighwayStops.slice(0, 1),
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchSpy);

    render(<HighwayPlanner />);
    fireEvent.click(screen.getByRole("button", { name: "Plan stops" }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith("/api/routes/search", expect.any(Object)));

    expect(capturedRequest?.method).toBe("POST");
    expect(JSON.parse(String(capturedRequest?.body))).toMatchObject({
      origin: "Mumbai",
      destination: "Pune",
      highwayName: "Mumbai-Pune Expressway",
    });
    expect(await screen.findByText("148 km")).toBeTruthy();
    expect(screen.getByTestId("map-canvas").getAttribute("data-route-polyline")).toBe("encoded-route");
  });
});