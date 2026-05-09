import { AlertTriangle, CheckCircle2, Inbox, MapPinned, ShieldCheck, XCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listPendingRestroomSubmissions, type PendingRestroomSubmission } from "@/lib/admin/submissions";

export default async function AdminPage() {
  const queue = await loadQueue();
  const pendingReviewLabel = formatPendingReviewCount(queue.submissions.length);

  return (
    <main className="min-h-screen bg-muted/40 px-4 py-4 text-foreground sm:px-6 sm:py-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Badge variant="outline" className="mb-2 border-emerald-200 bg-emerald-50 text-emerald-800">
              Admin
            </Badge>
            <h1 className="font-heading text-2xl font-medium tracking-tight">Moderation queue</h1>
            <p className="mt-1 text-sm text-muted-foreground">Review highway-first restroom submissions before they appear in traveler search.</p>
          </div>
          <Badge variant="secondary" className="h-7 rounded-lg px-3">
            {pendingReviewLabel}
          </Badge>
        </header>

        <section className="grid gap-3 md:grid-cols-3" aria-label="Queue summary">
          <SummaryCard title="Pending" value={String(queue.submissions.length)} description="Awaiting moderator decision" />
          <SummaryCard title="Storage" value={queue.storageConfigured ? "Live" : "Local"} description={queue.storageConfigured ? "Supabase service role" : "Dev queue fallback"} />
          <SummaryCard title="Verified" value="Stub" description="Approve actions are visual for MVP" />
        </section>

        {!queue.storageConfigured ? (
          <Alert className="border-amber-300 bg-amber-50 text-amber-950">
            <AlertTriangle aria-hidden="true" />
            <AlertTitle>{queue.submissions.length > 0 ? "Local dev queue" : "Storage not configured"}</AlertTitle>
            <AlertDescription className="text-amber-800">
              {queue.submissions.length > 0
                ? "Local submissions are visible here until the server-only Supabase service role key is set."
                : "Add the server-only Supabase service role key to review live submissions."}
            </AlertDescription>
          </Alert>
        ) : null}

        {queue.error ? (
          <Alert variant="destructive">
            <AlertTriangle aria-hidden="true" />
            <AlertTitle>Queue unavailable</AlertTitle>
            <AlertDescription>{queue.error}</AlertDescription>
          </Alert>
        ) : null}

        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Pending submissions</CardTitle>
            <CardDescription>Newest reports first</CardDescription>
          </CardHeader>
          <CardContent>
            {queue.submissions.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Stop</TableHead>
                    <TableHead>Highway</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Flags</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queue.submissions.map((submission) => (
                    <SubmissionRow key={submission.id} submission={submission} />
                  ))}
                </TableBody>
              </Table>
            ) : (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Inbox aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>No pending restroom submissions</EmptyTitle>
                  <EmptyDescription>New crowd reports will appear here after travelers submit highway stops.</EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Badge variant="outline">{queue.storageConfigured ? "Live storage" : "Local queue"}</Badge>
                </EmptyContent>
              </Empty>
            )}
          </CardContent>
        </Card>
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
    <TableRow>
      <TableCell>
        <div className="font-medium text-foreground">{submission.name}</div>
        <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <MapPinned className="size-3" aria-hidden="true" />
          {submission.latitude.toFixed(4)}, {submission.longitude.toFixed(4)}
        </div>
      </TableCell>
      <TableCell>
        <div className="text-foreground">{submission.highwayName}</div>
        {submission.routeContext ? <div className="mt-1 text-xs text-muted-foreground">{submission.routeContext}</div> : null}
      </TableCell>
      <TableCell>
        <Badge variant="secondary">{formatCategory(submission.category)}</Badge>
      </TableCell>
      <TableCell>
        <div className="flex max-w-sm flex-wrap gap-1.5">{formatFlags(submission).map((flag) => flag)}</div>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <Button type="button" title="Approve" aria-label="Approve" variant="outline" size="icon-sm" className="text-emerald-700 hover:bg-emerald-50">
            <CheckCircle2 aria-hidden="true" />
          </Button>
          <Button type="button" title="Verify" aria-label="Verify" variant="outline" size="icon-sm" className="text-sky-700 hover:bg-sky-50">
            <ShieldCheck aria-hidden="true" />
          </Button>
          <Button type="button" title="Reject" aria-label="Reject" variant="outline" size="icon-sm" className="text-rose-700 hover:bg-rose-50">
            <XCircle aria-hidden="true" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function SummaryCard({ title, value, description }: { title: string; value: string; description: string }) {
  return (
    <Card size="sm" className="rounded-lg">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardAction>
          <Badge variant="outline">{value}</Badge>
        </CardAction>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function formatCategory(category: string): string {
  return category
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatFlags(submission: PendingRestroomSubmission) {
  const flags = [
    submission.freeAccess ? "Free" : "Customer access",
    submission.womenFriendly ? "Women-friendly" : "Unverified women access",
    submission.accessible ? "Accessible" : "Access unknown",
  ];

  if (submission.cleanlinessRating) {
    flags.push(`${submission.cleanlinessRating}/5 clean`);
  }

  return flags.map((flag) => (
    <Badge key={flag} variant="outline">
      {flag}
    </Badge>
  ));
}

function formatPendingReviewCount(count: number): string {
  return count === 1 ? "1 pending review" : `${count} pending reviews`;
}
