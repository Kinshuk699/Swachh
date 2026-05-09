"use client";

import { APIProvider, Map, Marker, Polyline } from "@vis.gl/react-google-maps";
import { MapPinned } from "lucide-react";

import type { HighwayStop } from "@/lib/restrooms/sample-stops";

type MapCanvasProps = {
  stops: HighwayStop[];
  selectedStopId: string;
  routePolyline?: string;
  onSelectStop: (stopId: string) => void;
};

const fallbackPositions = [
  { left: "35%", top: "38%" },
  { left: "49%", top: "50%" },
  { left: "66%", top: "62%" },
  { left: "78%", top: "44%" },
];

export function MapCanvas({ stops, selectedStopId, routePolyline, onSelectStop }: MapCanvasProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (apiKey) {
    return (
      <APIProvider apiKey={apiKey}>
        <Map
          className="h-full min-h-[420px] w-full"
          defaultCenter={{ lat: 20.5937, lng: 78.9629 }}
          defaultZoom={5}
          gestureHandling="greedy"
          disableDefaultUI={false}
          mapTypeControl={false}
          streetViewControl={false}
        >
          {routePolyline ? (
            <Polyline
              encodedPath={routePolyline}
              strokeColor="#0f766e"
              strokeOpacity={0.85}
              strokeWeight={5}
              clickable={false}
              zIndex={1}
            />
          ) : null}
          {stops.map((stop) => (
            <Marker
              key={stop.id}
              position={{ lat: stop.lat, lng: stop.lng }}
              onClick={() => onSelectStop(stop.id)}
              title={stop.name}
            />
          ))}
        </Map>
      </APIProvider>
    );
  }

  return (
    <div className="relative h-full min-h-[420px] overflow-hidden bg-[#e8f1ef]">
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(15,118,110,0.08)_1px,transparent_1px),linear-gradient(0deg,rgba(3,105,161,0.08)_1px,transparent_1px)] bg-[size:44px_44px]" />
      <div className="absolute left-[12%] top-[18%] h-[70%] w-[76%] rounded-[45%] border border-teal-800/10 bg-emerald-50/70" />
      <div className="absolute left-[15%] top-[55%] h-3 w-[72%] -rotate-6 rounded-full bg-slate-700 shadow-sm" />
      <div className="absolute left-[18%] top-[57%] h-1 w-[66%] -rotate-6 rounded-full bg-amber-300" />
      {routePolyline ? (
        <div
          aria-label="Planned route corridor"
          className="absolute left-[15%] top-[54%] h-6 w-[73%] -rotate-6 rounded-full border-2 border-teal-700/70 bg-teal-500/15 shadow-[0_0_0_6px_rgba(20,184,166,0.12)]"
          role="img"
        />
      ) : null}
      <div className="absolute left-[22%] top-[35%] h-2 w-[50%] rotate-12 rounded-full bg-sky-700/70" />
      <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-md border border-slate-300 bg-white/90 px-3 py-2 text-sm font-medium text-slate-700 shadow-soft">
        <MapPinned className="h-4 w-4 text-teal-700" aria-hidden="true" />
        Map preview
      </div>
      {stops.map((stop, index) => {
        const position = fallbackPositions[index % fallbackPositions.length];
        const selected = selectedStopId === stop.id;

        return (
          <button
            key={stop.id}
            type="button"
            title={stop.name}
            aria-label={stop.name}
            onClick={() => onSelectStop(stop.id)}
            className={`absolute flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 shadow-soft transition ${
              selected
                ? "border-slate-950 bg-amber-300 text-slate-950"
                : "border-white bg-teal-700 text-white hover:bg-teal-800"
            }`}
            style={position}
          >
            <MapPinned className="h-5 w-5" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
