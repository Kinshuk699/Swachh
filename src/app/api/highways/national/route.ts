import { NextResponse } from "next/server";

import { getCachedNationalHighwayOverlays, getNationalHighwayAttribution, getNationalHighwayGeneratedAt } from "@/lib/highways/national-highways";

export function GET() {
  return NextResponse.json({
    source: "openstreetmap",
    attribution: getNationalHighwayAttribution(),
    generatedAt: getNationalHighwayGeneratedAt(),
    highways: getCachedNationalHighwayOverlays(),
  });
}
