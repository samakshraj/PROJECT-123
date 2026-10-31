import { adminAuth } from "./firebase";

const API_URL = (import.meta.env["VITE_RAG_API_URL"] || "http://127.0.0.1:8000").replace(/\/$/, "");
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await adminAuth.currentUser?.getIdToken();
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { detail?: string };
    throw new Error(payload.detail || "The helpdesk API request failed.");
  }
  return response.json() as Promise<T>;
}
