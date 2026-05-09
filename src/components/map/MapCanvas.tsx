"use client";

import { CheckCircle2, Coffee, Fuel, MapPinned, ShieldCheck } from "lucide-react";

import { sampleHighwayCorridors } from "@/lib/highways/sample-corridors";
import type { HighwayStop } from "@/lib/restrooms/sample-stops";

type MapCanvasProps = {
  stops: HighwayStop[];
  selectedStopId: string;
  routePolyline?: string;
  onSelectStop: (stopId: string) => void;
};

const atlasStopPositions: Record<string, { left: string; top: string }> = {
  "mumbai-pune-food-plaza": { left: "41%", top: "61%" },
  "nh48-toll-plaza": { left: "39%", top: "46%" },
  "city-edge-fuel-station": { left: "44%", top: "64%" },
  "dense-city-mall": { left: "36%", top: "57%" },
};

const fallbackAtlasPositions = [
  { left: "38%", top: "36%" },
  { left: "48%", top: "48%" },
  { left: "60%", top: "58%" },
  { left: "72%", top: "44%" },
];

const indiaMainlandOutlinePath =
  "M151 22 C164 28 175 34 186 45 C196 56 199 68 210 75 C222 83 235 82 244 94 C253 105 257 119 270 126 C283 133 292 144 297 159 C302 174 297 190 284 198 C272 206 257 203 246 211 C235 218 230 231 234 245 C239 263 230 279 216 290 C210 342 193 369 172 407 C161 421 143 420 132 405 C122 391 121 370 114 351 C108 333 96 320 87 306 C76 289 68 273 73 254 C78 237 69 223 54 212 C39 201 31 188 36 172 C41 157 59 154 70 143 C81 132 84 118 85 103 C86 89 75 79 80 66 C86 52 104 54 118 47 C132 40 139 27 151 22 Z";

const indiaNortheastOutlinePath =
  "M270 128 C287 121 309 126 325 136 C344 151 366 169 360 190 C353 211 329 212 310 202 C294 194 282 178 263 173 C250 170 241 162 244 151 C248 140 258 133 270 128 Z";

export function MapCanvas({ stops, selectedStopId, routePolyline, onSelectStop }: MapCanvasProps) {
  return (
    <div className="relative h-full min-h-[420px] overflow-hidden bg-[#08090a] text-stone-100">
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(0deg,rgba(255,255,255,0.045)_1px,transparent_1px)] bg-[size:44px_44px]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_24%,rgba(255,178,63,0.16),transparent_30%),radial-gradient(circle_at_78%_72%,rgba(100,211,154,0.14),transparent_34%)]" />
      <svg
        aria-label="Swachh national highway atlas"
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        viewBox="0 0 390 430"
      >
        <defs>
          <clipPath id="india-atlas-clip">
            <path d={indiaMainlandOutlinePath} />
            <path d={indiaNortheastOutlinePath} />
          </clipPath>
        </defs>
        <path
          d={indiaMainlandOutlinePath}
          data-testid="india-mainland-outline"
          fill="rgba(255,255,255,0.07)"
          stroke="rgba(255,255,255,0.34)"
          strokeWidth="3"
        />
        <path
          d={indiaNortheastOutlinePath}
          data-testid="india-northeast-outline"
          fill="rgba(255,255,255,0.07)"
          stroke="rgba(255,255,255,0.34)"
          strokeWidth="3"
        />
        <path
          d="M238 151 C248 149 257 151 267 156"
          fill="none"
          stroke="rgba(255,255,255,0.12)"
          strokeLinecap="round"
          strokeWidth="2"
        />
        <g clipPath="url(#india-atlas-clip)">
          {sampleHighwayCorridors.map((corridor) => (
            <g key={corridor.id}>
              <path
                d={corridor.path}
                fill="none"
                stroke={corridor.color}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeOpacity="0.24"
                strokeWidth="7"
              />
              <path
                d={corridor.path}
                fill="none"
                stroke={corridor.color}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeOpacity="0.86"
                strokeWidth={corridor.coverageStatus === "strong" ? 3 : 2.5}
              />
            </g>
          ))}
        </g>
        {sampleHighwayCorridors.map((corridor) => (
          <g key={`${corridor.id}-label`}>
            <text fill="#f7f3e8" fontSize="8" fontWeight="600" x={corridor.label.x} y={corridor.label.y}>
              {corridor.name}
            </text>
          </g>
        ))}
        {routePolyline ? (
          <path
            aria-label="Planned route corridor"
            d="M116 254 C145 267 175 258 226 250"
            fill="none"
            role="img"
            stroke="#fff4d6"
            strokeDasharray="8 8"
            strokeLinecap="round"
            strokeWidth="7"
            clipPath="url(#india-atlas-clip)"
          />
        ) : null}
      </svg>

      <div className="absolute left-4 top-4 max-w-[min(22rem,calc(100%-2rem))] rounded-lg border border-white/10 bg-black/45 px-4 py-3 shadow-[0_18px_50px_rgba(0,0,0,0.34)] backdrop-blur-md">
        <div className="flex items-center gap-2 text-sm font-semibold text-stone-50">
          <MapPinned className="size-4 text-amber-300" aria-hidden="true" />
          National highway atlas
        </div>
        <p className="mt-1 text-xs leading-5 text-stone-300">Seeded restroom stops and priority corridors are visible before route search.</p>
      </div>

      <div className="absolute bottom-4 left-4 right-4 flex flex-wrap gap-2 rounded-lg border border-white/10 bg-black/45 p-2 text-xs text-stone-200 shadow-[0_18px_50px_rgba(0,0,0,0.34)] backdrop-blur-md">
        <span className="flex min-h-8 items-center gap-1.5 rounded-md border border-emerald-300/30 bg-emerald-300/10 px-2">
          <ShieldCheck className="size-3.5 text-emerald-300" aria-hidden="true" />
          Women-friendly verified
        </span>
        <span className="flex min-h-8 items-center gap-1.5 rounded-md border border-amber-300/30 bg-amber-300/10 px-2">
          <Coffee className="size-3.5 text-amber-300" aria-hidden="true" />
          Food plaza
        </span>
        <span className="flex min-h-8 items-center gap-1.5 rounded-md border border-cyan-300/30 bg-cyan-300/10 px-2">
          <Fuel className="size-3.5 text-cyan-300" aria-hidden="true" />
          Fuel stop
        </span>
        <span className="flex min-h-8 items-center gap-1.5 rounded-md border border-stone-300/20 bg-stone-100/10 px-2">
          <CheckCircle2 className="size-3.5 text-stone-200" aria-hidden="true" />
          Toll or public restroom
        </span>
      </div>
      {stops.map((stop, index) => {
        const position = atlasStopPositions[stop.id] ?? fallbackAtlasPositions[index % fallbackAtlasPositions.length];
        const selected = selectedStopId === stop.id;

        return (
          <button
            key={stop.id}
            type="button"
            title={stop.name}
            aria-label={stop.name}
            onClick={() => onSelectStop(stop.id)}
            className={`absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border text-white shadow-[0_0_0_6px_rgba(255,255,255,0.05),0_16px_34px_rgba(0,0,0,0.34)] transition duration-200 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:ring-offset-2 focus-visible:ring-offset-black motion-reduce:transition-none ${
              selected
                ? "border-amber-100 bg-amber-400 text-slate-950"
                : "border-white/40 bg-slate-950/80 hover:border-emerald-200 hover:bg-emerald-700"
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
