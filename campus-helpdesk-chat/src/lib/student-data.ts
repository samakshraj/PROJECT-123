import { queryOptions } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type Notice = {
  id: string;
  title: string;
  body: string;
  category: string;
  pinned: boolean;
  published_at: string;
};
export type Profile = {
  id: string;
  full_name: string;
  student_id: string;
  department: string;
  course: string;
  year: string;
  phone: string;
};
export type Ticket = {
  id: string;
  kind: "Complaint" | "Request";
  subject: string;
  category: string;
  description: string;
  status: "Open" | "In progress" | "Resolved";
  created_at: string;
};
export type Reminder = {
  id: string;
  title: string;
  due_at: string;
  completed: boolean;
  created_at: string;
};

export const noticeOptions = queryOptions({
  queryKey: ["notices"],
  queryFn: () => api<Notice[]>("/notices"),
});
export const profileOptions = (id: string) =>
  queryOptions({ queryKey: ["profile", id], queryFn: () => api<Profile>("/profile") });
export const ticketOptions = (id: string) =>
  queryOptions({ queryKey: ["tickets", id], queryFn: () => api<Ticket[]>("/tickets") });
export const reminderOptions = (id: string) =>
  queryOptions({ queryKey: ["reminders", id], queryFn: () => api<Reminder[]>("/reminders") });
export function pageHead(title: string, description: string) {
  return {
    meta: [
      { title: `${title} — Campus Helpdesk` },
      { name: "description", content: description },
      { property: "og:title", content: `${title} — Campus Helpdesk` },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  };
}
