"use client";

import {
  Accessibility,
  CheckCircle2,
  Clock,
  Coffee,
  Fuel,
  LocateFixed,
  MessageCircle,
  Navigation,
  Plus,
  Route,
  Search,
  ShieldCheck,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

import { buildRouteSearchResponse } from "@/lib/routes/route-search";
import type { HighwayStop } from "@/lib/restrooms/sample-stops";
import { MapCanvas } from "./MapCanvas";

const filterOptions = [
  { label: "Open", icon: Clock },
  { label: "Free", icon: CheckCircle2 },
  { label: "Women-friendly", icon: ShieldCheck },
  { label: "Accessible", icon: Accessibility },
  { label: "Fuel", icon: Fuel },
  { label: "Food", icon: Coffee },
];

export function HighwayPlanner() {
  const [origin, setOrigin] = useState("Mumbai");
  const [destination, setDestination] = useState("Pune");
  const [highwayName, setHighwayName] = useState("Mumbai-Pune Expressway");
  const [isInsideCity, setIsInsideCity] = useState(true);
  const [searched, setSearched] = useState(true);
  const [selectedStopId, setSelectedStopId] = useState("shree-datta-snacks-mumbai-pune");

  const response = useMemo(
    () =>
      buildRouteSearchResponse({
        origin,
        destination,
        highwayName,
        isInsideCity,
        distanceToHighwayMeters: isInsideCity ? 8_500 : 700,
      }),
    [destination, highwayName, isInsideCity, origin],
  );

  const stops = searched ? response.stops : [];
  const selectedStop = stops.find((stop) => stop.id === selectedStopId) ?? stops[0];

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearched(true);
    setSelectedStopId(response.stops[0]?.id ?? "shree-datta-snacks-mumbai-pune");
  }

  function handleCityOnly() {
    setIsInsideCity(true);
    setDestination("");
    setHighwayName("");
    setSearched(true);
    setSelectedStopId("");
  }

  function handleHighwayMode() {
    setIsInsideCity(false);
    setHighwayName("NH48");
    setSearched(true);
    setSelectedStopId(response.stops[0]?.id ?? "shree-datta-snacks-mumbai-pune");
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[420px_1fr]">
        <aside className="flex flex-col border-r border-slate-300 bg-white">
          <div className="border-b border-slate-200 px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase text-teal-700">Swachh</p>
                <h1 className="mt-1 text-2xl font-semibold text-slate-950">Highway restroom stops</h1>
              </div>
              <button
                type="button"
                title="WhatsApp"
                aria-label="WhatsApp"
                className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 text-teal-700 hover:bg-teal-50"
              >
                <MessageCircle className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </div>

          <form className="space-y-4 border-b border-slate-200 px-5 py-5" onSubmit={handleSubmit}>
            <div className="grid grid-cols-2 gap-2 rounded-md bg-slate-100 p-1">
              <button
                type="button"
                onClick={handleCityOnly}
                className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold ${
                  isInsideCity ? "bg-white text-slate-950 shadow-sm" : "text-slate-600 hover:bg-white/70"
                }`}
              >
                <LocateFixed className="h-4 w-4" aria-hidden="true" />
                City start
              </button>
              <button
                type="button"
                onClick={handleHighwayMode}
                className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold ${
                  !isInsideCity ? "bg-white text-slate-950 shadow-sm" : "text-slate-600 hover:bg-white/70"
                }`}
              >
                <Route className="h-4 w-4" aria-hidden="true" />
                On highway
              </button>
            </div>

            <label className="block text-sm font-medium text-slate-700" htmlFor="origin">
              Start
            </label>
            <input
              id="origin"
              value={origin}
              onChange={(event) => setOrigin(event.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-950"
              placeholder="City or current area"
            />

            <label className="block text-sm font-medium text-slate-700" htmlFor="destination">
              Destination
            </label>
            <input
              id="destination"
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-950"
              placeholder="Where are you heading?"
            />

            <label className="block text-sm font-medium text-slate-700" htmlFor="highway">
              Highway
            </label>
            <input
              id="highway"
              value={highwayName}
              onChange={(event) => setHighwayName(event.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-950"
              placeholder="NH48, expressway, bypass"
            />

            <div className="flex gap-2">
              <button
                type="submit"
                className="flex flex-1 items-center justify-center gap-2 rounded-md bg-teal-700 px-4 py-2 font-semibold text-white hover:bg-teal-800"
              >
                <Search className="h-4 w-4" aria-hidden="true" />
                Plan stops
              </button>
              <button
                type="button"
                title="Submit stop"
                aria-label="Submit stop"
                className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                <Plus className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </form>

          <div className="flex flex-wrap gap-2 border-b border-slate-200 px-5 py-4">
            {filterOptions.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.label}
                  type="button"
                  className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Icon className="h-4 w-4 text-teal-700" aria-hidden="true" />
                  {option.label}
                </button>
              );
            })}
          </div>

          <section className="min-h-0 flex-1 overflow-y-auto px-5 py-4" aria-label="Restroom stops">
            {response.intent.requiresTripContext ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
                <div className="flex items-start gap-3">
                  <Navigation className="mt-0.5 h-5 w-5 flex-none" aria-hidden="true" />
                  <div>
                    <h2 className="font-semibold">Where are you heading?</h2>
                    <p className="mt-1">Add a destination or highway to see route-ready restroom stops.</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {stops.map((stop) => (
                  <StopCard
                    key={stop.id}
                    stop={stop}
                    selected={selectedStop?.id === stop.id}
                    onSelect={() => setSelectedStopId(stop.id)}
                  />
                ))}
              </div>
            )}
          </section>
        </aside>

        <section className="grid min-h-[640px] grid-rows-[1fr_auto] bg-slate-200">
          <MapCanvas stops={stops} selectedStopId={selectedStop?.id ?? ""} onSelectStop={setSelectedStopId} />
          <div className="border-t border-slate-300 bg-white px-5 py-4">
            <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <p className="text-sm font-semibold text-teal-700">{selectedStop?.highway ?? "Trip context needed"}</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-950">{selectedStop?.name ?? "Add destination or highway"}</h2>
                <p className="mt-1 text-sm text-slate-600">{selectedStop?.locality ?? "City-only searches stay paused until a route is selected."}</p>
              </div>
              {selectedStop ? (
                <div className="grid grid-cols-3 gap-2 text-center text-sm">
                  <Metric label="Detour" value={`${selectedStop.detourMinutes}m`} />
                  <Metric label="Status" value={selectedStop.openNow ? "Open" : "Check"} />
                  <Metric label="Access" value={selectedStop.priceLabel} />
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function StopCard({ stop, selected, onSelect }: { stop: HighwayStop; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-md border p-4 text-left transition ${
        selected ? "border-teal-700 bg-teal-50" : "border-slate-200 bg-white hover:border-slate-400"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-950">{stop.name}</h3>
          <p className="mt-1 text-sm text-slate-600">{stop.highway}</p>
        </div>
        <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{stop.detourMinutes}m</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {stop.facilities.slice(0, 3).map((facility) => (
          <span key={facility} className="rounded-md bg-white px-2 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
            {facility}
          </span>
        ))}
      </div>
    </button>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-20 rounded-md border border-slate-200 px-3 py-2">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 font-semibold text-slate-950">{value}</div>
    </div>
  );
}
