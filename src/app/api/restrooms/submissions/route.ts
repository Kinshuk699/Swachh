import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { z } from "zod";

import { addLocalPendingRestroomSubmission } from "@/lib/admin/submissions";

const submissionSchema = z.object({
  name: z.string().trim().min(2).max(120),
  category: z.enum(["food_plaza", "fuel_station", "public_restroom", "restaurant_proxy", "toll_plaza"]),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  highwayName: z.string().trim().min(2).max(120),
  routeContext: z.string().trim().max(240).optional(),
  freeAccess: z.boolean().default(false),
  cleanlinessRating: z.number().int().min(1).max(5).optional(),
  safetyNotes: z.string().trim().max(500).optional(),
  womenFriendly: z.boolean().default(false),
  accessible: z.boolean().default(false),
  googlePlaceId: z.string().trim().max(255).optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = submissionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Highway restroom submission is incomplete." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const submission = parsed.data;

  if (shouldUseLocalModerationQueue()) {
    addLocalPendingRestroomSubmission({
      name: submission.name,
      category: submission.category,
      latitude: submission.latitude,
      longitude: submission.longitude,
      highwayName: submission.highwayName,
      routeContext: submission.routeContext ?? null,
      freeAccess: submission.freeAccess,
      cleanlinessRating: submission.cleanlinessRating ?? null,
      safetyNotes: submission.safetyNotes ?? null,
      womenFriendly: submission.womenFriendly,
      accessible: submission.accessible,
      googlePlaceId: submission.googlePlaceId ?? null,
    });

    return NextResponse.json({ ok: true, status: "pending", storage: "local_dev" }, { status: 201 });
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: "Submission storage is not configured." }, { status: 503 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { error } = await supabase.from("restroom_submissions").insert({
    name: submission.name,
    category: submission.category,
    latitude: submission.latitude,
    longitude: submission.longitude,
    highway_name: submission.highwayName,
    route_context: submission.routeContext,
    free_access: submission.freeAccess,
    cleanliness_rating: submission.cleanlinessRating,
    safety_notes: submission.safetyNotes,
    women_friendly: submission.womenFriendly,
    accessible: submission.accessible,
    google_place_id: submission.googlePlaceId,
    status: "pending",
  });

  if (error) {
    return NextResponse.json({ error: "Submission could not be saved." }, { status: 502 });
  }

  return NextResponse.json({ ok: true, status: "pending" }, { status: 201 });
}

function shouldUseLocalModerationQueue(): boolean {
  return process.env.NODE_ENV !== "production" && !process.env.SUPABASE_SERVICE_ROLE_KEY;
}