import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  BookOpen,
  CalendarDays,
  GraduationCap,
  MessageSquarePlus,
  Send,
  Trash2,
  Utensils,
  X,
} from "lucide-react";
import orb from "@/assets/orb.png";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useStudentAccount } from "@/components/student-account";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "IIT KHARAGPUR — Welcome Student" },
      {
        name: "description",
        content: "Your friendly campus helpdesk chatbot for exams, library, events and more.",
      },
      { property: "og:title", content: "IIT KHARAGPUR — Welcome Student" },
      {
        property: "og:description",
        content: "Ask anything about campus life: exams, library, fees, events.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Sora:wght@600;700;800&display=swap",
      },
    ],
  }),
  component: Index,
});

type Msg = { role: "user" | "bot"; text: string };
type ChatSession = { session_id: string; title: string; updated_at: string; message_count: number };
const newSessionId = () =>
  globalThis.crypto?.randomUUID?.() ||
  `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const chips = [
  { icon: CalendarDays, label: "Exam Schedule" },
  { icon: BookOpen, label: "Library Hours" },
  { icon: GraduationCap, label: "Admissions & Fees" },
  { icon: Utensils, label: "Cafeteria Menu" },
];

const letterHues = [
  "oklch(0.72 0.18 300)",
  "oklch(0.66 0.17 262)",
  "oklch(0.78 0.12 310)",
  "oklch(0.7 0.13 250)",
  "oklch(0.75 0.11 190)",
];

const ragApiUrl = (import.meta.env["VITE_RAG_API_URL"] || "http://127.0.0.1:8000").replace(
  /\/$/,
  "",
);

function Index() {
  const { user } = useStudentAccount();
  const userId = user?.uid;
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, typing]);
  const loadSessions = useCallback(() => {
    if (!userId) {
      setSessions([]);
      return;
    }
    setLoadingSessions(true);
    void api<ChatSession[]>("/chat-sessions")
      .then(setSessions)
      .catch(() => setSessions([]))
      .finally(() => setLoadingSessions(false));
  }, [userId]);
  useEffect(() => {
    setSessionId(newSessionId());
    setMsgs([]);
    if (userId) loadSessions();
    else setSessions([]);
  }, [loadSessions, userId]);
  useEffect(() => {
    inputRef.current?.focus();
  }, [typing]);

  const send = (text: string) => {
    const q = text.trim();
    if (!q || typing) return;
    const currentSessionId = sessionId || newSessionId();
    if (!sessionId) setSessionId(currentSessionId);
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setInput("");
    setTyping(true);
    void fetch(`${ragApiUrl}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: q }),
    })
      .then(async (response) => {
        const data: { answer?: string; detail?: string } = await response.json();
        if (!response.ok)
          throw new Error(data.detail || "The helpdesk service could not answer right now.");
        if (!data.answer) throw new Error("The helpdesk service returned an empty answer.");
        setMsgs((m) => [...m, { role: "bot", text: data.answer! }]);
        if (user)
          void api("/chat-history", {
            method: "POST",
            body: JSON.stringify({
              session_id: currentSessionId,
              question: q,
              answer: data.answer,
            }),
          })
            .then(loadSessions)
            .catch(() => {});
      })
      .catch((error: unknown) => {
        const message =
          error instanceof Error && error.message.includes("Failed to fetch")
            ? "I can't reach the helpdesk service right now. Please check that the RAG service is running and try again."
            : error instanceof Error
              ? error.message
              : "Something went wrong. Please try again.";
        setMsgs((m) => [...m, { role: "bot", text: message }]);
      })
      .finally(() => setTyping(false));
  };

  const started = msgs.length > 0;
  const word = "WELCOME STUDENT";

  const startFreshChat = () => {
    if (typing) return;
    setMsgs([]);
    setInput("");
    setSessionId(newSessionId());
  };
  const openSession = async (session: ChatSession) => {
    if (typing) return;
    try {
      const history = await api<{ question: string; answer: string }[]>(
        `/chat-sessions/${encodeURIComponent(session.session_id)}`,
      );
      setSessionId(session.session_id);
      setMsgs(
        history.flatMap((item) => [
          { role: "user" as const, text: item.question },
          { role: "bot" as const, text: item.answer },
        ]),
      );
    } catch {
      /* Keep the current conversation if an older session cannot be loaded. */
    }
  };
  const clearCurrentChat = async () => {
    if (typing) return;
    if (user && sessionId && started) {
      try {
        await api(`/chat-sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
        loadSessions();
      } catch {
        return;
      }
    }
    startFreshChat();
  };
  const deleteSession = async (event: React.MouseEvent, session: ChatSession) => {
    event.stopPropagation();
    if (typing) return;
    try {
      await api(`/chat-sessions/${encodeURIComponent(session.session_id)}`, { method: "DELETE" });
      setSessions((items) => items.filter((item) => item.session_id !== session.session_id));
      if (sessionId === session.session_id) startFreshChat();
    } catch {
      /* Retain the session if deletion failed. */
    }
  };

  return (
    <main className="campus-chat relative min-h-full">
      <div className="chat-layout relative z-10">
        <div className="chat-main flex min-w-0 flex-col">
          <header className="px-6 pt-10 text-center">
            <p className="header-badge mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-4 py-1.5 text-xs font-semibold tracking-wide text-muted-foreground">
              <GraduationCap className="h-4 w-4 text-primary" /> IIT KHARAGPUR
            </p>
            <h1
              className={`welcome-title font-display font-extrabold transition-all duration-500 ${started ? "text-3xl md:text-4xl" : "text-4xl md:text-5xl"}`}
            >
              {word.split(" ").map((w, wi) => (
                <span className="inline-block" key={w}>
                  {w.split("").map((c, i) => (
                    <span
                      key={i}
                      className="letter-pop title-gradient"
                      style={
                        {
                          animationDelay: `${i * 0.05}s`,
                          "--lh": letterHues[i % letterHues.length],
                        } as CSSProperties
                      }
                    >
                      {c === " " ? "\u00A0" : c}
                    </span>
                  ))}
                </span>
              ))}
            </h1>
            {!started && (
              <p className="mt-4 text-muted-foreground">
                Ask me anything about classes, exams, library, fees or campus life.
              </p>
            )}
          </header>

          <section className="relative flex flex-1 flex-col overflow-hidden">
            {!started ? (
              <div className="relative flex flex-1 items-center justify-center py-6">
                <div className="grid-dots absolute inset-0" />
                <div className="relative">
                  <div className="orb-halo" />
                  <img
                    src={orb}
                    alt="Helpdesk assistant orb"
                    width={816}
                    height={816}
                    className="animate-floaty relative w-56 md:w-72 drop-shadow-xl"
                  />
                </div>
              </div>
            ) : (
              <div
                className="mx-auto w-full max-w-3xl flex-1 space-y-4 overflow-y-auto px-6 py-6"
                style={{ maxHeight: "55vh" }}
              >
                {msgs.map((m, i) => (
                  <div
                    key={i}
                    className={`msg-in flex items-end gap-2 ${m.role === "user" ? "justify-end" : ""}`}
                  >
                    {m.role === "bot" && <img src={orb} alt="" className="h-8 w-8" />}
                    <div
                      className={
                        m.role === "user"
                          ? "bubble-user max-w-[75%] rounded-2xl rounded-br-sm px-4 py-2.5 text-primary-foreground shadow-md"
                          : "bubble-bot max-w-[80%] text-foreground"
                      }
                    >
                      {m.text.split("**").map((p, j) => (j % 2 ? <strong key={j}>{p}</strong> : p))}
                    </div>
                  </div>
                ))}
                {typing && (
                  <div className="flex items-center gap-2">
                    <img src={orb} alt="" className="h-8 w-8 animate-spin" />
                    <span className="flex items-center gap-1 rounded-full border border-border bg-card px-3 py-2">
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                    </span>
                  </div>
                )}
                <div ref={endRef} />
              </div>
            )}
          </section>

          <footer className="mx-auto w-full max-w-3xl px-4 pb-8">
            <div className="mb-3 flex flex-wrap justify-center gap-2">
              {chips.map(({ icon: Icon, label }) => (
                <Button
                  variant="outline"
                  disabled={typing}
                  key={label}
                  onClick={() => send(label)}
                  className="chip h-auto rounded-full bg-card/80 px-4 py-2 text-xs text-foreground transition hover:-translate-y-0.5 hover:border-primary"
                >
                  <Icon className="h-4 w-4" /> <span className="chip-label">{label}</span>
                </Button>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
              className="ring-gradient rounded-3xl p-2 shadow-soft"
            >
              <div className="rounded-2xl bg-background p-3">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send(input);
                    }
                  }}
                  rows={2}
                  placeholder="Ask me anything about campus…"
                  aria-label="Campus question"
                  className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                <div className="flex items-center justify-end">
                  <Button
                    type="submit"
                    disabled={!input.trim() || typing}
                    className="btn-send h-8 rounded-full px-4 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Send
                  </Button>
                </div>
              </div>
            </form>
          </footer>
        </div>
        <aside className="chat-history panel" aria-label="Chat history">
          <div className="flex items-center justify-between gap-2 border-b border-border p-4">
            <div>
              <h2 className="font-display font-bold">Chat history</h2>
              <p className="text-xs text-muted-foreground">Previous conversations</p>
            </div>
            <button
              type="button"
              className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
              onClick={startFreshChat}
              disabled={typing}
              title="Start a new chat"
              aria-label="Start a new chat"
            >
              <MessageSquarePlus className="h-5 w-5" />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2">
            {!user ? (
              <p className="p-3 text-sm text-muted-foreground">
                Sign in to save and view previous chats.
              </p>
            ) : loadingSessions ? (
              <p className="p-3 text-sm text-muted-foreground">Loading chat history…</p>
            ) : sessions.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">
                Your previous chats will appear here.
              </p>
            ) : (
              sessions.map((session) => (
                <div
                  key={session.session_id}
                  className={`group flex items-center gap-1 rounded-xl ${sessionId === session.session_id && started ? "bg-accent" : "hover:bg-muted"}`}
                >
                  <button
                    type="button"
                    onClick={() => void openSession(session)}
                    disabled={typing}
                    className="min-w-0 flex-1 px-3 py-2.5 text-left disabled:opacity-50"
                  >
                    <span className="block truncate text-sm font-medium">{session.title}</span>
                    <span className="mt-1 block text-[11px] text-muted-foreground">
                      {new Date(session.updated_at).toLocaleDateString()} · {session.message_count}{" "}
                      {session.message_count === 1 ? "question" : "questions"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={(event) => void deleteSession(event, session)}
                    disabled={typing}
                    className="mr-1 rounded-lg p-2 text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus:opacity-100"
                    title="Delete this conversation"
                    aria-label={`Delete conversation: ${session.title}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-border p-3">
            <button
              type="button"
              onClick={() => void clearCurrentChat()}
              disabled={typing || !started}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" />
              Clear chat
            </button>
            {started && (
              <button
                type="button"
                onClick={startFreshChat}
                disabled={typing}
                className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
                title="Close conversation"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
