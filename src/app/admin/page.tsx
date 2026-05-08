import { CheckCircle2, ShieldCheck, XCircle } from "lucide-react";

import { sampleHighwayStops } from "@/lib/restrooms/sample-stops";

export default function AdminPage() {
  return (
    <main className="min-h-screen bg-slate-100 px-6 py-6 text-slate-950">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase text-teal-700">Moderation</p>
            <h1 className="mt-1 text-2xl font-semibold">Highway restroom queue</h1>
          </div>
          <div className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
            {sampleHighwayStops.length} submissions
          </div>
        </div>

        <div className="overflow-hidden rounded-md border border-slate-300 bg-white">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold">Stop</th>
                <th className="px-4 py-3 font-semibold">Highway</th>
                <th className="px-4 py-3 font-semibold">Source</th>
                <th className="px-4 py-3 font-semibold">Confidence</th>
                <th className="px-4 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {sampleHighwayStops.map((stop) => (
                <tr key={stop.id} className="border-t border-slate-200">
                  <td className="px-4 py-3 font-medium text-slate-950">{stop.name}</td>
                  <td className="px-4 py-3 text-slate-600">{stop.highway}</td>
                  <td className="px-4 py-3 text-slate-600">{stop.source}</td>
                  <td className="px-4 py-3 text-slate-600">{Math.round(stop.confidence * 100)}%</td>
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
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
