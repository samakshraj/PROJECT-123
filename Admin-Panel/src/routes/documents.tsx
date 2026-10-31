import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, FileText, Loader2, Trash2, UploadCloud } from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import { PageHeader, btnGold } from "@/components/AdminSidebar";
import { adminAuth } from "@/lib/firebase";
import { api } from "@/lib/api";

export const Route = createFileRoute("/documents")({
  head: () => ({
    meta: [
      { title: "Document Management — IIT KGP Helpdesk" },
      { name: "description", content: "Upload and manage campus helpdesk documents." },
      { property: "og:title", content: "Document Management — IIT KGP Helpdesk" },
      { property: "og:description", content: "Upload and manage campus helpdesk documents." },
    ],
  }),
  component: Documents,
});

type Doc = {
  id: string;
  filename: string;
  content_type: string;
  file_size: number;
  uploaded_at: string;
  index_status: "stored" | "processing" | "indexed" | "error";
  index_error: string;
};
const ACCEPT = ".pdf,.doc,.docx";
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const okType = (name: string) => /\.(pdf|docx?)$/i.test(name);
const fmt = (bytes: number) =>
  bytes >= 1_000_000
    ? `${(bytes / 1_000_000).toFixed(1)} MB`
    : bytes >= 1_000
      ? `${Math.ceil(bytes / 1_000)} KB`
      : `${bytes} B`;
const apiError = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message === "Not Found") {
    return "The configured helpdesk API does not have document storage enabled yet. Restart or redeploy the shared FastAPI service, then refresh this page.";
  }
  return error instanceof Error ? error.message : fallback;
};

function Documents() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [drag, setDrag] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const indexing = docs.some((document) => document.index_status === "processing");

  useEffect(
    () =>
      onAuthStateChanged(adminAuth, (user) => {
        if (!user) {
          setDocs([]);
          setLoading(false);
          setError("Sign in as an administrator to manage documents.");
          return;
        }
        setLoading(true);
        void api<Doc[]>("/admin/documents")
          .then((items) => {
            setDocs(items);
            setError("");
          })
          .catch((err: unknown) => setError(apiError(err, "Could not load saved documents.")))
          .finally(() => setLoading(false));
      }),
    [],
  );

  useEffect(() => {
    if (!indexing) return;
    const timer = window.setInterval(() => {
      void api<Doc[]>("/admin/documents")
        .then(setDocs)
        .catch(() => {});
    }, 2000);
    return () => window.clearInterval(timer);
  }, [indexing]);

  const addFiles = async (files: FileList | null) => {
    if (!files?.length || uploading) return;
    const selected = Array.from(files);
    const invalid = selected.filter(
      (file) => !okType(file.name) || file.size > MAX_FILE_SIZE || file.size === 0,
    );
    const valid = selected.filter(
      (file) => okType(file.name) && file.size <= MAX_FILE_SIZE && file.size > 0,
    );
    const messages = invalid.map((file) => {
      if (!okType(file.name)) return `${file.name}: unsupported type (PDF, DOC, and DOCX only).`;
      if (file.size > MAX_FILE_SIZE) return `${file.name}: larger than the 25 MB limit.`;
      return `${file.name}: file is empty.`;
    });
    setError(messages.join(" "));
    if (!valid.length) return;

    setUploading(true);
    for (const file of valid) {
      try {
        const saved = await api<Doc>(`/admin/documents?filename=${encodeURIComponent(file.name)}`, {
          method: "POST",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        setDocs((current) => [saved, ...current]);
      } catch (err) {
        const message = apiError(err, "Upload failed.");
        setError((current) => [current, `${file.name}: ${message}`].filter(Boolean).join(" "));
      }
    }
    setUploading(false);
  };

  const removeDocument = async (document: Doc) => {
    setDeleting(document.id);
    setError("");
    try {
      await api(`/admin/documents/${encodeURIComponent(document.id)}`, { method: "DELETE" });
      setDocs((current) => current.filter((item) => item.id !== document.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the document.");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <>
      <PageHeader
        badge="Knowledge Base"
        title="Document Management"
        sub="Uploaded PDFs are extracted, chunked, and added to the chatbot index. Word documents are saved but not indexed."
      >
        <button className={btnGold} onClick={() => input.current?.click()} disabled={uploading}>
          <UploadCloud className="h-4 w-4" /> {uploading ? "Saving files…" : "Upload files"}
        </button>
      </PageHeader>
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPT}
        hidden
        onChange={(event) => {
          void addFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDrag(false);
          void addFiles(event.dataTransfer.files);
        }}
        onClick={() => input.current?.click()}
        className={`dots mt-5 flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed p-6 text-center transition ${drag ? "border-primary bg-accent" : "hover:border-primary"} ${uploading ? "pointer-events-none opacity-60" : ""}`}
      >
        <div className="orb flex h-14 w-14 items-center justify-center rounded-full">
          <UploadCloud className="h-8 w-8 text-primary-foreground" />
        </div>
        <p className="mt-3 font-semibold">Drag & drop documents here</p>
        <p className="text-sm text-muted-foreground">
          PDF, DOC, DOCX · up to 25 MB per file · PDFs are indexed for AI answers
        </p>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="panel mt-4 divide-y">
        {loading ? (
          <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading saved documents…
          </p>
        ) : docs.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            No documents saved yet. Upload a PDF or Word document to get started.
          </p>
        ) : (
          docs.map((document) => (
            <div key={document.id} className="flex min-w-0 items-center gap-3 p-3 sm:gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                <FileText className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium" title={document.filename}>
                  {document.filename}
                </div>
                <div className="text-xs text-muted-foreground">
                  {fmt(document.file_size)} · {new Date(document.uploaded_at).toLocaleString()}
                </div>
              </div>
              {document.index_status === "indexed" ? (
                <span className="hidden items-center gap-1 text-xs font-semibold text-success sm:flex">
                  <CheckCircle2 className="h-4 w-4" /> Indexed
                </span>
              ) : document.index_status === "processing" ? (
                <span className="hidden items-center gap-1 text-xs font-semibold text-accent-foreground sm:flex">
                  <Loader2 className="h-4 w-4 animate-spin" /> Indexing
                </span>
              ) : document.index_status === "error" ? (
                <span
                  className="hidden max-w-48 items-center gap-1 truncate text-xs font-semibold text-destructive sm:flex"
                  title={document.index_error}
                >
                  <FileText className="h-4 w-4 shrink-0" /> Index failed
                </span>
              ) : (
                <span className="hidden items-center gap-1 text-xs font-semibold text-muted-foreground sm:flex">
                  <CheckCircle2 className="h-4 w-4" /> Saved
                </span>
              )}
              <button
                type="button"
                aria-label={`Delete ${document.filename}`}
                disabled={deleting === document.id}
                onClick={() => void removeDocument(document)}
                className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"
              >
                {deleting === document.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </button>
            </div>
          ))
        )}
      </div>
    </>
  );
}
