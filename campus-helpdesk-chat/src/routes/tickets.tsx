import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Ticket, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScreenHeading } from "@/components/screen-heading";
import { SignInPrompt, useStudentAccount } from "@/components/student-account";
import { pageHead, ticketOptions } from "@/lib/student-data";
import { api } from "@/lib/api";
export const Route = createFileRoute("/tickets")({
  head: () =>
    pageHead("Tickets & requests", "Submit and track your campus complaints and requests."),
  component: Tickets,
});
function Tickets() {
  const { user, profileId } = useStudentAccount();
  const client = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [kind, setKind] = useState<"Complaint" | "Request">("Complaint");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const query = useQuery({ ...ticketOptions(profileId ?? ""), enabled: Boolean(profileId) });
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user || !profileId) return;
    setBusy(true);
    setMessage("");
    const form = new FormData(e.currentTarget);
    try {
      await api("/tickets", {
        method: "POST",
        body: JSON.stringify({
          kind,
          subject: String(form.get("subject")).trim(),
          category: String(form.get("category")),
          description: String(form.get("description")).trim(),
        }),
      });
      await client.invalidateQueries({ queryKey: ["tickets", profileId] });
      setCreating(false);
      setMessage("Your ticket has been submitted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not submit the ticket.");
    }
    setBusy(false);
  }
  const detail = query.data?.find((t) => t.id === selected);
  return (
    <section className="student-screen">
      <ScreenHeading
        title="Tickets & requests"
        subtitle="A little help goes a long way."
        action={
          user && (
            <Button
              onClick={() => {
                setCreating(!creating);
                setSelected(null);
                setMessage("");
              }}
            >
              {creating ? <ArrowLeft /> : <Plus />}
              {creating ? "Back to tickets" : "New ticket"}
            </Button>
          )
        }
      />
      {!user ? (
        <SignInPrompt action="submit and track your tickets" />
      ) : creating ? (
        <form className="max-w-2xl space-y-5" onSubmit={submit}>
          <div className="flex gap-2">
            {(["Complaint", "Request"] as const).map((k) => (
              <Button
                type="button"
                key={k}
                variant={kind === k ? "default" : "outline"}
                onClick={() => setKind(k)}
              >
                {k}
              </Button>
            ))}
          </div>
          <label className="field-label">
            Subject
            <input name="subject" className="student-input" required maxLength={160} />
          </label>
          <label className="field-label">
            Category
            <select name="category" className="student-input">
              <option>General</option>
              <option>Academics</option>
              <option>Facilities</option>
              <option>Hostel</option>
              <option>Finance</option>
            </select>
          </label>
          <label className="field-label">
            Details
            <textarea
              name="description"
              className="student-input min-h-36"
              required
              maxLength={5000}
            />
          </label>
          <Button disabled={busy}>{busy ? "Submitting…" : "Submit ticket"}</Button>
        </form>
      ) : detail ? (
        <div className="max-w-2xl">
          <Button variant="ghost" onClick={() => setSelected(null)}>
            <ArrowLeft />
            All tickets
          </Button>
          <div className="mt-6 border-b border-border pb-5">
            <span className="text-xs font-semibold text-primary">
              {detail.kind} · {detail.status}
            </span>
            <h2 className="mt-3 text-2xl font-bold">{detail.subject}</h2>
            <p className="mt-3 text-xs text-muted-foreground">
              {detail.category} · #{detail.id.slice(0, 8)}
            </p>
          </div>
          <p className="mt-6 whitespace-pre-wrap leading-relaxed">{detail.description}</p>
        </div>
      ) : query.isPending ? (
        <p>Loading tickets…</p>
      ) : query.isError ? (
        <p role="alert">
          Could not load tickets.{" "}
          <Button variant="link" onClick={() => query.refetch()}>
            Retry
          </Button>
        </p>
      ) : query.data?.length ? (
        <div className="space-y-3">
          {query.data.map((t) => (
            <Button
              key={t.id}
              variant="ghost"
              onClick={() => setSelected(t.id)}
              className="student-item h-auto w-full justify-between gap-4 text-left"
            >
              <span className="min-w-0 whitespace-normal">
                <span className="block text-xs text-muted-foreground">
                  {t.kind} · {t.category} · #{t.id.slice(0, 8)}
                </span>
                <span className="mt-2 block font-semibold">{t.subject}</span>
              </span>
              <span className="shrink-0 rounded-md bg-accent px-3 py-1 text-xs text-primary">
                {t.status}
              </span>
            </Button>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <Ticket className="size-9 text-primary" />
          <h2>No tickets yet</h2>
          <p>Your complaints and requests will appear here.</p>
          <Button onClick={() => setCreating(true)}>
            <Plus />
            Create a ticket
          </Button>
        </div>
      )}
      {message && (
        <p role="status" className="mt-5 text-sm text-primary">
          {message}
        </p>
      )}
    </section>
  );
}
