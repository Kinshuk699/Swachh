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

  it("submits a new highway restroom stop for moderation", async () => {
    let capturedRequest: RequestInit | undefined;
    const fetchSpy = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url) === "/api/restrooms/submissions") {
        capturedRequest = init;
        return new Response(JSON.stringify({ ok: true, status: "pending" }), { status: 201 });
      }

      return new Response(JSON.stringify({ intent: { mode: "plan-route", requiresTripContext: false }, route: null, stops: [] }), {
        status: 200,
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    render(<HighwayPlanner />);
    fireEvent.click(screen.getByRole("button", { name: "Submit missing stop" }));
    expect(screen.getByText("Report a restroom stop")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Stop name"), { target: { value: "Clean Fuel Stop" } });
    fireEvent.change(screen.getByLabelText("Latitude"), { target: { value: "18.765" } });
    fireEvent.change(screen.getByLabelText("Longitude"), { target: { value: "73.377" } });
    fireEvent.click(screen.getByRole("button", { name: "Send for review" }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith("/api/restrooms/submissions", expect.any(Object)));
    expect(JSON.parse(String(capturedRequest?.body))).toMatchObject({
      name: "Clean Fuel Stop",
      category: "fuel_station",
      latitude: 18.765,
      longitude: 73.377,
      highwayName: "Mumbai-Pune Expressway",
    });
    expect(await screen.findByText("Submission saved for moderation.")).toBeTruthy();
  });
});