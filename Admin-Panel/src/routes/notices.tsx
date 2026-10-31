import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Trash2, Pin } from "lucide-react";
import { PageHeader, btnGold, inputCls } from "@/components/AdminSidebar";
import { api } from "@/lib/api";
import { onAuthStateChanged } from "firebase/auth";
import { adminAuth } from "@/lib/firebase";

export const Route = createFileRoute("/notices")({
  head: () => ({
    meta: [
      { title: "Notice Board — IIT KGP Helpdesk" },
      { name: "description", content: "Create and manage campus announcements." },
      { property: "og:title", content: "Notice Board — IIT KGP Helpdesk" },
      { property: "og:description", content: "Create and manage campus announcements." },
    ],
  }),
  component: Notices,
});

type Notice = {
  id: string;
  title: string;
  body: string;
  category: string;
  pinned: boolean;
  published_at: string;
};

function Notices() {
  const [list, setList] = useState<Notice[]>([]);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("General");
  useEffect(
    () =>
      onAuthStateChanged(adminAuth, () => {
        void api<Notice[]>("/notices")
          .then(setList)
          .catch((e: unknown) =>
            setError(e instanceof Error ? e.message : "Could not load notices."),
          );
      }),
    [],
  );

  const add = async () => {
    if (!title.trim() || !body.trim()) return;
    try {
      const item = await api<Notice>("/notices", {
        method: "POST",
        body: JSON.stringify({ title: title.trim(), body: body.trim(), category, pinned: false }),
      });
      setList([item, ...list]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not publish notice.");
      return;
    }
    setTitle("");
    setBody("");
  };

  return (
    <>
      <PageHeader
        badge="Notice Board"
        title="Manage Notices"
        sub="Publish announcements students see in the helpdesk."
      />
      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="mt-5 grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="panel h-fit space-y-3 p-6">
          <h2 className="font-semibold">New notice</h2>
          <input
            className={inputCls}
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <select
            className={inputCls}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {["General", "Exams", "Library", "Fees", "Events"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <textarea
            className={inputCls}
            rows={4}
            placeholder="Message"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <button className={btnGold} onClick={add} disabled={!title.trim()}>
            <Plus className="h-4 w-4" /> Publish notice
          </button>
        </div>
        <div className="space-y-3">
          {[...list]
            .sort((a, b) => Number(b.pinned) - Number(a.pinned))
            .map((n) => (
              <div key={n.id} className="panel flex gap-4 p-5">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-accent-foreground">
                      {n.category}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(n.published_at).toLocaleDateString()}
                    </span>
                  </div>
                  <h3 className="mt-2 font-semibold">{n.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    aria-label="Pin"
                    onClick={() => {
                      const pinned = !n.pinned;
                      void api(`/notices/${n.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({ pinned }),
                      })
                        .then(() =>
                          setList(list.map((x) => (x.id === n.id ? { ...x, pinned } : x))),
                        )
                        .catch((e: unknown) =>
                          setError(e instanceof Error ? e.message : "Could not update notice."),
                        );
                    }}
                    className={`rounded-lg p-2 hover:bg-muted ${n.pinned ? "text-primary" : "text-muted-foreground"}`}
                  >
                    <Pin className="h-4 w-4" />
                  </button>
                  <button
                    aria-label="Delete"
                    onClick={() => {
                      void api(`/notices/${n.id}`, { method: "DELETE" })
                        .then(() => setList(list.filter((x) => x.id !== n.id)))
                        .catch((e: unknown) =>
                          setError(e instanceof Error ? e.message : "Could not delete notice."),
                        );
                    }}
                    className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
        </div>
      </div>
    </>
  );
}
