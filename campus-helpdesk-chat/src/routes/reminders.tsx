import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CalendarClock, Plus, Trash2, Check, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScreenHeading } from "@/components/screen-heading";
import { SignInPrompt, useStudentAccount } from "@/components/student-account";
import { pageHead, reminderOptions } from "@/lib/student-data";
import { api } from "@/lib/api";
export const Route = createFileRoute("/reminders")({
  head: () =>
    pageHead("Reminders", "Keep track of student tasks, deadlines and personal reminders."),
  component: Reminders,
});
function Reminders() {
  const { user, profileId } = useStudentAccount();
  const client = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState("Upcoming");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const query = useQuery({ ...reminderOptions(profileId ?? ""), enabled: Boolean(profileId) });
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user || !profileId) return;
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await api("/reminders", {
        method: "POST",
        body: JSON.stringify({
          title: String(form.get("title")).trim(),
          due_at: new Date(String(form.get("due"))).toISOString(),
        }),
      });
      await client.invalidateQueries({ queryKey: ["reminders", profileId] });
      setAdding(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save reminder.");
    }
    setBusy(false);
  }
  async function change(id: string, completed?: boolean) {
    setBusy(true);
    try {
      await api(`/reminders/${id}`, {
        method: completed === undefined ? "DELETE" : "PATCH",
        ...(completed === undefined ? {} : { body: JSON.stringify({ completed }) }),
      });
      await client.invalidateQueries({ queryKey: ["reminders", profileId] });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update reminder.");
    }
    setBusy(false);
  }
  const visible = query.data?.filter(
    (r) => filter === "All" || (filter === "Completed" ? r.completed : !r.completed),
  );
  return (
    <section className="student-screen">
      <ScreenHeading
        title="Reminders"
        subtitle="Make room for what matters."
        action={
          user && (
            <Button onClick={() => setAdding(!adding)}>
              <Plus />
              {adding ? "Cancel" : "Add reminder"}
            </Button>
          )
        }
      />
      {!user ? (
        <SignInPrompt action="save your reminders" />
      ) : (
        <>
          {adding && (
            <form
              className="mb-8 flex flex-wrap items-end gap-4 border-b border-border pb-8"
              onSubmit={submit}
            >
              <label className="field-label flex-1">
                Reminder
                <input
                  name="title"
                  required
                  maxLength={200}
                  className="student-input"
                  placeholder="What’s coming up?"
                />
              </label>
              <label className="field-label">
                Date & time
                <input name="due" type="datetime-local" required className="student-input" />
              </label>
              <Button disabled={busy}>Save reminder</Button>
            </form>
          )}
          <div className="mb-6 flex gap-2">
            {["Upcoming", "Completed", "All"].map((f) => (
              <Button
                key={f}
                variant={filter === f ? "secondary" : "ghost"}
                onClick={() => setFilter(f)}
              >
                {f}
              </Button>
            ))}
          </div>
          {query.isPending ? (
            <p>Loading reminders…</p>
          ) : query.isError ? (
            <p role="alert">
              Could not load reminders.{" "}
              <Button variant="link" onClick={() => query.refetch()}>
                Retry
              </Button>
            </p>
          ) : visible?.length ? (
            <div className="space-y-3">
              {visible.map((r) => (
                <div key={r.id} className="student-item flex items-center gap-4">
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={busy}
                    aria-label={r.completed ? `Reopen ${r.title}` : `Complete ${r.title}`}
                    onClick={() => change(r.id, !r.completed)}
                  >
                    {r.completed ? <Check className="text-primary" /> : <Circle />}
                  </Button>
                  <div className="min-w-0 flex-1">
                    <h2
                      className={`break-words font-semibold ${r.completed ? "line-through text-muted-foreground" : ""}`}
                    >
                      {r.title}
                    </h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(r.due_at).toLocaleString("en-GB")}
                    </p>
                  </div>
                  <Button
                    title="Delete reminder"
                    size="icon"
                    variant="ghost"
                    disabled={busy}
                    aria-label={`Delete ${r.title}`}
                    onClick={() => change(r.id)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <CalendarClock className="size-9 text-primary" />
              <h2>{filter === "Completed" ? "No completed reminders" : "A clear schedule"}</h2>
              <p>
                {filter === "Completed"
                  ? "Completed tasks will appear here."
                  : "Add a reminder for your next deadline or task."}
              </p>
            </div>
          )}
        </>
      )}
      {message && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {message}
        </p>
      )}
    </section>
  );
}
