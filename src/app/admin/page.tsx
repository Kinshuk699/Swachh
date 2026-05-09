import { CheckCircle2, ShieldCheck, XCircle } from "lucide-react";

import { listPendingRestroomSubmissions, type PendingRestroomSubmission } from "@/lib/admin/submissions";

export default async function AdminPage() {
  const queue = await loadQueue();

  return (
    <main className="min-h-screen bg-slate-100 px-6 py-6 text-slate-950">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase text-teal-700">Moderation</p>
            <h1 className="mt-1 text-2xl font-semibold">Pending submissions</h1>
          </div>
          <div className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
            {queue.submissions.length} pending
          </div>
        </div>

        {!queue.storageConfigured ? (
          <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            Admin queue storage is not configured. Add the server-only Supabase service role key to review live submissions.
          </div>
        ) : null}

        {queue.error ? (
          <div className="mb-4 rounded-md border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-950">{queue.error}</div>
        ) : null}

        <div className="overflow-hidden rounded-md border border-slate-300 bg-white">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold">Stop</th>
                <th className="px-4 py-3 font-semibold">Highway</th>
                <th className="px-4 py-3 font-semibold">Category</th>
                <th className="px-4 py-3 font-semibold">Flags</th>
                <th className="px-4 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {queue.submissions.length > 0 ? (
                queue.submissions.map((submission) => <SubmissionRow key={submission.id} submission={submission} />)
              ) : (
                <tr className="border-t border-slate-200">
                  <td className="px-4 py-8 text-center text-slate-600" colSpan={5}>
                    No pending restroom submissions.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

async function loadQueue() {
  try {
    return { ...(await listPendingRestroomSubmissions()), error: "" };
  } catch {
    return { storageConfigured: true, submissions: [], error: "Pending submissions could not be loaded." };
  }
}

function SubmissionRow({ submission }: { submission: PendingRestroomSubmission }) {
  return (
    <tr className="border-t border-slate-200">
      <td className="px-4 py-3">
        <div className="font-medium text-slate-950">{submission.name}</div>
        <div className="mt-1 text-xs text-slate-500">
          {submission.latitude.toFixed(4)}, {submission.longitude.toFixed(4)}
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="text-slate-700">{submission.highwayName}</div>
        {submission.routeContext ? <div className="mt-1 text-xs text-slate-500">{submission.routeContext}</div> : null}
      </td>
      <td className="px-4 py-3 text-slate-600">{formatCategory(submission.category)}</td>
      <td className="px-4 py-3 text-slate-600">{formatFlags(submission)}</td>
      <td className="px-4 py-3">
        <div className="flex gap-2">
          <button type="button" title="Approve" aria-label="Approve" className="rounded-md border border-teal-300 p-2 text-teal-700 hover:bg-teal-50">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button" title="Verify" aria-label="Verify" className="rounded-md border border-sky-300 p-2 text-sky-700 hover:bg-sky-50">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button" title="Reject" aria-label="Reject" className="rounded-md border border-rose-300 p-2 text-rose-700 hover:bg-rose-50">
            <XCircle className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function formatCategory(category: string): string {
  return category
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatFlags(submission: PendingRestroomSubmission): string {
  const flags = [
    submission.freeAccess ? "Free" : "Customer access",
    submission.womenFriendly ? "Women-friendly" : "Unverified women access",
    submission.accessible ? "Accessible" : "Access unknown",
  ];

  if (submission.cleanlinessRating) {
    flags.push(`${submission.cleanlinessRating}/5 clean`);
  }

  return flags.join(" / ");
}
