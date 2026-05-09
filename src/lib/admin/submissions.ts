import { createClient } from "@supabase/supabase-js";

export type PendingRestroomSubmission = {
  id: string;
  name: string;
  category: string;
  highwayName: string;
  routeContext: string | null;
  latitude: number;
  longitude: number;
  freeAccess: boolean;
  womenFriendly: boolean;
  accessible: boolean;
  cleanlinessRating: number | null;
  safetyNotes: string | null;
  googlePlaceId: string | null;
  status: "pending";
  createdAt: string;
};

export type PendingSubmissionQueue = {
  storageConfigured: boolean;
  submissions: PendingRestroomSubmission[];
};

type PendingSubmissionRow = {
  id: string;
  name: string;
  category: string;
  highway_name: string;
  route_context: string | null;
  latitude: number;
  longitude: number;
  free_access: boolean;
  women_friendly: boolean;
  accessible: boolean;
  cleanliness_rating: number | null;
  safety_notes: string | null;
  google_place_id: string | null;
  created_at: string;
};

const pendingSubmissionColumns = [
  "id",
  "name",
  "category",
  "highway_name",
  "route_context",
  "latitude",
  "longitude",
  "free_access",
  "women_friendly",
  "accessible",
  "cleanliness_rating",
  "safety_notes",
  "google_place_id",
  "created_at",
].join(",");

export async function listPendingRestroomSubmissions(): Promise<PendingSubmissionQueue> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return { storageConfigured: false, submissions: [] };
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase
    .from("restroom_submissions")
    .select(pendingSubmissionColumns)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error("Pending restroom submissions could not be loaded.");
  }

  return {
    storageConfigured: true,
    submissions: ((data ?? []) as unknown as PendingSubmissionRow[]).map(toPendingSubmission),
  };
}

function toPendingSubmission(row: PendingSubmissionRow): PendingRestroomSubmission {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    highwayName: row.highway_name,
    routeContext: row.route_context,
    latitude: row.latitude,
    longitude: row.longitude,
    freeAccess: row.free_access,
    womenFriendly: row.women_friendly,
    accessible: row.accessible,
    cleanlinessRating: row.cleanliness_rating,
    safetyNotes: row.safety_notes,
    googlePlaceId: row.google_place_id,
    status: "pending",
    createdAt: row.created_at,
  };
}