import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Bell, Search } from "lucide-react";
import { useState } from "react";
import { noticeOptions, pageHead } from "@/lib/student-data";
import { ScreenHeading } from "@/components/screen-heading";
export const Route = createFileRoute("/notices")({
  head: () => pageHead("Notice board", "The latest campus announcements and student notices."),
  loader: ({ context }) => context.queryClient.ensureQueryData(noticeOptions),
  component: NoticeBoard,
});
function NoticeBoard() {
  const { data } = useSuspenseQuery(noticeOptions);
  const [search, setSearch] = useState("");
  const visible = data.filter((n) =>
    `${n.title} ${n.body} ${n.category}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <section className="student-screen">
      <ScreenHeading title="Notice board" subtitle="The latest from your campus." />
      <label className="student-search">
        <Search />
        <input
          aria-label="Search notices"
          className="student-input"
          placeholder="Search announcements…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      {visible.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {visible.map((n) => (
            <article key={n.id} className="student-item">
              <div className="mb-4 flex items-center justify-between gap-3 text-xs">
                <span className="rounded-md bg-accent px-2 py-1 font-semibold text-primary">
                  {n.category}
                </span>
                <time className="text-muted-foreground">
                  {new Date(n.published_at).toLocaleDateString("en-GB")}
                </time>
              </div>
              <h2 className="mb-3 text-lg font-bold">{n.title}</h2>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                {n.body}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <Bell className="size-9 text-primary" />
          <h2>{search ? "No matching notices" : "All caught up"}</h2>
          <p>
            {search
              ? "Try a different search."
              : "No campus announcements have been published yet."}
          </p>
        </div>
      )}
    </section>
  );
}
