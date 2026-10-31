import { useEffect, useRef, useState } from "react";
import { Bot, Send, Sparkles, UserRound } from "lucide-react";

type Message = { role: "admin" | "assistant"; text: string };

const apiUrl = (import.meta.env["VITE_RAG_API_URL"] || "http://127.0.0.1:8000").replace(/\/$/, "");
const prompts = ["What is the exam schedule?", "What are the library hours?"];

export function AdminAiChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, loading]);

  async function ask(value: string) {
    const text = value.trim();
    if (!text || loading) return;
    setMessages((current) => [...current, { role: "admin", text }]);
    setQuestion("");
    setLoading(true);
    try {
      const response = await fetch(`${apiUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        answer?: string;
        detail?: string;
      };
      if (!response.ok)
        throw new Error(data.detail || "The helpdesk service could not answer right now.");
      if (!data.answer) throw new Error("The helpdesk service returned an empty answer.");
      setMessages((current) => [...current, { role: "assistant", text: data.answer! }]);
    } catch (error) {
      const message =
        error instanceof Error && error.message.includes("Failed to fetch")
          ? "I can’t reach the helpdesk service. Check that the RAG API is running and try again."
          : error instanceof Error
            ? error.message
            : "Something went wrong. Please try again.";
      setMessages((current) => [...current, { role: "assistant", text: message }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel mt-5 overflow-hidden" aria-labelledby="admin-ai-chat-title">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-primary">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <h2 id="admin-ai-chat-title" className="font-display text-lg font-bold">
              Test the campus AI
            </h2>
            <p className="text-xs text-muted-foreground">
              Ask questions against the student chatbot’s current PDF index.
            </p>
          </div>
        </div>
        <span className="rounded-full border border-border bg-background/70 px-3 py-1 text-xs font-medium text-muted-foreground">
          AI assistant
        </span>
      </header>

      <div
        className="space-y-3 overflow-y-auto px-5 py-5 sm:px-6"
        style={{ minHeight: 150, maxHeight: 360 }}
        aria-live="polite"
        aria-label="Chat messages"
      >
        {messages.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-background/50 px-5 py-6 text-center">
            <Bot className="mx-auto h-7 w-7 text-primary" />
            <p className="mt-2 text-sm font-semibold">Try a question from the campus documents</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Answers use the same indexed PDFs as the student chatbot.
            </p>
          </div>
        )}
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`flex items-start gap-2.5 ${message.role === "admin" ? "justify-end" : "justify-start"}`}
          >
            {message.role === "assistant" && (
              <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
                <Bot className="h-4 w-4" />
              </span>
            )}
            <div
              className={
                message.role === "admin"
                  ? "max-w-[82%] rounded-2xl rounded-br-sm bg-gold px-4 py-2.5 text-sm text-primary-foreground shadow-sm"
                  : "max-w-[88%] rounded-2xl rounded-bl-sm border border-border bg-background/80 px-4 py-2.5 text-sm text-foreground shadow-sm"
              }
            >
              {message.text}
            </div>
            {message.role === "admin" && (
              <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <UserRound className="h-4 w-4" />
              </span>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-primary">
              <Bot className="h-4 w-4" />
            </span>
            <span className="animate-pulse">Searching campus documents…</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {messages.length === 0 && (
        <div className="flex flex-wrap gap-2 px-5 pb-4 sm:px-6">
          {prompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              disabled={loading}
              onClick={() => void ask(prompt)}
              className="rounded-full border border-border bg-background/70 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary hover:bg-accent hover:text-primary disabled:opacity-50"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void ask(question);
        }}
        className="border-t border-border bg-background/45 p-4 sm:px-6"
      >
        <div className="flex items-end gap-2 rounded-2xl border border-border bg-card p-2 shadow-sm transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void ask(question);
              }
            }}
            rows={2}
            maxLength={2000}
            aria-label="Ask the campus AI"
            placeholder="Ask a campus question…"
            className="min-h-12 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            disabled={!question.trim() || loading}
            className="admin-button shrink-0 px-4 py-2 disabled:cursor-not-allowed"
            aria-label="Send question"
          >
            <Send className="h-4 w-4" />
            <span className="hidden sm:inline">Ask</span>
          </button>
        </div>
        <p className="mt-2 px-1 text-[11px] leading-5 text-muted-foreground">
          Uploaded PDFs are added to the chatbot index after processing. DOC and DOCX files are
          saved but are not indexed.
        </p>
      </form>
    </section>
  );
}
