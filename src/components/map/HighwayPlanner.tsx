"use client";

import {
  Accessibility,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Coffee,
  Fuel,
  MapPinned,
  MessageCircle,
  Navigation,
  Plus,
  Route,
  Search,
  ShieldCheck,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { buildRouteSearchResponse, type RouteSearchResponse } from "@/lib/routes/route-search";
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

const submissionCategories = [
  { value: "fuel_station", label: "Fuel station" },
  { value: "food_plaza", label: "Food plaza" },
  { value: "toll_plaza", label: "Toll plaza" },
  { value: "public_restroom", label: "Public restroom" },
  { value: "restaurant_proxy", label: "Restaurant" },
] as const;

type SubmissionCategory = (typeof submissionCategories)[number]["value"];

export function HighwayPlanner() {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [highwayName, setHighwayName] = useState("");
  const [searched, setSearched] = useState(true);
  const [selectedStopId, setSelectedStopId] = useState("mumbai-pune-food-plaza");
  const [plannedResponse, setPlannedResponse] = useState<RouteSearchResponse | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);
  const [plannerError, setPlannerError] = useState("");
  const [showSubmissionForm, setShowSubmissionForm] = useState(false);
  const [submissionName, setSubmissionName] = useState("");
  const [submissionCategory, setSubmissionCategory] = useState<SubmissionCategory>("fuel_station");
  const [submissionLatitude, setSubmissionLatitude] = useState("");
  const [submissionLongitude, setSubmissionLongitude] = useState("");
  const [submissionHighwayName, setSubmissionHighwayName] = useState("Mumbai-Pune Expressway");
  const [submissionMessage, setSubmissionMessage] = useState("");
  const [isSubmittingStop, setIsSubmittingStop] = useState(false);

  const searchInput = useMemo(
    () => ({
      origin,
      destination,
      highwayName,
      isInsideCity: true,
      distanceToHighwayMeters: 8_500,
    }),
    [destination, highwayName, origin],
  );
  const curatedResponse = useMemo(() => buildRouteSearchResponse(searchInput), [searchInput]);
  const response = plannedResponse ?? curatedResponse;

  const stops = searched ? response.stops : [];
  const selectedStop = stops.find((stop) => stop.id === selectedStopId) ?? stops[0];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearched(true);
    setIsPlanning(true);
    setPlannerError("");

    try {
      const apiResponse = await fetch("/api/routes/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(searchInput),
      });

      if (!apiResponse.ok) {
        throw new Error("Route search failed");
      }

      const nextResponse = (await apiResponse.json()) as RouteSearchResponse;
      setPlannedResponse(nextResponse);
      setSelectedStopId(nextResponse.stops[0]?.id ?? "");
    } catch {
      setPlannedResponse(curatedResponse);
      setSelectedStopId(curatedResponse.stops[0]?.id ?? "");
      setPlannerError("Live route unavailable. Showing curated stops.");
    } finally {
      setIsPlanning(false);
    }
  }

  function clearPlannedRoute() {
    setPlannedResponse(null);
    setPlannerError("");
  }

  function openSubmissionForm() {
    setShowSubmissionForm(true);
    setSubmissionMessage("");
    setSubmissionHighwayName(highwayName || selectedStop?.highway || "");
  }

  async function handleStopSubmission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmittingStop(true);
    setSubmissionMessage("");

    try {
      const apiResponse = await fetch("/api/restrooms/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: submissionName,
          category: submissionCategory,
          latitude: Number(submissionLatitude),
          longitude: Number(submissionLongitude),
          highwayName: submissionHighwayName,
        }),
      });

      if (!apiResponse.ok) {
        throw new Error("Submission failed");
      }

      setSubmissionName("");
      setSubmissionLatitude("");
      setSubmissionLongitude("");
      setSubmissionMessage("Submission saved for moderation.");
    } catch {
      setSubmissionMessage("Submission could not be saved.");
    } finally {
      setIsSubmittingStop(false);
    }
  }

  return (
    <main className="min-h-screen bg-muted/40 text-foreground">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[390px_minmax(0,1fr)]">
        <aside className="order-2 flex min-h-screen flex-col border-r bg-background lg:order-1">
          <header className="flex items-start justify-between gap-3 border-b px-4 py-4">
            <div>
              <Badge variant="outline" className="mb-2 border-emerald-200 bg-emerald-50 text-emerald-800">
                Swachh
              </Badge>
              <h1 className="font-heading text-xl font-medium tracking-tight">Highway restroom stops</h1>
              <p className="mt-1 text-sm text-muted-foreground">India road-trip planning for expressways, toll plazas, fuel stations, and bypasses.</p>
            </div>
            <Button type="button" variant="outline" size="icon" title="WhatsApp" aria-label="WhatsApp">
              <MessageCircle aria-hidden="true" />
            </Button>
          </header>

          <div className="space-y-4 border-b px-4 py-4">
            <Card size="sm" className="rounded-lg">
              <CardHeader>
                <CardTitle>Plan a highway trip</CardTitle>
                <CardDescription>From, to, or a known corridor. The atlas stays visible while you decide.</CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={handleSubmit}>
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="origin">From</FieldLabel>
                      <Input
                        id="origin"
                        value={origin}
                        onChange={(event) => {
                          setOrigin(event.target.value);
                          clearPlannedRoute();
                        }}
                        placeholder="City or current area"
                      />
                    </Field>

                    <Field>
                      <FieldLabel htmlFor="destination">To</FieldLabel>
                      <Input
                        id="destination"
                        value={destination}
                        onChange={(event) => {
                          setDestination(event.target.value);
                          clearPlannedRoute();
                        }}
                        placeholder="Where are you heading?"
                      />
                    </Field>

                    <Field>
                      <FieldLabel htmlFor="highway">Highway or corridor</FieldLabel>
                      <Input
                        id="highway"
                        value={highwayName}
                        onChange={(event) => {
                          setHighwayName(event.target.value);
                          clearPlannedRoute();
                        }}
                        placeholder="NH48, expressway, bypass"
                      />
                    </Field>
                  </FieldGroup>

                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <Button type="submit" disabled={isPlanning}>
                      <Search data-icon="inline-start" aria-hidden="true" />
                      {isPlanning ? "Finding stops" : "Find clean stops"}
                    </Button>
                    <Button type="button" variant="outline" size="icon" title="Submit missing stop" aria-label="Submit missing stop" onClick={openSubmissionForm}>
                      <Plus aria-hidden="true" />
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            {response.route ? (
              <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950" aria-live="polite">
                <Route aria-hidden="true" />
                <AlertTitle>Live route</AlertTitle>
                <AlertDescription className="flex gap-3 text-emerald-800">
                  <span>{formatDistance(response.route.distanceMeters)}</span>
                  <span>{formatDuration(response.route.durationSeconds)}</span>
                </AlertDescription>
              </Alert>
            ) : null}

            {plannerError ? (
              <Alert className="border-amber-300 bg-amber-50 text-amber-950">
                <AlertTriangle aria-hidden="true" />
                <AlertTitle>Curated fallback</AlertTitle>
                <AlertDescription className="text-amber-800">{plannerError}</AlertDescription>
              </Alert>
            ) : null}
          </div>

          <section className="border-b px-4 py-3" aria-label="Filters">
            <div className="flex flex-wrap gap-2">
              {filterOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <Button key={option.label} type="button" variant="outline" size="sm" className="bg-background">
                    <Icon data-icon="inline-start" aria-hidden="true" />
                    {option.label}
                  </Button>
                );
              })}
            </div>
          </section>

          <section className="min-h-0 flex-1 overflow-y-auto px-4 py-4" aria-label="Restroom stops">
            {response.intent.requiresTripContext ? (
              <Alert className="mb-3 border-amber-300 bg-amber-50 text-amber-950">
                <Navigation aria-hidden="true" />
                <AlertTitle>Where are you heading?</AlertTitle>
                <AlertDescription className="text-amber-800">Add a destination or highway to rank these atlas stops for your route.</AlertDescription>
              </Alert>
            ) : null}

            {stops.length > 0 ? (
              <div className="space-y-3">
                {stops.map((stop) => (
                  <StopCard key={stop.id} stop={stop} selected={selectedStop?.id === stop.id} onSelect={() => setSelectedStopId(stop.id)} />
                ))}
              </div>
            ) : null}
          </section>
        </aside>

        <section className="order-1 grid min-h-[560px] grid-rows-[1fr_auto] bg-muted lg:order-2 lg:min-h-[640px]">
          <MapCanvas
            stops={stops}
            selectedStopId={selectedStop?.id ?? ""}
            routePolyline={response.route?.encodedPolyline}
            onSelectStop={setSelectedStopId}
          />
          <div className="border-t bg-background px-4 py-4 shadow-[0_-8px_30px_rgba(15,23,42,0.08)]">
            <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <Badge variant="outline" className="mb-2 border-emerald-200 bg-emerald-50 text-emerald-800">
                  {selectedStop?.highway ?? "Trip context needed"}
                </Badge>
                <h2 className="font-heading text-xl font-medium tracking-tight">{selectedStop?.name ?? "Add destination or highway"}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{selectedStop?.locality ?? "City-only searches stay paused until a route is selected."}</p>
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

      <Sheet open={showSubmissionForm} onOpenChange={setShowSubmissionForm}>
        <SheetContent className="w-[92vw] sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Report a restroom stop</SheetTitle>
            <SheetDescription>New highway stops are held for moderation before appearing publicly.</SheetDescription>
          </SheetHeader>

          <form id="restroom-submission-form" className="min-h-0 flex-1 overflow-y-auto px-4" onSubmit={handleStopSubmission}>
            <FieldSet>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="submission-name">Stop name</FieldLabel>
                  <Input
                    id="submission-name"
                    value={submissionName}
                    onChange={(event) => setSubmissionName(event.target.value)}
                    placeholder="Fuel pump, toll plaza, food court"
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="submission-category">Category</FieldLabel>
                  <Select value={submissionCategory} onValueChange={(value) => setSubmissionCategory(value as SubmissionCategory)}>
                    <SelectTrigger id="submission-category" className="w-full">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {submissionCategories.map((category) => (
                          <SelectItem key={category.value} value={category.value}>
                            {category.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field>
                    <FieldLabel htmlFor="submission-latitude">Latitude</FieldLabel>
                    <Input
                      id="submission-latitude"
                      inputMode="decimal"
                      value={submissionLatitude}
                      onChange={(event) => setSubmissionLatitude(event.target.value)}
                      placeholder="18.765"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="submission-longitude">Longitude</FieldLabel>
                    <Input
                      id="submission-longitude"
                      inputMode="decimal"
                      value={submissionLongitude}
                      onChange={(event) => setSubmissionLongitude(event.target.value)}
                      placeholder="73.377"
                    />
                  </Field>
                </div>

                <Field>
                  <FieldLabel htmlFor="submission-highway">Highway</FieldLabel>
                  <Input
                    id="submission-highway"
                    value={submissionHighwayName}
                    onChange={(event) => setSubmissionHighwayName(event.target.value)}
                    placeholder="NH48, expressway, bypass"
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="submission-notes">Notes</FieldLabel>
                  <Textarea id="submission-notes" placeholder="Lighting, attendant, women-friendly access, paid access" />
                  <FieldDescription>Lighting, attendant, signage, payment, or access details.</FieldDescription>
                </Field>
              </FieldGroup>
            </FieldSet>
          </form>

          {submissionMessage ? (
            <div className="px-4">
              <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950">
                <CheckCircle2 aria-hidden="true" />
                <AlertTitle>Submission update</AlertTitle>
                <AlertDescription className="text-emerald-800">{submissionMessage}</AlertDescription>
              </Alert>
            </div>
          ) : null}

          <SheetFooter>
            <Button type="submit" form="restroom-submission-form" disabled={isSubmittingStop}>
              {isSubmittingStop ? "Sending" : "Send for review"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </main>
  );
}

function StopCard({ stop, selected, onSelect }: { stop: HighwayStop; selected: boolean; onSelect: () => void }) {
  return (
    <Card
      role="button"
      tabIndex={0}
      size="sm"
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      data-selected={selected}
      className="w-full cursor-pointer rounded-lg text-left transition hover:bg-muted/50 data-[selected=true]:border-emerald-500 data-[selected=true]:bg-emerald-50 data-[selected=true]:ring-emerald-600/30"
    >
      <CardHeader>
        <div>
          <CardTitle>{stop.name}</CardTitle>
          <CardDescription className="mt-1">{stop.highway}</CardDescription>
        </div>
        <CardAction>
          <Badge variant="secondary">{stop.detourMinutes}m</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <MapPinned className="size-4 text-emerald-700" aria-hidden="true" />
          <span>{stop.locality}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={stop.openNow ? "default" : "outline"} className={stop.openNow ? "bg-emerald-700 text-white" : ""}>
            {stop.openNow ? "Open" : "Check"}
          </Badge>
          <Badge variant="outline">{stop.priceLabel}</Badge>
          <Badge variant="outline">{formatConfidence(stop.confidence)}</Badge>
        </div>
        <Separator />
        <div className="flex flex-wrap gap-2">
          {stop.facilities.slice(0, 3).map((facility) => (
            <Badge key={facility} variant="secondary">
              {facility}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-20 rounded-lg border bg-card px-3 py-2">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 font-medium text-foreground">{value}</div>
    </div>
  );
}

function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}% verified`;
}

function formatDistance(distanceMeters: number): string {
  return `${Math.round(distanceMeters / 1000)} km`;
}

function formatDuration(durationSeconds: number): string {
  const hours = Math.floor(durationSeconds / 3600);
  const minutes = Math.round((durationSeconds % 3600) / 60);

  if (hours === 0) {
    return `${minutes} min`;
  }

  return `${hours}h ${minutes}m`;
}
