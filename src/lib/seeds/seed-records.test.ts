import { describe, expect, it } from "vitest";

import {
  buildGoogleSearchText,
  parseCuratedStopCsv,
  parseProxyBrandCsv,
} from "./seed-records";

describe("seed records", () => {
  it("parses proxy brand CSV rows into trusted hygiene proxy records", () => {
    const records = parseProxyBrandCsv(`brand_name,region,proxy_type,default_confidence,notes
Cube Stop,Pan-India,wayside_amenity,0.9,Dedicated Wash Stop with staffed restroom operations
Shell Select,Pan-India,fuel_cafe,0.78,Clean fuel station restroom proxy`);

    expect(records).toEqual([
      {
        brandName: "Cube Stop",
        region: "Pan-India",
        proxyType: "wayside_amenity",
        defaultConfidence: 0.9,
        notes: "Dedicated Wash Stop with staffed restroom operations",
      },
      {
        brandName: "Shell Select",
        region: "Pan-India",
        proxyType: "fuel_cafe",
        defaultConfidence: 0.78,
        notes: "Clean fuel station restroom proxy",
      },
    ]);
  });

  it("parses curated stop candidates with route context", () => {
    const records = parseCuratedStopCsv(`name,region,proxy_type,highway_context,route_context,locality_hint,default_confidence,notes
Lavato,South India,premium_lavatory,NH-44,Krishnagiri toll plaza,Krishnagiri,0.95,Premium AC lavatory service near toll plaza`);

    expect(records[0]).toMatchObject({
      name: "Lavato",
      highwayContext: "NH-44",
      routeContext: "Krishnagiri toll plaza",
      localityHint: "Krishnagiri",
      defaultConfidence: 0.95,
    });
  });

  it("builds a Google Places search string from app-owned seed context", () => {
    expect(
      buildGoogleSearchText({
        name: "Lavato",
        highwayContext: "NH-44",
        routeContext: "Krishnagiri toll plaza",
        localityHint: "Krishnagiri",
      }),
    ).toBe("Lavato NH-44 Krishnagiri toll plaza Krishnagiri India");
  });

  it("rejects confidence values outside 0 to 1", () => {
    expect(() =>
      parseProxyBrandCsv(`brand_name,region,proxy_type,default_confidence,notes
Bad Brand,Pan-India,fuel_cafe,3,Invalid confidence`),
    ).toThrow("default_confidence must be between 0 and 1");
  });
});