import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Search, Eye, X } from "lucide-react";
import { PageHeader, inputCls } from "@/components/AdminSidebar";
import { api } from "@/lib/api";
import { onAuthStateChanged } from "firebase/auth";
import { adminAuth } from "@/lib/firebase";

export const Route = createFileRoute("/tickets")({
  head: () => ({
    meta: [
      { title: "Ticket Management — IIT KGP Helpdesk" },
      { name: "description", content: "Track and resolve student support tickets." },
      { property: "og:title", content: "Ticket Management — IIT KGP Helpdesk" },
      { property: "og:description", content: "Track and resolve student support tickets." },
    ],
  }),
  component: Tickets,
});

type Status = "Open" | "In progress" | "Resolved";
const statuses: Status[] = ["Open", "In progress", "Resolved"];
type Ticket = {
  id: string;
  subject: string;
  description: string;
  category: string;
  student_email: string;
  student_name: string;
  kind: string;
  status: Status;
  created_at: string;
};

const statusCls: Record<Status, string> = {
  Open: "bg-accent text-accent-foreground",
  "In progress": "bg-info/15 text-info",
  Resolved: "bg-success/15 text-success",
};

function Tickets() {
  const [list, setList] = useState<Ticket[]>([]);
  const [error, setError] = useState("");
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  useEffect(
    () =>
      onAuthStateChanged(adminAuth, (user) => {
        if (!user) {
          setList([]);
          return;
        }
        void api<Ticket[]>("/admin/tickets")
          .then(setList)
          .catch((e: unknown) =>
            setError(e instanceof Error ? e.message : "Could not load tickets."),
          );
      }),
    [],
  );
  const [filter, setFilter] = useState<"All" | Status>("All");
  const [q, setQ] = useState("");
  const shown = list.filter(
    (t) =>
      (filter === "All" || t.status === filter) &&
      (t.subject + t.student_email + t.student_name + t.id).toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <>
      <PageHeader
        badge="Tickets"
        title="Ticket Management"
        sub="Review, assign and resolve student requests."
      />
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        {statuses.map((s) => (
          <div key={s} className="panel p-5">
            <div className="text-sm text-muted-foreground">{s}</div>
            <div className="font-display text-3xl font-bold">
              {list.filter((t) => t.status === s).length}
            </div>
          </div>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="panel mt-6 overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b p-4">
          <div className="relative max-w-xs flex-1">
            <Search className="absolute top-3 left-3 h-4 w-4 text-muted-foreground" />
            <input
              className={`${inputCls} pl-9`}
              placeholder="Search tickets..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="flex gap-1">
            {(["All", ...statuses] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium ${filter === f ? "bg-gold text-primary-foreground" : "hover:bg-muted"}`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted text-left text-muted-foreground">
              <tr>
                {["ID", "Subject", "Student", "Type", "Date", "Details", "Status"].map((h) => (
                  <th key={h} className="px-4 py-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {shown.map((t) => (
                <tr key={t.id} className="hover:bg-muted/50">
                  <td className="px-4 py-3 font-mono text-xs">{t.id.slice(-8)}</td>
                  <td className="px-4 py-3 font-medium">
                    <button
                      type="button"
                      className="max-w-72 truncate text-left hover:text-primary hover:underline"
                      onClick={() => setSelectedTicket(t)}
                      title="Open full ticket details"
                    >
                      {t.subject}
                    </button>
                  </td>
                  <td className="px-4 py-3">{t.student_name || t.student_email || "Student"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{t.kind}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(t.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-primary hover:bg-accent"
                      onClick={() => setSelectedTicket(t)}
                    >
                      <Eye className="h-4 w-4" /> Open
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={t.status}
                      onChange={(e) => {
                        const status = e.target.value as Status;
                        void api(`/admin/tickets/${t.id}`, {
                          method: "PATCH",
                          body: JSON.stringify({ status }),
                        })
                          .then(() =>
                            setList(list.map((x) => (x.id === t.id ? { ...x, status } : x))),
                          )
                          .catch((err: unknown) =>
                            setError(
                              err instanceof Error ? err.message : "Could not update ticket.",
                            ),
                          );
                      }}
                      className={`rounded-full border-0 px-3 py-1 text-xs font-semibold outline-none ${statusCls[t.status]}`}
                    >
                      {statuses.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    No tickets found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {selectedTicket && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedTicket(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="ticket-detail-title"
            className="panel max-h-[90vh] w-full max-w-2xl overflow-y-auto p-5 shadow-2xl sm:p-7"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Ticket · {selectedTicket.id}
                </p>
                <h2 id="ticket-detail-title" className="mt-2 font-display text-2xl font-bold">
                  {selectedTicket.subject}
                </h2>
              </div>
              <button
                type="button"
                className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
                aria-label="Close ticket details"
                onClick={() => setSelectedTicket(null)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-5 grid gap-4 rounded-2xl bg-muted/50 p-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted-foreground">Student</p>
                <p className="font-semibold">{selectedTicket.student_name || "Student"}</p>
                <p className="text-sm text-muted-foreground">
                  {selectedTicket.student_email || "No email provided"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Submitted</p>
                <p className="font-semibold">
                  {new Date(selectedTicket.created_at).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Type</p>
                <p className="font-semibold">{selectedTicket.kind}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Category</p>
                <p className="font-semibold">{selectedTicket.category || "General"}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground">Status</p>
                <span
                  className={`mt-1 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusCls[selectedTicket.status]}`}
                >
                  {selectedTicket.status}
                </span>
              </div>
            </div>
            <div className="mt-5">
              <h3 className="font-semibold">Description</h3>
              <p className="mt-2 whitespace-pre-wrap break-words rounded-2xl border border-border bg-card/70 p-4 text-sm leading-6">
                {selectedTicket.description || "No description was provided."}
              </p>
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <select
                aria-label="Update ticket status"
                value={selectedTicket.status}
                onChange={(event) => {
                  const status = event.target.value as Status;
                  void api<Ticket>(`/admin/tickets/${selectedTicket.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({ status }),
                  })
                    .then((updated) => {
                      setList((items) =>
                        items.map((item) => (item.id === updated.id ? updated : item)),
                      );
                      setSelectedTicket(updated);
                    })
                    .catch((err: unknown) =>
                      setError(err instanceof Error ? err.message : "Could not update ticket."),
                    );
                }}
                className={`rounded-full border-0 px-3 py-2 text-sm font-semibold outline-none ${statusCls[selectedTicket.status]}`}
              >
                {statuses.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
              <button
                type="button"
                className="rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-muted"
                onClick={() => setSelectedTicket(null)}
              >
                Close
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
