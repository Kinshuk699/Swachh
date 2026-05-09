import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import AdminPage from "./page";

vi.mock("@/lib/admin/submissions", () => ({
  listPendingRestroomSubmissions: vi.fn(async () => ({
    storageConfigured: true,
    submissions: [
      {
        id: "submission-1",
        name: "Clean Fuel Stop",
        category: "fuel_station",
        highwayName: "Mumbai-Pune Expressway",
        routeContext: "Khalapur service corridor",
        latitude: 18.765,
        longitude: 73.377,
        freeAccess: true,
        womenFriendly: true,
        accessible: false,
        cleanlinessRating: 4,
        safetyNotes: "Attendant visible",
        googlePlaceId: "google-place-id-123",
        status: "pending",
        createdAt: "2026-05-09T00:00:00.000Z",
      },
    ],
  })),
}));

describe("AdminPage", () => {
  it("renders the pending restroom submission queue", async () => {
    render(await AdminPage());

    expect(screen.getByText("Pending submissions")).toBeTruthy();
    expect(screen.getByText("Clean Fuel Stop")).toBeTruthy();
    expect(screen.getByText("Mumbai-Pune Expressway")).toBeTruthy();
    expect(screen.getByText("Khalapur service corridor")).toBeTruthy();
  });
});